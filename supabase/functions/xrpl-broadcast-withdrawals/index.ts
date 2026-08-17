// XRPL Withdrawal Broadcaster — Phase 2
// Cron-triggered. Picks up 'approved' withdrawals, signs + submits to XRPL, marks confirmed.
// On any failure, refunds the user via DB function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NETWORK = (Deno.env.get("XRPL_NETWORK") ?? "xrpl-testnet") as "xrpl-testnet" | "xrpl-mainnet";
const RPC_URL = NETWORK === "xrpl-mainnet"
  ? "https://s1.ripple.com:51234/"
  : "https://s.altnet.rippletest.net:51234/";

// Conservative reference XRP price for testnet sizing — replace with oracle in Phase 3.
const XRP_USD_FALLBACK = Number(Deno.env.get("XRPL_XRP_USD_FALLBACK") ?? "0.50");

async function rpc(method: string, params: any) {
  const r = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: [params] }),
  });
  const j = await r.json();
  return j.result;
}

Deno.serve(async (_req) => {
  if (_req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const hotSeed = Deno.env.get("XRPL_HOT_WALLET_SEED");
  const hotAddr = Deno.env.get("XRPL_HOT_WALLET_ADDRESS");

  const summary = { processed: 0, succeeded: 0, failed: 0, skipped_no_seed: 0 };

  try {
    const { data: queue, error } = await admin
      .from("crypto_withdrawals")
      .select("*")
      .eq("status", "approved")
      .eq("network", NETWORK)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) throw error;
    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ ok: true, ...summary, msg: "queue empty" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!hotSeed || !hotAddr) {
      // Without a hot wallet seed configured we cannot sign. Don't crash; just skip
      // so that ops can configure secrets and re-run safely.
      return new Response(JSON.stringify({
        ok: false, ...summary, skipped_no_seed: queue.length,
        msg: "XRPL_HOT_WALLET_SEED / XRPL_HOT_WALLET_ADDRESS not configured",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Lazy import xrpl to avoid cold-start cost when queue is empty
    const xrpl = await import("https://esm.sh/xrpl@2.14.0?bundle");
    const wallet = xrpl.Wallet.fromSeed(hotSeed);
    if (wallet.classicAddress !== hotAddr) {
      console.warn("Hot wallet seed/address mismatch — refusing to sign");
      return new Response(JSON.stringify({ ok: false, error: "wallet mismatch" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const client = new xrpl.Client(NETWORK === "xrpl-mainnet" ? "wss://s1.ripple.com" : "wss://s.altnet.rippletest.net:51233");
    await client.connect();

    try {
      for (const w of queue) {
        summary.processed++;
        try {
          await admin.from("crypto_withdrawals").update({
            status: "broadcasting", broadcast_at: new Date().toISOString(),
          }).eq("id", w.id);

          // Convert USD JVC to XRP drops (testnet only path; RLUSD broadcast added in Phase 3)
          const xrpAmount = (Number(w.amount_jvc) / XRP_USD_FALLBACK).toFixed(6);
          const drops = xrpl.xrpToDrops(xrpAmount);

          const tx: any = {
            TransactionType: "Payment",
            Account: hotAddr,
            Destination: w.destination_address,
            Amount: drops,
          };
          if (w.destination_tag) tx.DestinationTag = Number(w.destination_tag);

          const prepared = await client.autofill(tx);
          const signed = wallet.sign(prepared);
          const result = await client.submitAndWait(signed.tx_blob);

          const meta: any = result?.result?.meta;
          const txResult = typeof meta === "object" ? meta?.TransactionResult : null;

          if (txResult === "tesSUCCESS") {
            await admin.from("crypto_withdrawals").update({
              status: "confirmed",
              tx_hash: result.result.hash,
              ledger_index: result.result.ledger_index,
              amount_asset: Number(xrpAmount),
              fx_rate: XRP_USD_FALLBACK,
              confirmed_at: new Date().toISOString(),
            }).eq("id", w.id);
            summary.succeeded++;
          } else {
            await admin.rpc("refund_crypto_withdrawal", {
              _withdrawal_id: w.id,
              _reason: `XRPL rejected: ${txResult ?? "unknown"}`,
            });
            summary.failed++;
          }
        } catch (e) {
          console.error("withdrawal failed", w.id, e);
          await admin.rpc("refund_crypto_withdrawal", {
            _withdrawal_id: w.id,
            _reason: String(e).slice(0, 500),
          });
          summary.failed++;
        }
      }
    } finally {
      await client.disconnect();
    }

    return new Response(JSON.stringify({ ok: true, ...summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("xrpl-broadcast-withdrawals fatal:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err), ...summary }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
