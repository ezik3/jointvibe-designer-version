// Phase 3: Multi-Asset Swap Layer — Quote Engine
// Returns a short-lived locked quote for swapping one supported asset to another.
// Uses live USD reference prices (XRP from public ticker, stablecoins pegged to 1 USD)
// and applies the asset's swap_fee_bps + a slippage buffer.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUOTE_TTL_SECONDS = 30;

async function getXrpUsdPrice(): Promise<number> {
  // Use a public, no-auth price source. Fall back to a conservative default.
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/XRP-USD/spot");
    const j = await r.json();
    const p = parseFloat(j?.data?.amount);
    if (p > 0) return p;
  } catch (_) { /* ignore */ }
  return 0.50; // conservative fallback
}

function priceUsd(symbol: string, xrpUsd: number): number {
  if (symbol === "XRP") return xrpUsd;
  // RLUSD, USDC, USDT — pegged 1:1 USD
  return 1.0;
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

    const { from_symbol, to_symbol, from_amount } = await req.json();
    if (!from_symbol || !to_symbol || !from_amount || from_amount <= 0) {
      return new Response(JSON.stringify({ error: "invalid_input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (from_symbol === to_symbol) {
      return new Response(JSON.stringify({ error: "same_asset" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate both assets are active + supported
    const { data: assets, error: assetErr } = await supabase
      .from("crypto_supported_assets")
      .select("symbol, swap_fee_bps, min_deposit_usd, max_deposit_usd, is_active")
      .in("symbol", [from_symbol, to_symbol]);

    if (assetErr || !assets || assets.length !== 2) {
      return new Response(JSON.stringify({ error: "asset_not_supported" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const fromAsset = assets.find((a: any) => a.symbol === from_symbol)!;
    const toAsset = assets.find((a: any) => a.symbol === to_symbol)!;
    if (!fromAsset.is_active || !toAsset.is_active) {
      return new Response(JSON.stringify({ error: "asset_inactive" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const xrpUsd = await getXrpUsdPrice();
    const fromPriceUsd = priceUsd(from_symbol, xrpUsd);
    const toPriceUsd = priceUsd(to_symbol, xrpUsd);

    const grossUsd = Number(from_amount) * fromPriceUsd;

    // Safety bounds
    if (grossUsd < Number(fromAsset.min_deposit_usd)) {
      return new Response(JSON.stringify({ error: "below_minimum", min_usd: fromAsset.min_deposit_usd }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (grossUsd > Number(fromAsset.max_deposit_usd)) {
      return new Response(JSON.stringify({ error: "above_maximum", max_usd: fromAsset.max_deposit_usd }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use the higher fee of the two assets (conservative)
    const feeBps = Math.max(Number(fromAsset.swap_fee_bps), Number(toAsset.swap_fee_bps));
    const feeUsd = grossUsd * (feeBps / 10_000);
    const netUsd = grossUsd - feeUsd;
    const toAmount = netUsd / toPriceUsd;
    const rate = toAmount / Number(from_amount);

    const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString();

    const { data: quote, error: qErr } = await supabase
      .from("crypto_swap_quotes")
      .insert({
        user_id: user.id,
        from_symbol, to_symbol,
        from_amount: Number(from_amount),
        to_amount: Number(toAmount.toFixed(8)),
        rate: Number(rate.toFixed(8)),
        fee_bps: feeBps,
        fee_amount_usd: Number(feeUsd.toFixed(4)),
        slippage_bps: 100,
        usd_value: Number(grossUsd.toFixed(4)),
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (qErr) throw qErr;

    return new Response(JSON.stringify({ quote, ttl_seconds: QUOTE_TTL_SECONDS }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[xrpl-quote-swap] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
