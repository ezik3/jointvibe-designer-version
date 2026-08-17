import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { venue_id } = await req.json();
    if (!venue_id) {
      return new Response(JSON.stringify({ error: "venue_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if frozen or recently calculated
    const { data: scores } = await supabase
      .from("venue_tier_scores")
      .select("*")
      .eq("venue_id", venue_id)
      .single();

    if (!scores) {
      return new Response(JSON.stringify({ error: "Venue not found in tier system" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If frozen, return current data without recalculating
    if (scores.score_frozen) {
      const { data: classification } = await supabase
        .from("venue_classifications")
        .select("*")
        .eq("venue_id", venue_id)
        .single();

      const { data: pioneer } = await supabase
        .from("venue_pioneer_status")
        .select("*")
        .eq("venue_id", venue_id)
        .eq("is_active", true)
        .maybeSingle();

      return new Response(JSON.stringify({
        scores,
        classification,
        pioneer,
        recalculated: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Throttle: skip if calculated within 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const needsRecalc = !scores.last_calculated_at || scores.last_calculated_at < sixHoursAgo;

    if (needsRecalc) {
      await supabase.rpc("calculate_venue_composite_score", { p_venue_id: venue_id });
      await supabase.rpc("evaluate_venue_tier", { p_venue_id: venue_id });
    }

    // Fetch fresh data
    const { data: freshScores } = await supabase
      .from("venue_tier_scores")
      .select("*")
      .eq("venue_id", venue_id)
      .single();

    const { data: classification } = await supabase
      .from("venue_classifications")
      .select("*")
      .eq("venue_id", venue_id)
      .single();

    const { data: pioneer } = await supabase
      .from("venue_pioneer_status")
      .select("*")
      .eq("venue_id", venue_id)
      .eq("is_active", true)
      .maybeSingle();

    const { data: counters } = await supabase
      .from("venue_score_counters")
      .select("*")
      .eq("venue_id", venue_id)
      .single();

    return new Response(JSON.stringify({
      scores: freshScores,
      classification,
      pioneer,
      counters,
      recalculated: needsRecalc,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("recalculate-venue-tier-ondemand error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
