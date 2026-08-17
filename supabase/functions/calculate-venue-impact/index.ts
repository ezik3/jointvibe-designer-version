import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { user_id, venue_id } = await req.json();
    if (!user_id || !venue_id) {
      return new Response(
        JSON.stringify({ error: "user_id and venue_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date();
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    // Count how many OTHER users check into this venue within 4 hours of this user's check-in
    const { count: correlatedCheckins } = await supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venue_id)
      .neq("user_id", user_id)
      .gte("checked_in_at", now.toISOString())
      .lte("checked_in_at", fourHoursLater.toISOString());

    // Get venue's average check-in rate (last 30 days, same day of week)
    const dayOfWeek = now.getDay();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const { data: historicalCheckins } = await supabase
      .from("check_ins")
      .select("checked_in_at")
      .eq("venue_id", venue_id)
      .gte("checked_in_at", thirtyDaysAgo.toISOString());

    // Filter to same day of week and calculate average
    const sameDayCheckins = (historicalCheckins || []).filter(c => {
      const d = new Date(c.checked_in_at!);
      return d.getDay() === dayOfWeek;
    });
    const avgPerDay = sameDayCheckins.length / 4; // ~4 same-days in 30 days

    // Impact = correlated check-ins above average
    const impactValue = Math.max(0, (correlatedCheckins || 0) - Math.round(avgPerDay));

    // Record the impact event
    await supabase.from("venue_impact_events").insert({
      user_id,
      venue_id,
      event_type: "checkin_correlation",
      impact_value: impactValue,
      metadata: {
        correlated_checkins: correlatedCheckins || 0,
        avg_per_day: avgPerDay,
      },
    });

    // Recalculate total venue impact for this user (last 90 days)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const { data: allImpact } = await supabase
      .from("venue_impact_events")
      .select("impact_value")
      .eq("user_id", user_id)
      .gte("created_at", ninetyDaysAgo.toISOString());

    const totalImpact = (allImpact || []).reduce((s, e) => s + e.impact_value, 0);

    // Determine label
    let label = "emerging";
    if (totalImpact >= 600) label = "exceptional";
    else if (totalImpact >= 300) label = "strong";
    else if (totalImpact >= 100) label = "growing";

    // Update user_tiers
    await supabase
      .from("user_tiers")
      .update({
        venue_impact_raw: totalImpact,
        venue_impact_label: label,
      })
      .eq("user_id", user_id);

    return new Response(
      JSON.stringify({ success: true, impact_raw: totalImpact, impact_label: label }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("calculate-venue-impact error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
