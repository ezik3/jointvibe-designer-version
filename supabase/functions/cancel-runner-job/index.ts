import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  job_id: z.string().uuid(),
  reason: z.string().trim().min(2).max(200),
  by: z.enum(["customer", "runner"]),
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

    const isCustomer = job.customer_id === user.id;
    const isRunner = job.runner_id === user.id;
    if (!isCustomer && !isRunner) return json({ error: "Forbidden" }, 403);

    // Determine refund + runner fee per spec
    const held = Number(job.held_amount_usd);
    const fee = Number(job.runner_fee_usd);
    const tip = Number(job.tip_usd);
    let refundToCustomer = held;
    let payToRunner = 0;

    if (parsed.data.by === "runner") {
      // Runner cancels pre-approval (items unavailable / price too high) → no penalty
      if (
        ["accepted", "at_store", "awaiting_approval"].includes(job.status) &&
        ["items_unavailable", "price_too_high"].some((k) =>
          parsed.data.reason.toLowerCase().includes(k.replace("_", " ")),
        )
      ) {
        refundToCustomer = held;
        payToRunner = 0;
      } else {
        return json({ error: "Runner cancellation not allowed at this stage" }, 400);
      }
    } else {
      // Customer cancellation
      if (job.status === "pending") {
        refundToCustomer = held;
        payToRunner = 0;
      } else if (["accepted", "at_store", "awaiting_approval"].includes(job.status)) {
        // 50% of runner fee
        payToRunner = Math.round(fee * 0.5 * 100) / 100;
        refundToCustomer = Math.round((held - payToRunner) * 100) / 100;
        if (job.runner_id) {
          await service.from("runner_fraud_flags").insert({
            runner_id: job.runner_id,
            job_id: job.id,
            flag_type: "cancelled_at_store",
            details: { reason: parsed.data.reason },
          });
        }
      } else {
        // purchased+: full fee + tip + items charged
        const itemCost = Number(job.final_item_cost_usd ?? job.approved_total_usd ?? job.est_item_cost_usd);
        payToRunner = Math.round((fee + tip + itemCost) * 100) / 100;
        refundToCustomer = Math.max(0, Math.round((held - payToRunner) * 100) / 100);
      }
    }

    // Refund + payout
    if (refundToCustomer > 0) {
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
    }

    if (payToRunner > 0 && job.runner_id) {
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

    await service
      .from("runner_wallet_holds")
      .update({ status: refundToCustomer === held ? "refunded" : "captured" })
      .eq("job_id", job.id);

    await service
      .from("runner_jobs")
      .update({
        status: "cancelled",
        cancel_reason: parsed.data.reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return json({ ok: true, refundToCustomer, payToRunner }, 200);
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
