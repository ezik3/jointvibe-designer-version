import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Standard cheapest, Quick mid, Priority highest. Keep in sync with
// src/hooks/useRunnerJobs.ts → RUNNER_TIER_FEES.
const TIER_FEES: Record<string, number> = { standard: 3, quick: 6, priority: 10 };
const BUFFER_PCT = 25;
const OUT_OF_POCKET_CAP = 50;
const PLATFORM_FEE_USD = 0.10;

const Body = z.object({
  task_description: z.string().trim().min(3).max(500),
  pickup_address: z.string().trim().max(255).optional(),
  pickup_latitude: z.number().optional(),
  pickup_longitude: z.number().optional(),
  pickup_venue_id: z.string().uuid().optional(),
  dropoff_address: z.string().trim().min(3).max(255),
  dropoff_latitude: z.number().optional(),
  dropoff_longitude: z.number().optional(),
  price_tier: z.enum(["quick", "standard", "priority"]),
  est_item_cost_usd: z.number().min(0).max(OUT_OF_POCKET_CAP),
  tip_usd: z.number().min(0).max(50).default(0),
  distance_surcharge_usd: z.number().min(0).max(50).default(0),
  platform_fee_usd: z.number().min(0).max(1).default(PLATFORM_FEE_USD),
});

function calculateSpendablePending(pendingBalance: number, pendingUntil?: string | null): number {
  if (!pendingBalance) return 0;
  if (pendingUntil && new Date() >= new Date(pendingUntil)) return pendingBalance;
  return pendingBalance * 0.5;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const input = parsed.data;

    const fee = TIER_FEES[input.price_tier];
    const surcharge = input.distance_surcharge_usd ?? 0;
    const platformFee = input.platform_fee_usd ?? PLATFORM_FEE_USD;
    const buffer = Math.round(input.est_item_cost_usd * (BUFFER_PCT / 100) * 100) / 100;
    const held = Math.round(
      (input.est_item_cost_usd + fee + surcharge + input.tip_usd + buffer + platformFee) * 100,
    ) / 100;

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Wallet check — use the same spendable wallet basis as the app UI.
    const { data: wallet, error: wErr } = await service
      .from("user_wallets")
      .select("id, balance_usd, balance_jv_token, subsidy_balance, pending_balance, pending_until, locked_balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (wErr || !wallet) {
      return new Response(JSON.stringify({ error: "Wallet not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseSpendable = Math.max(
      Number(wallet.balance_jv_token ?? 0),
      Number(wallet.balance_usd ?? 0),
    );
    const spendableBalance = Math.round(
      (baseSpendable +
        Number(wallet.subsidy_balance ?? 0) +
        calculateSpendablePending(Number(wallet.pending_balance ?? 0), wallet.pending_until)) * 100,
    ) / 100;

    if (spendableBalance < held) {
      return new Response(
        JSON.stringify({
          error: `Insufficient balance. Need $${held.toFixed(2)} but wallet has $${spendableBalance.toFixed(2)}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert job
    const { data: job, error: jErr } = await service
      .from("runner_jobs")
      .insert({
        customer_id: user.id,
        status: "pending",
        task_description: input.task_description,
        pickup_address: input.pickup_address,
        pickup_latitude: input.pickup_latitude,
        pickup_longitude: input.pickup_longitude,
        pickup_venue_id: input.pickup_venue_id ?? null,
        dropoff_address: input.dropoff_address,
        dropoff_latitude: input.dropoff_latitude,
        dropoff_longitude: input.dropoff_longitude,
        price_tier: input.price_tier,
        runner_fee_usd: fee,
        tip_usd: input.tip_usd,
        est_item_cost_usd: input.est_item_cost_usd,
        distance_surcharge_usd: surcharge,
        platform_fee_usd: platformFee,
        buffer_pct: BUFFER_PCT,
        held_amount_usd: held,
      })
      .select("id")
      .single();

    if (jErr || !job) {
      return new Response(JSON.stringify({ error: jErr?.message ?? "Failed to create job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Move funds: spendable balances → locked. Prefer regular JVC, then subsidy,
    // then the currently spendable slice of pending funds.
    let remaining = held;
    const currentJvc = Number(wallet.balance_jv_token ?? 0);
    const currentUsd = Number(wallet.balance_usd ?? 0);
    const currentSubsidy = Number(wallet.subsidy_balance ?? 0);
    const currentPending = Number(wallet.pending_balance ?? 0);
    const debitJvc = Math.min(currentJvc, remaining);
    remaining = Math.round((remaining - debitJvc) * 100) / 100;
    const debitSubsidy = Math.min(currentSubsidy, remaining);
    remaining = Math.round((remaining - debitSubsidy) * 100) / 100;
    const debitPending = Math.min(
      calculateSpendablePending(currentPending, wallet.pending_until),
      remaining,
    );
    const nextJvcBalance = Math.max(0, Math.round((currentJvc - debitJvc) * 100) / 100);
    const nextUsdBalance = currentUsd > 0
      ? Math.max(0, Math.round((currentUsd - debitJvc) * 100) / 100)
      : currentUsd;
    await service
      .from("user_wallets")
      .update({
        balance_jv_token: nextJvcBalance,
        balance_usd: nextUsdBalance,
        subsidy_balance: Math.max(0, Math.round((currentSubsidy - debitSubsidy) * 100) / 100),
        pending_balance: Math.max(0, Math.round((currentPending - debitPending) * 100) / 100),
        locked_balance: Number(wallet.locked_balance ?? 0) + held,
      })
      .eq("user_id", user.id);

    await service.from("runner_wallet_holds").insert({
      job_id: job.id,
      user_id: user.id,
      amount_usd: held,
      status: "held",
    });

    return new Response(JSON.stringify({ job_id: job.id, held_amount_usd: held }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
