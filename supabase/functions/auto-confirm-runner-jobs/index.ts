import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTO_CONFIRM_MINUTES = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - AUTO_CONFIRM_MINUTES * 60_000).toISOString();

    const { data: jobs } = await service
      .from("runner_jobs")
      .select("id")
      .eq("status", "delivered")
      .lt("delivered_at", cutoff);

    let confirmed = 0;
    for (const j of jobs ?? []) {
      try {
        const r = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/settle-runner-job`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ job_id: j.id, action: "auto_confirm" }),
          },
        );
        if (r.ok) confirmed++;
      } catch {
        /* ignore */
      }
    }

    return new Response(JSON.stringify({ checked: jobs?.length ?? 0, confirmed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
