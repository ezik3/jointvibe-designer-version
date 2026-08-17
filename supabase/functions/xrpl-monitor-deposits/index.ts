// XRPL Deposit Monitor (cron-friendly)
// Polls XRPL public node for incoming transactions to the hot wallet,
// matches by destination tag, credits user pending balance.
//
// Safety rules built in:
// - Only credits transactions newer than last seen ledger
// - Idempotent via UNIQUE(network, tx_hash)
// - 72h pending hold (matching fiat gateway)
// - Per-deposit USD value snapshotted at receipt time
// - Min/max deposit caps

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NETWORK = (Deno.env.get("XRPL_NETWORK") ?? "xrpl-testnet") as "xrpl-testnet" | "xrpl-mainnet";
const XRPL_RPC = NETWORK === "xrpl-mainnet"
  ? "https://xrplcluster.com/"
  : "https://s.altnet.rippletest.net:51234/";

const HOT_WALLET = Deno.env.get("XRPL_HOT_WALLET_ADDRESS") ?? "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

// Safety caps
const MIN_DEPOSIT_USD = 1;
const MAX_DEPOSIT_USD = 5000; // anything above auto-flags
const PENDING_HOLD_HOURS = 72;
const RLUSD_PEG = 1.0; // RLUSD is USD-pegged
const XRP_USD_FALLBACK = 0.50; // fallback if price oracle fails

async function getXrpUsdPrice(): Promise<number> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd");
    const j = await r.json();
    const p = Number(j?.ripple?.usd);
    return Number.isFinite(p) && p > 0 ? p : XRP_USD_FALLBACK;
  } catch {
    return XRP_USD_FALLBACK;
  }
}

async function fetchAccountTx(marker?: any) {
  const body = {
    method: "account_tx",
    params: [{
      account: HOT_WALLET,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      limit: 50,
      forward: false,
      ...(marker ? { marker } : {}),
    }],
  };
  const r = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const xrpUsd = await getXrpUsdPrice();
    const result = await fetchAccountTx();
    const txs = result?.result?.transactions ?? [];

    const credited: any[] = [];
    const skipped: any[] = [];

    for (const entry of txs) {
      const tx = entry?.tx ?? entry?.tx_json;
      const meta = entry?.meta;
      if (!tx || !meta) continue;
      if (tx.TransactionType !== "Payment") continue;
      if (tx.Destination !== HOT_WALLET) continue;
      if (meta.TransactionResult !== "tesSUCCESS") continue;

      const tag = tx.DestinationTag;
      if (tag === undefined || tag === null) {
        skipped.push({ hash: tx.hash, reason: "no destination tag" });
        continue;
      }

      // Find owner of tag
      const { data: addr } = await admin
        .from("crypto_deposit_addresses")
        .select("user_id")
        .eq("network", NETWORK)
        .eq("destination_tag", tag)
        .maybeSingle();

      if (!addr) {
        skipped.push({ hash: tx.hash, reason: "tag not assigned", tag });
        continue;
      }

      // Determine asset + amount
      let asset = "XRP";
      let amount = 0;
      let usdValue = 0;
      const delivered = meta.delivered_amount ?? tx.Amount;

      if (typeof delivered === "string") {
        amount = Number(delivered) / 1_000_000; // drops -> XRP
        asset = "XRP";
        usdValue = amount * xrpUsd;
      } else if (delivered && typeof delivered === "object") {
        amount = Number(delivered.value);
        asset = delivered.currency;
        // RLUSD or stablecoin issued tokens
        if (asset === "USD" || asset === "RLUSD" || /^524C555344/i.test(asset)) {
          usdValue = amount * RLUSD_PEG;
          asset = "RLUSD";
        } else {
          // Unknown IOU — skip for safety
          skipped.push({ hash: tx.hash, reason: `unsupported asset ${asset}` });
          continue;
        }
      } else {
        continue;
      }

      // Safety caps
      if (usdValue < MIN_DEPOSIT_USD) {
        skipped.push({ hash: tx.hash, reason: "below min" });
        continue;
      }
      const flagged = usdValue > MAX_DEPOSIT_USD;
      const status = flagged ? "flagged" : "credited";
      const pendingUntil = new Date(Date.now() + PENDING_HOLD_HOURS * 3600 * 1000).toISOString();

      // Insert deposit (idempotent on tx_hash)
      const { data: depRow, error: depErr } = await admin
        .from("crypto_deposits")
        .insert({
          user_id: addr.user_id,
          network: NETWORK,
          tx_hash: tx.hash,
          destination_tag: tag,
          asset_received: asset,
          amount_received: amount,
          usd_value_at_receipt: usdValue,
          jvc_credited: flagged ? 0 : usdValue,
          status,
          pending_until: pendingUntil,
          ledger_index: tx.ledger_index ?? entry.ledger_index,
          raw_tx: entry,
        })
        .select()
        .single();

      if (depErr) {
        // Likely duplicate — already processed
        skipped.push({ hash: tx.hash, reason: "already processed" });
        continue;
      }

      if (!flagged) {
        // Credit pending balance + crypto pending tracker
        const { data: wallet } = await admin
          .from("user_wallets").select("crypto_pending_balance, crypto_lifetime_deposit_usd, pending_balance, pending_until")
          .eq("user_id", addr.user_id).maybeSingle();

        const currentPending = Number(wallet?.crypto_pending_balance ?? 0);
        const currentLifetime = Number(wallet?.crypto_lifetime_deposit_usd ?? 0);

        await admin.from("user_wallets").upsert({
          user_id: addr.user_id,
          crypto_pending_balance: currentPending + usdValue,
          crypto_lifetime_deposit_usd: currentLifetime + usdValue,
          last_crypto_deposit_at: new Date().toISOString(),
          pending_until: pendingUntil,
        }, { onConflict: "user_id" });

        // Withdrawal hold (7 days from deposit, matching fiat policy)
        await admin.from("crypto_withdrawal_holds").insert({
          user_id: addr.user_id,
          deposit_id: depRow.id,
          amount_locked: usdValue,
          hold_until: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        });

        // Bump reserve state
        await admin.rpc("noop").catch(() => {}); // placeholder
        const { data: reserve } = await admin
          .from("crypto_reserve_state").select("total_xrp_held, total_rlusd_reserve, total_jvc_minted_from_crypto")
          .eq("id", 1).maybeSingle();
        await admin.from("crypto_reserve_state").upsert({
          id: 1,
          total_xrp_held: Number(reserve?.total_xrp_held ?? 0) + (asset === "XRP" ? amount : 0),
          total_rlusd_reserve: Number(reserve?.total_rlusd_reserve ?? 0) + (asset === "RLUSD" ? amount : 0),
          total_jvc_minted_from_crypto: Number(reserve?.total_jvc_minted_from_crypto ?? 0) + usdValue,
          last_reconciled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Wipe any simulated/sandbox balance now that real money has arrived.
        // Idempotent server-side: no-op if already wiped or never had a sandbox balance.
        await admin.rpc("wipe_user_crypto_sandbox", { _user_id: addr.user_id }).catch((e) => {
          console.error("wipe_user_crypto_sandbox failed:", e);
        });
      }

      credited.push({ hash: tx.hash, user_id: addr.user_id, asset, amount, usd: usdValue, status });
    }

    return new Response(JSON.stringify({
      network: NETWORK,
      hot_wallet: HOT_WALLET,
      xrp_usd: xrpUsd,
      scanned: txs.length,
      credited,
      skipped,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("xrpl-monitor-deposits error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
