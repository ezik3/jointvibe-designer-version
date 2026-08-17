// XRPL Deposit Address Issuer
// Pattern: shared hot wallet + unique destination tag per user (Binance/Kraken model).
// Saves 10 XRP base reserve per user vs creating a new account each time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Public testnet hot wallet placeholder. Override via XRPL_HOT_WALLET_ADDRESS secret in production.
const DEFAULT_TESTNET_HOT_WALLET = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const NETWORK = (Deno.env.get("XRPL_NETWORK") ?? "xrpl-testnet") as "xrpl-testnet" | "xrpl-mainnet";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const hotWallet = Deno.env.get("XRPL_HOT_WALLET_ADDRESS") ?? DEFAULT_TESTNET_HOT_WALLET;

    // Reuse existing if any
    const { data: existing } = await admin
      .from("crypto_deposit_addresses")
      .select("*")
      .eq("user_id", user.id)
      .eq("network", NETWORK)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        network: NETWORK,
        address: existing.hot_wallet_address,
        destination_tag: Number(existing.destination_tag),
        memo: `Send XRP or RLUSD with tag ${existing.destination_tag}. Funds without the tag may be lost.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Allocate a fresh destination tag
    const { data: seqRow, error: seqErr } = await admin.rpc("nextval", { sequence_name: "crypto_destination_tag_seq" } as any).single();
    let destinationTag: number;
    if (seqErr || !seqRow) {
      // Fallback: random in safe range
      destinationTag = Math.floor(Math.random() * 4_000_000_000) + 100_001;
    } else {
      destinationTag = Number((seqRow as any).nextval ?? seqRow);
    }

    const { error: insErr } = await admin.from("crypto_deposit_addresses").insert({
      user_id: user.id,
      network: NETWORK,
      hot_wallet_address: hotWallet,
      destination_tag: destinationTag,
      preferred_asset: "XRP",
    });

    if (insErr) {
      // Race condition fallback — retry select
      const { data: again } = await admin
        .from("crypto_deposit_addresses").select("*")
        .eq("user_id", user.id).eq("network", NETWORK).maybeSingle();
      if (again) {
        return new Response(JSON.stringify({
          network: NETWORK,
          address: again.hot_wallet_address,
          destination_tag: Number(again.destination_tag),
          memo: `Send XRP or RLUSD with tag ${again.destination_tag}.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw insErr;
    }

    return new Response(JSON.stringify({
      network: NETWORK,
      address: hotWallet,
      destination_tag: destinationTag,
      memo: `Send XRP or RLUSD with tag ${destinationTag}. Funds without the tag may be lost.`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("xrpl-get-deposit-address error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
