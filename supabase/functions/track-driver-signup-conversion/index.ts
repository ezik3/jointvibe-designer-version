import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Event = "impression" | "click" | "signup_started" | "signup_completed";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, campaign_id, event } = await req.json();
    if (!booking_id || !campaign_id || !event) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const allowed: Event[] = ["impression", "click", "signup_started", "signup_completed"];
    if (!allowed.includes(event)) {
      return new Response(JSON.stringify({ error: "Invalid event" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = new Date().toISOString().split("T")[0];

    const { data: existing } = await admin
      .from("ad_analytics")
      .select("id, impressions, clicks, signups_started, signups_completed")
      .eq("campaign_id", campaign_id)
      .eq("booking_id", booking_id)
      .eq("date", today)
      .eq("placement_type", "driver_signup" as any)
      .maybeSingle();

    const inc: any = {};
    if (event === "impression") inc.impressions = (existing?.impressions || 0) + 1;
    if (event === "click") inc.clicks = (existing?.clicks || 0) + 1;
    if (event === "signup_started") inc.signups_started = (existing?.signups_started || 0) + 1;
    if (event === "signup_completed") inc.signups_completed = (existing?.signups_completed || 0) + 1;

    if (existing) {
      await admin.from("ad_analytics").update({ ...inc, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await admin.from("ad_analytics").insert({
        campaign_id,
        booking_id,
        date: today,
        placement_type: "driver_signup" as any,
        impressions: event === "impression" ? 1 : 0,
        clicks: event === "click" ? 1 : 0,
        signups_started: event === "signup_started" ? 1 : 0,
        signups_completed: event === "signup_completed" ? 1 : 0,
      } as any);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
