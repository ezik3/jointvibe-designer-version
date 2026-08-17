
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lng, passType } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({ error: "lat and lng are required numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: products, error } = await supabase
      .from("city_products")
      .select("*")
      .eq("is_active", true)
      .eq("pass_type", passType || "user")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (error) throw error;
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ match: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find nearest product
    let nearest: any = null;
    let nearestDist = Infinity;

    for (const p of products) {
      const dist = haversineKm(lat, lng, p.latitude, p.longitude);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = p;
      }
    }

    if (!nearest) {
      return new Response(
        JSON.stringify({ match: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine distance tier
    let distanceTier: string;
    if (nearestDist <= 50) {
      distanceTier = "metro";
    } else if (nearestDist <= 100) {
      distanceTier = "near";
    } else {
      distanceTier = "far";
    }

    return new Response(
      JSON.stringify({
        match: {
          slug: nearest.slug,
          city: nearest.city,
          country: nearest.country,
          distanceKm: Math.round(nearestDist),
          distanceTier,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
