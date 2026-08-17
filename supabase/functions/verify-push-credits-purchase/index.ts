import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-PUSH-CREDITS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    logStep("Function started");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const user = userData.user;
    logStep("User authenticated", { userId: user.id });

    const { sessionId, venueId, reachTier } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");
    if (!venueId) throw new Error("Missing venueId");
    if (!reachTier) throw new Error("Missing reachTier");
    logStep("Request params", { sessionId, venueId, reachTier });

    // Verify user owns this venue
    const { data: venue } = await supabaseAdmin
      .from('venues')
      .select('id, owner_user_id')
      .eq('id', venueId)
      .eq('owner_user_id', user.id)
      .single();

    if (!venue) throw new Error("Venue not found or not owned by user");
    logStep("Venue ownership verified");

    // Check idempotency: was this session already fulfilled?
    const { data: existing } = await supabaseAdmin
      .from('push_credit_fulfillments')
      .select('id, credits_granted')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (existing) {
      logStep("Session already fulfilled", { fulfillmentId: existing.id, credits: existing.credits_granted });
      // Return current credits without double-granting
      const { data: currentCredits } = await supabaseAdmin
        .from('venue_push_credits')
        .select('reach_tier, credits_remaining')
        .eq('venue_id', venueId);

      const creditsMap: Record<string, number> = {};
      currentCredits?.forEach((r: any) => {
        creditsMap[r.reach_tier] = (creditsMap[r.reach_tier] || 0) + r.credits_remaining;
      });

      return new Response(JSON.stringify({
        success: true,
        credited: true,
        alreadyFulfilled: true,
        credits: creditsMap,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Retrieve the exact Stripe checkout session
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    logStep("Stripe session retrieved", {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
    });

    // Validate session
    if (session.status !== 'complete') {
      throw new Error(`Session not complete. Status: ${session.status}`);
    }
    if (session.payment_status !== 'paid') {
      throw new Error(`Payment not confirmed. Payment status: ${session.payment_status}`);
    }

    // Validate metadata matches
    const meta = session.metadata;
    if (meta?.type !== 'push_credits_purchase') {
      throw new Error("Session is not a push credits purchase");
    }
    if (meta?.venue_id !== venueId) {
      throw new Error("Session venue_id does not match");
    }
    if (meta?.reach_tier !== reachTier) {
      throw new Error("Session reach_tier does not match");
    }

    const creditsToAdd = parseInt(meta.credits || '0');
    if (creditsToAdd <= 0) {
      throw new Error("Invalid credits amount in session metadata");
    }

    logStep("Session validated", { creditsToAdd, reachTier });

    // Grant credits
    const { data: existingCredits } = await supabaseAdmin
      .from('venue_push_credits')
      .select('credits_remaining')
      .eq('venue_id', venueId)
      .eq('reach_tier', reachTier)
      .eq('credit_type', 'purchase')
      .maybeSingle();

    const newTotal = (existingCredits?.credits_remaining || 0) + creditsToAdd;

    const { error: upsertError } = await supabaseAdmin
      .from('venue_push_credits')
      .upsert({
        venue_id: venueId,
        reach_tier: reachTier,
        credit_type: 'purchase',
        credits_remaining: newTotal,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'venue_id,reach_tier,credit_type' });

    if (upsertError) {
      logStep("Credit upsert error", { error: upsertError.message });
      throw new Error(`Failed to grant credits: ${upsertError.message}`);
    }

    logStep("Credits granted", { newTotal });

    // Record fulfillment for idempotency
    const { error: fulfillmentError } = await supabaseAdmin
      .from('push_credit_fulfillments')
      .insert({
        stripe_session_id: sessionId,
        venue_id: venueId,
        reach_tier: reachTier,
        credits_granted: creditsToAdd,
        amount_cents: session.amount_total || 0,
        fulfilled_by: user.id,
      });

    if (fulfillmentError) {
      // Non-fatal if credits were already granted
      logStep("Fulfillment record insert warning", { error: fulfillmentError.message });
    } else {
      logStep("Fulfillment recorded");
    }

    // Fetch and return current credits
    const { data: currentCredits } = await supabaseAdmin
      .from('venue_push_credits')
      .select('reach_tier, credits_remaining')
      .eq('venue_id', venueId);

    const creditsMap: Record<string, number> = {};
    currentCredits?.forEach((r: any) => {
      creditsMap[r.reach_tier] = (creditsMap[r.reach_tier] || 0) + r.credits_remaining;
    });

    logStep("Returning final credits", { credits: creditsMap });

    return new Response(JSON.stringify({
      success: true,
      credited: true,
      creditsGranted: creditsToAdd,
      credits: creditsMap,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
