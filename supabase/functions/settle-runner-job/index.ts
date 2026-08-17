import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  job_id: z.string().uuid(),
  action: z.enum(["confirm", "auto_confirm"]),
});

const DISPUTE_WINDOW_HOURS = 24;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsedBody = Body.safeParse(await req.json());
    if (!parsedBody.success) return json({ error: parsedBody.error.flatten().fieldErrors }, 400);

    const isAuto = parsedBody.data.action === "auto_confirm";
    let userId: string | null = null;

    if (!isAuto) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Missing auth" }, 401);
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await userClient.auth.getUser();
      if (!data.user) return json({ error: "Unauthorized" }, 401);
      userId = data.user.id;
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job } = await service
      .from("runner_jobs")
      .select("*")
      .eq("id", parsedBody.data.job_id)
      .maybeSingle();

    if (!job) return json({ error: "Job not found" }, 404);
    if (!isAuto && userId !== job.customer_id) return json({ error: "Forbidden" }, 403);
    if (!["delivered"].includes(job.status))
      return json({ error: "Not in delivered state" }, 400);

    const held = Number(job.held_amount_usd);
    const fee = Number(job.runner_fee_usd);
    const tip = Number(job.tip_usd);
    const platformFee = Number(job.platform_fee_usd ?? 0);
    const finalCost = Number(job.final_item_cost_usd ?? job.approved_total_usd ?? job.est_item_cost_usd);
    const payToRunner = Math.round((finalCost + fee + tip) * 100) / 100;
    const refundToCustomer = Math.max(0, Math.round((held - payToRunner - platformFee) * 100) / 100);

    // Capture & payout
    const { data: cw } = await service
      .from("user_wallets")
      .select("balance_jv_token, locked_balance")
      .eq("user_id", job.customer_id)
      .maybeSingle();
    if (cw) {
      await service
        .from("user_wallets")
        .update({
          balance_jv_token: Number(cw.balance_jv_token) + refundToCustomer,
          locked_balance: Math.max(0, Number(cw.locked_balance) - held),
        })
        .eq("user_id", job.customer_id);
    }

    if (job.runner_id) {
      const { data: rw } = await service
        .from("user_wallets")
        .select("balance_jv_token")
        .eq("user_id", job.runner_id)
        .maybeSingle();
      if (rw) {
        await service
          .from("user_wallets")
          .update({ balance_jv_token: Number(rw.balance_jv_token) + payToRunner })
          .eq("user_id", job.runner_id);
      }
    }

    if (platformFee > 0) {
      const { data: treasury } = await service
        .from("platform_treasury")
        .select("id, collected_fees")
        .limit(1)
        .maybeSingle();
      if (treasury) {
        await service
          .from("platform_treasury")
          .update({ collected_fees: Number(treasury.collected_fees ?? 0) + platformFee })
          .eq("id", treasury.id);
      }
    }

    await service
      .from("runner_wallet_holds")
      .update({ status: "captured" })
      .eq("job_id", job.id);

    const completedAt = new Date();
    const disputeEnd = new Date(completedAt.getTime() + DISPUTE_WINDOW_HOURS * 3600_000);

    await service
      .from("runner_jobs")
      .update({
        status: "completed",
        completed_at: completedAt.toISOString(),
        dispute_window_ends_at: disputeEnd.toISOString(),
      })
      .eq("id", job.id);

    return json({ ok: true, payToRunner, refundToCustomer, platformFee }, 200);
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
