import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

function isSunday(): boolean {
  return new Date().getUTCDay() === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Rotate 90-day windows
    const { data: expiredWindows } = await supabase
      .from("venue_score_counters")
      .select("venue_id, checkins_current, unique_customers_current, returning_customers_current, orders_total_current, orders_completed_current, jvc_transactions_current, window_start")
      .lt("window_start", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

    if (expiredWindows?.length) {
      for (const row of expiredWindows) {
        await supabase.from("venue_score_counters").update({
          prev_checkins: row.checkins_current,
          prev_unique_customers: row.unique_customers_current,
          prev_returning_customers: row.returning_customers_current,
          prev_orders_total: row.orders_total_current,
          prev_orders_completed: row.orders_completed_current,
          prev_jvc_transactions: row.jvc_transactions_current,
          checkins_current: 0,
          unique_customers_current: 0,
          returning_customers_current: 0,
          orders_total_current: 0,
          orders_completed_current: 0,
          orders_response_time_sum_minutes: 0,
          jvc_transactions_current: 0,
          tagged_post_engagements_current: 0,
          deals_run_current: 0,
          events_hosted_current: 0,
          push_notifications_sent_current: 0,
          live_streams_current: 0,
          features_used_flags: 0,
          window_prev_start: row.window_start,
          window_start: new Date().toISOString(),
          last_counter_reset: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("venue_id", row.venue_id);
      }
    }

    // 2. Get venues needing recalculation
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: venues } = await supabase
      .from("venue_tier_scores")
      .select("venue_id")
      .eq("score_frozen", false)
      .or(`needs_recalculation.eq.true,last_calculated_at.lt.${cutoff24h},last_calculated_at.is.null`)
      .limit(500);

    let processed = 0;
    let tierChanges = 0;

    if (venues?.length) {
      for (let i = 0; i < venues.length; i += 100) {
        const batch = venues.slice(i, i + 100);
        for (const v of batch) {
          try {
            await supabase.rpc("calculate_venue_composite_score", { p_venue_id: v.venue_id });
            await supabase.rpc("evaluate_venue_tier", { p_venue_id: v.venue_id });
            processed++;
          } catch (err) {
            console.error(`Error processing venue ${v.venue_id}:`, err);
          }
        }
      }
    }

    // 3. Weekly competition ranking
    const weekStart = getWeekStart();
    let competitionsUpdated = 0;

    // Get all classified venues with their counters
    const { data: classifiedVenues } = await supabase
      .from("venue_classifications")
      .select("venue_id, country_code, tier_category, size_band");

    if (classifiedVenues?.length) {
      // Get all counters and scores in bulk
      const venueIds = classifiedVenues.map(v => v.venue_id);

      const { data: allCounters } = await supabase
        .from("venue_score_counters")
        .select("venue_id, unique_customers_current, checkins_current, tagged_post_engagements_current, deals_run_current, orders_total_current, orders_completed_current, jvc_transactions_current, prev_jvc_transactions")
        .in("venue_id", venueIds);

      const counterMap = new Map((allCounters || []).map(c => [c.venue_id, c]));

      // Group venues by pool (country_code + tier_category + size_band)
      const pools = new Map<string, typeof classifiedVenues>();
      for (const v of classifiedVenues) {
        const key = `${v.country_code}|${v.tier_category}|${v.size_band}`;
        if (!pools.has(key)) pools.set(key, []);
        pools.get(key)!.push(v);
      }

      // Competition type metric extractors + minimum thresholds
      const competitionConfigs = [
        {
          type: "new_customers",
          metric: (c: any) => c?.unique_customers_current ?? 0,
          minThreshold: (val: number) => val >= 3,
        },
        {
          type: "engagement_rate",
          metric: (c: any) => {
            const checkins = c?.checkins_current ?? 0;
            if (checkins < 10) return 0;
            return ((c?.tagged_post_engagements_current ?? 0) / checkins) * 100;
          },
          minThreshold: (val: number, c: any) => (c?.checkins_current ?? 0) >= 10,
        },
        {
          type: "deals_redeemed",
          metric: (c: any) => c?.deals_run_current ?? 0,
          minThreshold: (val: number) => val >= 1,
        },
        {
          type: "fulfillment_rate",
          metric: (c: any) => {
            const total = c?.orders_total_current ?? 0;
            if (total < 5) return 0;
            return ((c?.orders_completed_current ?? 0) / total) * 100;
          },
          minThreshold: (val: number, c: any) => (c?.orders_total_current ?? 0) >= 5,
        },
        {
          type: "growth_velocity",
          metric: (c: any) => {
            const prev = c?.prev_jvc_transactions ?? 0;
            const curr = c?.jvc_transactions_current ?? 0;
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
          },
          minThreshold: (val: number, c: any) => (c?.jvc_transactions_current ?? 0) >= 5,
        },
      ];

      const finalize = isSunday();

      for (const [poolKey, poolVenues] of pools) {
        const [countryCode, tierCategory, sizeBand] = poolKey.split("|");
        const poolSize = poolVenues.length;

        // Skip pools with fewer than 5 venues (pioneer pools)
        if (poolSize < 5) continue;

        for (const config of competitionConfigs) {
          // Calculate metrics for all venues in pool
          const ranked: { venue_id: string; metric_value: number; meets_min: boolean }[] = [];

          for (const pv of poolVenues) {
            const counters = counterMap.get(pv.venue_id);
            const metricVal = config.metric(counters);
            const meetsMin = config.minThreshold(metricVal, counters);
            ranked.push({
              venue_id: pv.venue_id,
              metric_value: Math.round(metricVal * 100) / 100,
              meets_min: meetsMin,
            });
          }

          // Sort descending by metric
          ranked.sort((a, b) => b.metric_value - a.metric_value);

          // Assign ranks
          for (let r = 0; r < ranked.length; r++) {
            const entry = ranked[r];
            const isWinner = finalize && r === 0 && entry.meets_min;

            await supabase
              .from("venue_weekly_competitions")
              .upsert({
                venue_id: entry.venue_id,
                week_start: weekStart,
                country_code: countryCode,
                tier_category: tierCategory,
                size_band: sizeBand,
                competition_type: config.type,
                metric_value: entry.metric_value,
                rank_in_pool: r + 1,
                pool_size: poolSize,
                meets_minimum_threshold: entry.meets_min,
                is_winner: isWinner,
                winner_badge_expires_at: isWinner ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null,
                score_bonus_applied: isWinner ? 50 : 0,
              }, {
                onConflict: "venue_id,week_start,competition_type",
              });

            competitionsUpdated++;

            // Award bonus points to winner on Sunday
            if (isWinner) {
              // Add 50 bonus points
              const { data: currentScore } = await supabase
                .from("venue_tier_scores")
                .select("bonus_points")
                .eq("venue_id", entry.venue_id)
                .single();

              if (currentScore) {
                await supabase
                  .from("venue_tier_scores")
                  .update({
                    bonus_points: (currentScore.bonus_points ?? 0) + 50,
                    needs_recalculation: true,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("venue_id", entry.venue_id);
              }

              // Send winner notification
              const { data: venue } = await supabase
                .from("venues")
                .select("owner_user_id, name")
                .eq("id", entry.venue_id)
                .single();

              if (venue?.owner_user_id) {
                const typeLabel = config.type.replace(/_/g, " ");
                await supabase.from("customer_notifications").insert({
                  user_id: venue.owner_user_id,
                  title: `🏆 Weekly Winner — ${typeLabel}!`,
                  message: `${venue.name || "Your venue"} won this week's ${typeLabel} competition! +50 bonus points awarded.`,
                  type: "venue_tier",
                  reference_id: entry.venue_id,
                  reference_type: "venue_weekly_winner",
                });
              }
            }
          }
        }
      }
    }

    // 4. Check launchpad expiry warnings (7 days before)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const { data: launchpadEnding } = await supabase
      .from("venue_classifications")
      .select("venue_id, launchpad_mode_ends_at")
      .gt("launchpad_mode_ends_at", now)
      .lt("launchpad_mode_ends_at", sevenDaysFromNow);

    if (launchpadEnding?.length) {
      for (const lp of launchpadEnding) {
        const { data: existing } = await supabase
          .from("customer_notifications")
          .select("id")
          .eq("reference_id", lp.venue_id)
          .eq("reference_type", "venue_launchpad_ending")
          .limit(1);

        if (!existing?.length) {
          const { data: venue } = await supabase
            .from("venues")
            .select("owner_user_id, name")
            .eq("id", lp.venue_id)
            .single();

          if (venue?.owner_user_id) {
            await supabase.from("customer_notifications").insert({
              user_id: venue.owner_user_id,
              title: "🚀 Launchpad Mode ends in 7 days",
              message: `Your 1.5× launch bonus expires ${new Date(lp.launchpad_mode_ends_at).toLocaleDateString()}. Your score will recalculate without the bonus after this date.`,
              type: "venue_tier",
              reference_id: lp.venue_id,
              reference_type: "venue_launchpad_ending",
            });
          }
        }
      }
    }

    // 5. Pioneer status updates - deactivate when pool hits 5+
    const { data: activePioneers } = await supabase
      .from("venue_pioneer_status")
      .select("venue_id, country_code, tier_category, size_band")
      .eq("is_active", true);

    if (activePioneers?.length) {
      for (const p of activePioneers) {
        const { count } = await supabase
          .from("venue_classifications")
          .select("id", { count: "exact", head: true })
          .eq("country_code", p.country_code)
          .eq("tier_category", p.tier_category)
          .eq("size_band", p.size_band);

        if (count && count >= 5) {
          await supabase
            .from("venue_pioneer_status")
            .update({ is_active: false })
            .eq("country_code", p.country_code)
            .eq("tier_category", p.tier_category)
            .eq("size_band", p.size_band);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      tierChanges,
      windowsRotated: expiredWindows?.length || 0,
      competitionsUpdated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("recalculate-venue-tiers error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
