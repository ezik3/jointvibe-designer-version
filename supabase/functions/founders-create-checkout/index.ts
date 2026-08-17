import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { citySlug, passType } = await req.json();

    if (!citySlug) throw new Error("City slug is required");
    if (!passType || !["user", "venue"].includes(passType)) {
      throw new Error("passType must be 'user' or 'venue'");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get city product by slug AND pass_type
    const { data: city, error: cityError } = await supabase
      .from("city_products")
      .select("*")
      .eq("slug", citySlug)
      .eq("pass_type", passType)
      .eq("is_active", true)
      .single();

    if (cityError || !city) {
      throw new Error("City not found or unavailable");
    }

    // Check inventory
    const remaining = city.total_supply - city.sold_count;
    if (remaining <= 0) {
      throw new Error("This city is sold out");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get or create Stripe price
    let priceId = city.stripe_price_id;

    if (!priceId) {
      const licenseLabel = passType === "venue" ? "Venue Founders License" : "City Founders License";
      const product = await stripe.products.create({
        name: `${licenseLabel} - ${city.city}`,
        description: `Exclusive ${licenseLabel} for ${city.city}, ${city.country}. Lifetime access.`,
        metadata: {
          city_product_id: city.id,
          city: city.city,
          country: city.country,
          tier: city.tier,
          pass_type: passType,
        },
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: city.price_cents,
        currency: city.currency,
        metadata: { city_product_id: city.id, pass_type: passType },
      });

      priceId = price.id;

      await supabase
        .from("city_products")
        .update({ stripe_price_id: priceId })
        .eq("id", city.id);
    }

    const origin = req.headers.get("origin") || "https://lovable.dev";
    const routePrefix = passType === "venue" ? "/venue/founders" : "/app/founders";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        city_product_id: city.id,
        city_slug: city.slug,
        tier: city.tier,
        pass_type: passType,
      },
      success_url: `${origin}${routePrefix}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${routePrefix}/checkout/${citySlug}`,
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
