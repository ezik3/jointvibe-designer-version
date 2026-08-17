import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  job_id: z.string().uuid(),
  approved_total_usd: z.number().min(0).max(50),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job } = await service
      .from("runner_jobs")
      .select("*")
      .eq("id", parsed.data.job_id)
      .maybeSingle();

    if (!job) return json({ error: "Job not found" }, 404);
    if (job.customer_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (job.status !== "awaiting_approval") return json({ error: "Not awaiting approval" }, 400);

    await service
      .from("runner_jobs")
      .update({
        status: "approved",
        approved_total_usd: parsed.data.approved_total_usd,
        approved_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
