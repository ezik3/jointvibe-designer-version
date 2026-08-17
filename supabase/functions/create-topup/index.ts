import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Returns true when the Crossmint error string means onramp is not yet live in production */
function isOnrampNotEnabledError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('onramp is not yet enabled') ||
    lower.includes('onramp not yet enabled') ||
    lower.includes('onramp not enabled') ||
    lower.includes('not yet enabled for production')
  );
}

serve(async (req) => {
  console.log("🚀 create-topup hit");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract user info from auth
    const authHeader = req.headers.get('Authorization');
    let userEmail = 'unknown@user.com';
    let userId = 'unknown';

    if (authHeader) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) userEmail = user.email;
        if (user?.id) userId = user.id;
      } catch (e) {
        console.warn("Could not extract user email:", e.message);
      }
    }

    const { amount, currency, country_code } = await req.json();
    console.log("📦 Request:", { amount, currency, country_code, userEmail, userId });

    const crossmintApiKey = Deno.env.get('CROSSMINT_API_KEY');
    if (!crossmintApiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Gateway API key not configured'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Determine staging vs production from the key prefix
    const isStaging = crossmintApiKey.startsWith('sk_staging_');
    const baseUrl = isStaging
      ? 'https://staging.crossmint.com'
      : 'https://www.crossmint.com';

    console.log("🔑 Key type:", isStaging ? 'staging' : 'production');

    // Use Crossmint Headless Checkout: POST /api/2022-06-09/orders
    const orderUrl = `${baseUrl}/api/2022-06-09/orders`;
    console.log("🌐 Crossmint order URL:", orderUrl);

    const usdcLocator = isStaging
      ? "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
      : "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

    const orderPayload = {
      recipient: {
        email: userEmail,
      },
      locale: "en-US",
      payment: {
        method: "card",
        receiptEmail: userEmail,
      },
      lineItems: [
        {
          tokenLocator: usdcLocator,
          executionParameters: {
            mode: "exact-in",
            amount: String(amount),
          },
        },
      ],
    };

    console.log("📤 Order payload:", JSON.stringify(orderPayload));

    const orderRes = await fetch(orderUrl, {
      method: "POST",
      headers: {
        "X-API-KEY": crossmintApiKey.trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const responseText = await orderRes.text();
    console.log("📡 Crossmint status:", orderRes.status);
    console.log("🔥 Crossmint FULL response:", responseText);

    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!orderRes.ok) {
      console.error("❌ Crossmint order error:", orderRes.status, responseText);

      // Detect "onramp not yet enabled in production" — fail gracefully, no crash
      const errorDetail: string =
        responseData?.message ||
        responseData?.error ||
        responseData?.detail ||
        responseText;

      if (isOnrampNotEnabledError(errorDetail)) {
        console.warn("⚠️ Crossmint onramp not yet enabled for production");
        return new Response(JSON.stringify({
          success: false,
          error: 'GATEWAY_NOT_ENABLED',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: `Crossmint API error: ${orderRes.status}`,
        detail: responseData.message || responseText,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Extract checkout URL from response
    const orderId = responseData.orderId || responseData.order?.orderId;
    const checkoutUrl =
      responseData.checkoutUrl ||
      responseData.order?.checkoutUrl ||
      responseData.payment?.preparation?.payerUrl ||
      null;

    console.log("📋 Order ID:", orderId);
    console.log("✅ Checkout URL:", checkoutUrl);

    if (checkoutUrl) {
      return new Response(JSON.stringify({
        success: true,
        checkout_url: checkoutUrl,
        order_id: orderId,
        provider: 'crossmint',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // If no checkoutUrl but we have an orderId, construct the hosted checkout URL
    if (orderId) {
      const hostedUrl = `${baseUrl}/checkout?orderId=${orderId}`;
      console.log("🔗 Constructed hosted checkout URL:", hostedUrl);
      return new Response(JSON.stringify({
        success: true,
        checkout_url: hostedUrl,
        order_id: orderId,
        provider: 'crossmint',
        method: 'hosted_checkout',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // No URL and no orderId
    return new Response(JSON.stringify({
      success: false,
      error: 'No checkout URL or order ID in Crossmint response',
      response: responseData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (err) {
    console.error("❌ Unexpected error:", err);

    // Also catch "not yet enabled" if it surfaces as a thrown exception
    if (isOnrampNotEnabledError((err as Error).message || '')) {
      console.warn("⚠️ Crossmint onramp not yet enabled (exception path)");
      return new Response(JSON.stringify({
        success: false,
        error: 'GATEWAY_NOT_ENABLED',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: (err as Error).message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  }
});
