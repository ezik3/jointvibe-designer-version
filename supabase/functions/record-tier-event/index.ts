import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Point config ──────────────────────────────────────────────
const POINT_CONFIG: Record<
  string,
  { points: number; category: "vibe" | "reach" }
> = {
  checkin:              { points: 30,  category: "vibe" },
  first_checkin:        { points: 15,  category: "vibe" },
  order:                { points: 20,  category: "vibe" },
  spend_bonus:          { points: 25,  category: "vibe" },
  refer_user:           { points: 75,  category: "vibe" },
  refer_venue:          { points: 300, category: "vibe" },
  venue_post:           { points: 35,  category: "reach" },
  fist_bump:            { points: 3,   category: "reach" },
  new_follower:         { points: 8,   category: "reach" },
  live_stream:          { points: 60,  category: "reach" },
  live_stream_viewers:  { points: 50,  category: "reach" },
  streak_bonus:         { points: 50,  category: "vibe" },
};

// ── Tier thresholds ───────────────────────────────────────────
const TIERS = [
  { name: "member",   min: 0,    reach: "suburb"  },
  { name: "bronze",   min: 150,  reach: "suburb"  },
  { name: "silver",   min: 500,  reach: "city"    },
  { name: "gold",     min: 1000, reach: "state"   },
  { name: "diamond",  min: 3000, reach: "country" },
  { name: "platinum", min: 8000, reach: "global"  },
];

function determineTier(
  jointScore: number,
  impactLabel: string,
  followerCount: number,
): { tier: string; reach: string } {
  // Walk backwards from highest tier
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i];
    if (jointScore < t.min) continue;

    // Diamond gate
    if (
      t.name === "diamond" &&
      (!["strong", "exceptional"].includes(impactLabel) || followerCount < 500)
    ) {
      continue;
    }
    // Platinum gate
    if (
      t.name === "platinum" &&
      (impactLabel !== "exceptional" || followerCount < 2000)
    ) {
      continue;
    }

    return { tier: t.name, reach: t.reach };
  }
  return { tier: "member", reach: "suburb" };
}

// ISO-week string for streak tracking (YYYY-WW)
function isoWeek(d: Date): string {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const daysSinceJan4 = Math.floor(
    (d.getTime() - jan4.getTime()) / 86400000,
  );
  const weekNum = Math.ceil((daysSinceJan4 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { user_id, action_type, metadata = {} } = await req.json();

    if (!user_id || !action_type) {
      return new Response(
        JSON.stringify({ error: "user_id and action_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const config = POINT_CONFIG[action_type];
    if (!config) {
      return new Response(
        JSON.stringify({ error: `Unknown action_type: ${action_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // ── Cap checks ──────────────────────────────────────────
    if (action_type === "fist_bump" && metadata.post_id) {
      const { data: existing } = await supabase
        .from("tier_point_events")
        .select("points")
        .eq("user_id", user_id)
        .eq("action_type", "fist_bump")
        .filter("metadata->>post_id", "eq", metadata.post_id);
      const totalForPost = (existing || []).reduce((s, e) => s + e.points, 0);
      if (totalForPost >= 50) {
        return new Response(
          JSON.stringify({ capped: true, message: "Fist bump cap reached for this post" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (action_type === "new_follower") {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const { data: existing } = await supabase
        .from("tier_point_events")
        .select("points")
        .eq("user_id", user_id)
        .eq("action_type", "new_follower")
        .gte("created_at", ninetyDaysAgo.toISOString());
      const totalFollower = (existing || []).reduce((s, e) => s + e.points, 0);
      if (totalFollower >= 100) {
        return new Response(
          JSON.stringify({ capped: true, message: "Follower points cap reached for 90-day window" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Insert point event ──────────────────────────────────
    await supabase.from("tier_point_events").insert({
      user_id,
      action_type,
      points: config.points,
      score_category: config.category,
      metadata,
      expires_at: expiresAt.toISOString(),
    });

    // ── Streak check (on checkin) ───────────────────────────
    if (action_type === "checkin") {
      const currentWeek = isoWeek(now);
      const { data: tierRow } = await supabase
        .from("user_tiers")
        .select("last_streak_week, streak_weeks")
        .eq("user_id", user_id)
        .single();

      if (tierRow) {
        const lastWeek = tierRow.last_streak_week;
        // Calculate previous ISO week
        const prevWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const prevWeek = isoWeek(prevWeekDate);

        let newStreak = tierRow.streak_weeks || 0;

        if (lastWeek === currentWeek) {
          // Already checked in this week, no change
        } else if (lastWeek === prevWeek) {
          // Consecutive week
          newStreak += 1;
        } else {
          // Streak broken, restart
          newStreak = 1;
        }

        // Award streak bonus at 3 consecutive weeks
        if (newStreak >= 3 && (tierRow.streak_weeks || 0) < 3) {
          await supabase.from("tier_point_events").insert({
            user_id,
            action_type: "streak_bonus",
            points: POINT_CONFIG.streak_bonus.points,
            score_category: "vibe",
            metadata: { streak_weeks: newStreak },
            expires_at: expiresAt.toISOString(),
          });
        }

        await supabase
          .from("user_tiers")
          .update({ last_streak_week: currentWeek, streak_weeks: newStreak })
          .eq("user_id", user_id);
      }
    }

    // ── Recalculate tier score ───────────────────────────────
    const { data: activeEvents } = await supabase
      .from("tier_point_events")
      .select("points, score_category")
      .eq("user_id", user_id)
      .gte("expires_at", now.toISOString());

    let vibeTotal = 0;
    let reachTotal = 0;
    for (const e of activeEvents || []) {
      if (e.score_category === "vibe") vibeTotal += e.points;
      else reachTotal += e.points;
    }

    const jointScore = Math.round(vibeTotal * 0.6 + reachTotal * 0.4);

    // Get current tier row
    const { data: currentTier } = await supabase
      .from("user_tiers")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (!currentTier) {
      // Initialize if missing
      await supabase.from("user_tiers").insert({ user_id });
    }

    // ── Identity verification gate ──────────────────────────
    const { data: verificationRow } = await supabase
      .from("user_verification")
      .select("overall_status")
      .eq("user_id", user_id)
      .maybeSingle();

    const isIdentityVerified = verificationRow?.overall_status === "verified";

    const impactLabel = currentTier?.venue_impact_label || "emerging";
    const followerCount = currentTier?.follower_count_snapshot || 0;
    const oldTier = currentTier?.current_tier || "member";

    const { tier: newTier, reach: newReach } = determineTier(
      jointScore,
      impactLabel,
      followerCount,
    );

    // Grace period logic for demotions from Diamond/Platinum
    let tierAtRisk = false;
    let tierAtRiskSince = currentTier?.tier_at_risk_since || null;
    let finalTier = newTier;

    const highTiers = ["diamond", "platinum"];
    if (
      highTiers.includes(oldTier) &&
      !highTiers.includes(newTier) &&
      highTiers.indexOf(oldTier) > highTiers.indexOf(newTier)
    ) {
      // Would be demoted
      if (!currentTier?.tier_at_risk) {
        // Start grace period
        tierAtRisk = true;
        tierAtRiskSince = now.toISOString();
        finalTier = oldTier; // Keep old tier during grace
      } else if (tierAtRiskSince) {
        const graceDays =
          (now.getTime() - new Date(tierAtRiskSince).getTime()) / 86400000;
        if (graceDays >= 30) {
          // Grace period expired, demote
          tierAtRisk = false;
          tierAtRiskSince = null;
          finalTier = newTier;
        } else {
          // Still in grace period
          tierAtRisk = true;
          finalTier = oldTier;
        }
      }
    } else {
      tierAtRisk = false;
      tierAtRiskSince = null;
    }

    // ── Unverified users are locked to Member / suburb ─────
    if (!isIdentityVerified) {
      finalTier = "member";
    }

    // Determine geographic reach for final tier
    const finalReach =
      TIERS.find((t) => t.name === finalTier)?.reach || "suburb";

    // Update user_tiers
    await supabase
      .from("user_tiers")
      .update({
        current_tier: finalTier,
        joint_score: jointScore,
        vibe_score: vibeTotal,
        reach_score: reachTotal,
        geographic_reach: finalReach,
        tier_at_risk: tierAtRisk,
        tier_at_risk_since: tierAtRiskSince,
        last_calculated_at: now.toISOString(),
      })
      .eq("user_id", user_id);

    // ── Tier promotion notification ─────────────────────────
    const tierOrder = TIERS.map((t) => t.name);
    const oldIdx = tierOrder.indexOf(oldTier);
    const newIdx = tierOrder.indexOf(finalTier);
    const tierChanged = newIdx !== oldIdx;

    // Shadow-mode audit logging for tier transitions.
    // This adds observability only and does not affect live tier outcomes.
    if (tierChanged) {
      try {
        const isPromotion = newIdx > oldIdx;
        await supabase.from("tier_evaluation_logs").insert({
          user_id,
          previous_tier: oldTier,
          new_tier: finalTier,
          contribution_score: jointScore,
          // Maintenance scoring is not active in live logic yet.
          maintenance_score: jointScore,
          evaluation_reason: isPromotion
            ? "promotion_threshold_met"
            : "demotion_threshold_or_gate_failure",
          evaluation_source: "record-tier-event",
          metadata: {
            old_tier: oldTier,
            new_tier: finalTier,
            impact_label: impactLabel,
            follower_count: followerCount,
            tier_at_risk: tierAtRisk,
          },
        });
      } catch (logErr) {
        console.warn("tier_evaluation_logs insert failed:", logErr);
      }
    }

    if (newIdx > oldIdx) {
      // Promoted!
      await supabase.from("customer_notifications").insert({
        user_id,
        type: "tier_promotion",
        title: `You've reached ${finalTier.charAt(0).toUpperCase() + finalTier.slice(1)}! 🎉`,
        message: `Your content now reaches ${finalReach} level. Keep vibing!`,
        reference_type: "tier",
        reference_id: finalTier,
      });
    }

    // Tier at risk notification
    if (tierAtRisk && !currentTier?.tier_at_risk) {
      await supabase.from("customer_notifications").insert({
        user_id,
        type: "tier_warning",
        title: `Your ${oldTier.charAt(0).toUpperCase() + oldTier.slice(1)} status is at risk`,
        message: `Stay active over the next 30 days to keep your ${oldTier} tier.`,
        reference_type: "tier",
        reference_id: oldTier,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        tier: finalTier,
        joint_score: jointScore,
        vibe_score: vibeTotal,
        reach_score: reachTotal,
        geographic_reach: finalReach,
        promoted: newIdx > oldIdx,
        previous_tier: oldTier,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("record-tier-event error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
