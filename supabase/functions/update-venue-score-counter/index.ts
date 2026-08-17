import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { venue_id, event_type, metadata } = await req.json();
    if (!venue_id || !event_type) {
      return new Response(JSON.stringify({ error: "venue_id and event_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get current counters
    const { data: counters } = await supabase
      .from("venue_score_counters")
      .select("*")
      .eq("venue_id", venue_id)
      .single();

    if (!counters) {
      return new Response(JSON.stringify({ error: "Venue not in tier system" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    switch (event_type) {
      case "deal_created":
        updates.deals_run_current = (counters.deals_run_current || 0) + 1;
        updates.features_used_flags = (counters.features_used_flags || 0) | 4; // bit 2
        break;

      case "event_hosted":
        updates.events_hosted_current = (counters.events_hosted_current || 0) + 1;
        break;

      case "push_notification_sent":
        updates.push_notifications_sent_current = (counters.push_notifications_sent_current || 0) + 1;
        updates.features_used_flags = (counters.features_used_flags || 0) | 32; // bit 5
        break;

      case "live_stream_ended":
        updates.live_streams_current = (counters.live_streams_current || 0) + 1;
        updates.features_used_flags = (counters.features_used_flags || 0) | 8; // bit 3
        break;

      case "delivery_accepted":
        updates.features_used_flags = (counters.features_used_flags || 0) | 16; // bit 4
        break;

      case "reservation_confirmed":
        updates.features_used_flags = (counters.features_used_flags || 0) | 64; // bit 6
        break;

      case "menu_updated":
        updates.features_used_flags = (counters.features_used_flags || 0) | 2; // bit 1
        break;

      case "kds_used":
        updates.features_used_flags = (counters.features_used_flags || 0) | 256; // bit 8
        break;

      case "kiosk_used":
        updates.features_used_flags = (counters.features_used_flags || 0) | 512; // bit 9
        break;

      case "post_engagement":
        updates.tagged_post_engagements_current = (counters.tagged_post_engagements_current || 0) + 1;
        break;

      case "jvc_transfer":
        updates.jvc_transactions_current = (counters.jvc_transactions_current || 0) + (metadata?.amount || 0);
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown event_type: ${event_type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    await supabase.from("venue_score_counters").update(updates).eq("venue_id", venue_id);
    await supabase.from("venue_tier_scores").update({ needs_recalculation: true }).eq("venue_id", venue_id);

    return new Response(JSON.stringify({ success: true, event_type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("update-venue-score-counter error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
