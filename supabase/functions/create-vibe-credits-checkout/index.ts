import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-VIBE-CREDITS-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    }
  );

  // Service-role client for venue verification
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    logStep("Function started");

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { venueId, credits, reachTier, price, origin: clientOrigin } = await req.json();

    if (!venueId || !credits || !reachTier || !price) {
      throw new Error("Missing required fields: venueId, credits, reachTier, price");
    }

    // Verify venue is verified before allowing credit purchase
    const { data: venue, error: venueError } = await supabaseAdmin
      .from('venues')
      .select('id, owner_user_id, verified_at, venue_status')
      .eq('id', venueId)
      .single();

    if (venueError || !venue) throw new Error("Venue not found");
    if (venue.owner_user_id !== user.id) throw new Error("Not the venue owner");
    if (!venue.verified_at && venue.venue_status !== 'testing') {
      logStep("Purchase blocked – venue not verified and not in testing mode");
      throw new Error("Please complete venue verification before purchasing credits.");
    }

    logStep("Vibe credits purchase details", { venueId, credits, reachTier, price });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    const rawHttpOrigin = req.headers.get("origin");
    logStep("Origin resolution inputs", {
      clientOrigin: clientOrigin ?? "(not set)",
      httpOrigin: rawHttpOrigin ?? "(not set)",
    });
    const origin = (
      clientOrigin ||
      rawHttpOrigin ||
      "https://www.jointvibe.app"
    ).replace(/\/$/, "");

    const successUrl = `${origin}/?checkout_return=wallet&vibe_credits_added=true&vibe_credits_expected=${credits}&vibe_reach_tier=${reachTier}`;
    const cancelUrl = `${origin}/?checkout_return=wallet&vibe_credits_cancelled=true`;
    logStep("Checkout URLs", { origin, successUrl, cancelUrl });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Vibe Credits — ${reachTier.charAt(0).toUpperCase() + reachTier.slice(1)} Reach`,
              description: `${credits} vibe push credits (${reachTier} reach)`,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'vibe_credits_purchase',
        venue_id: venueId,
        credits: String(credits),
        reach_tier: reachTier,
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
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
