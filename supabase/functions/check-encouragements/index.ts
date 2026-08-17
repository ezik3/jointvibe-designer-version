import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EncouragementCheck {
  type: string;
  check: (supabase: any, userId: string) => Promise<boolean>;
  title: string;
  message: (ctx?: any) => string;
}

const CHECKS: EncouragementCheck[] = [
  {
    type: "venue_posts_5_low_followers",
    check: async (supabase, userId) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("tier_point_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("action_type", "venue_post")
        .gte("created_at", thirtyDaysAgo);
      
      if ((count || 0) < 5) return false;
      
      const { data: tier } = await supabase
        .from("user_tiers")
        .select("follower_count_snapshot")
        .eq("user_id", userId)
        .single();
      
      return (tier?.follower_count_snapshot || 0) < 200;
    },
    title: "Venues love you! 🏆",
    message: () => "You've posted at multiple venues this month. Your Venue Impact Score is climbing!",
  },
  {
    type: "first_live_stream",
    check: async (supabase, userId) => {
      const { count } = await supabase
        .from("tier_point_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("action_type", "live_stream");
      return count === 1;
    },
    title: "You went live! 🔴",
    message: () => "Your first live stream puts you ahead of 85% of users on Joint Vibe.",
  },
  {
    type: "three_day_post_streak",
    check: async (supabase, userId) => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: events } = await supabase
        .from("tier_point_events")
        .select("created_at")
        .eq("user_id", userId)
        .eq("action_type", "venue_post")
        .gte("created_at", threeDaysAgo);
      
      if (!events || events.length < 3) return false;
      
      // Check if posts span 3 different days
      const days = new Set(events.map((e: any) => new Date(e.created_at).toDateString()));
      return days.size >= 3;
    },
    title: "3-day streak! 🔥",
    message: () => "Consistency builds audience. Keep posting!",
  },
  {
    type: "streak_bonus_earned",
    check: async (supabase, userId) => {
      const { data: tier } = await supabase
        .from("user_tiers")
        .select("streak_weeks")
        .eq("user_id", userId)
        .single();
      return (tier?.streak_weeks || 0) >= 3;
    },
    title: "Weekly streak bonus! 🎯",
    message: () => "3 weeks of check-ins in a row! You earned a +50 point bonus.",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sent: string[] = [];

    for (const check of CHECKS) {
      // Check if already sent
      const { data: existing } = await supabase
        .from("tier_encouragement_log")
        .select("id")
        .eq("user_id", user_id)
        .eq("encouragement_type", check.type)
        .maybeSingle();

      if (existing) continue;

      const triggered = await check.check(supabase, user_id);
      if (!triggered) continue;

      // Log it
      await supabase.from("tier_encouragement_log").insert({
        user_id,
        encouragement_type: check.type,
      });

      // Send notification
      await supabase.from("customer_notifications").insert({
        user_id,
        type: "encouragement",
        title: check.title,
        message: check.message(),
        reference_type: "tier_encouragement",
        reference_id: check.type,
      });

      sent.push(check.type);
    }

    return new Response(
      JSON.stringify({ success: true, encouragements_sent: sent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-encouragements error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
