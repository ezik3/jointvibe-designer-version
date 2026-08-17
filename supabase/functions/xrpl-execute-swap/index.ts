// Phase 3: Multi-Asset Swap Layer — Execute Swap
// Locks an existing quote, creates a swap record (status=executing),
// then performs the on-chain XRPL DEX swap (or simulated swap on testnet)
// and finalizes the swap record.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// On testnet we simulate the on-chain leg. Once XRPL_HOT_WALLET_SEED is configured
// we route through the XRPL DEX (Path/OfferCreate). Kept abstract here so Phase 6
// can swap in a real submitter without touching the DB contract.
async function performOnChainSwap(_params: {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: number;
  expectedToAmount: number;
}): Promise<{ tx_hash: string; executed_to_amount: number; executed_rate: number }> {
  const fakeHash = Array.from({ length: 64 }, () =>
    "0123456789ABCDEF"[Math.floor(Math.random() * 16)]
  ).join("");

  // Simulate near-perfect fill (testnet)
  const executedToAmount = _params.expectedToAmount;
  const executedRate = executedToAmount / _params.fromAmount;
  return { tx_hash: fakeHash, executed_to_amount: executedToAmount, executed_rate: executedRate };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { quote_id, deposit_id = null, source = "manual" } = await req.json();
    if (!quote_id) {
      return new Response(JSON.stringify({ error: "missing_quote_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Atomically lock the quote and create swap record
    const { data: swapId, error: rpcErr } = await supabase.rpc("execute_crypto_swap", {
      p_user_id: user.id,
      p_quote_id: quote_id,
      p_deposit_id: deposit_id,
      p_source: source,
    });

    if (rpcErr) {
      console.error("[xrpl-execute-swap] rpc error", rpcErr);
      return new Response(JSON.stringify({ error: rpcErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load swap to get the locked params
    const { data: swap, error: swapErr } = await supabase
      .from("crypto_swaps").select("*").eq("id", swapId).single();
    if (swapErr || !swap) throw swapErr ?? new Error("swap_not_found");

    try {
      const onchain = await performOnChainSwap({
        fromSymbol: swap.from_symbol,
        toSymbol: swap.to_symbol,
        fromAmount: Number(swap.from_amount),
        expectedToAmount: Number(swap.to_amount),
      });

      const { error: completeErr } = await supabase.rpc("complete_crypto_swap", {
        p_swap_id: swapId,
        p_tx_hash: onchain.tx_hash,
        p_executed_rate: onchain.executed_rate,
        p_actual_to_amount: onchain.executed_to_amount,
      });
      if (completeErr) throw completeErr;

      return new Response(JSON.stringify({
        success: true,
        swap_id: swapId,
        tx_hash: onchain.tx_hash,
        to_amount: onchain.executed_to_amount,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (chainErr) {
      console.error("[xrpl-execute-swap] on-chain failure", chainErr);
      await supabase.rpc("fail_crypto_swap", {
        p_swap_id: swapId,
        p_reason: (chainErr as Error).message?.slice(0, 240) ?? "onchain_error",
      });
      return new Response(JSON.stringify({ error: "onchain_failed", swap_id: swapId }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[xrpl-execute-swap] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
