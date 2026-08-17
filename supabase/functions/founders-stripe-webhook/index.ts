import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.190.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const length = 12;
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code.match(/.{1,3}/g)!.join('-');
}

async function hashClaimCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(new Uint8Array(hashBuffer));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) return new Response("Stripe not configured", { status: 500 });

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("FOUNDERS_STRIPE_WEBHOOK_SECRET");
  const body = await req.text();

  // SECURITY: Webhook secret and signature are MANDATORY
  if (!webhookSecret) {
    console.error("FATAL: FOUNDERS_STRIPE_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 500 });
  }
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), { status: 401 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Idempotency check
  const { data: existing } = await supabase
    .from("founder_webhook_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("founder_webhook_events").insert({
    id: event.id,
    event_type: event.type,
    payload: event,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "payment" || session.payment_status !== "paid") break;

        const cityProductId = session.metadata?.city_product_id;
        const passType = session.metadata?.pass_type || "user";
        const customerEmail = session.customer_email || session.customer_details?.email;

        if (!cityProductId || !customerEmail) break;

        const claimCode = generateClaimCode();
        const claimCodeHash = await hashClaimCode(claimCode);
        const claimCodePrefix = claimCode.split("-")[0];

        await supabase.from("founders_purchases").insert({
          city_product_id: cityProductId,
          pass_type: passType,
          stripe_checkout_session_id: session.id,
          stripe_customer_id: (session.customer as string) || null,
          purchaser_email: customerEmail,
          claim_code_hash: claimCodeHash,
          claim_code_prefix: claimCodePrefix,
          status: "paid",
          purchased_at: new Date().toISOString(),
        });

        // Increment sold count
        const { data: city } = await supabase
          .from("city_products")
          .select("sold_count, city, country")
          .eq("id", cityProductId)
          .single();

        if (city) {
          await supabase
            .from("city_products")
            .update({ sold_count: city.sold_count + 1 })
            .eq("id", cityProductId);
        }

        // Send claim email
        try {
          await supabase.functions.invoke("founders-send-claim-email", {
            body: {
              email: customerEmail,
              claimCode,
              cityName: city?.city || "Your City",
              countryName: city?.country || "",
              passType,
            },
          });
        } catch (e) {
          console.error("Failed to send claim email:", e);
        }

        await supabase.from("founder_audit_logs").insert({
          action: "LICENSE_PURCHASED",
          entity_type: "founders_purchase",
          entity_id: session.id,
          details: { city_product_id: cityProductId, email: customerEmail, pass_type: passType },
        });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;
        if (!paymentIntentId) break;

        const sessions = await stripe.checkout.sessions.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });

        if (sessions.data.length > 0) {
          const sessionId = sessions.data[0].id;
          await supabase
            .from("founders_purchases")
            .update({ status: "refunded" })
            .eq("stripe_checkout_session_id", sessionId);

          const { data: purchase } = await supabase
            .from("founders_purchases")
            .select("claimed_by_user_id")
            .eq("stripe_checkout_session_id", sessionId)
            .maybeSingle();

          if (purchase?.claimed_by_user_id) {
            await supabase
              .from("founder_entitlements")
              .update({ status: "canceled", end_at: new Date().toISOString() })
              .eq("user_id", purchase.claimed_by_user_id);
          }
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
