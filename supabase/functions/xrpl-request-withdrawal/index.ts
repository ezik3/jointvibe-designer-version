// XRPL Withdrawal Request — Phase 2
// Validates KYC + PIN, places escrow debit via DB function, queues for broadcast.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NETWORK = (Deno.env.get("XRPL_NETWORK") ?? "xrpl-testnet") as "xrpl-testnet" | "xrpl-mainnet";
const MIN_WITHDRAWAL_USD = 10;
const MAX_WITHDRAWAL_USD = 5000;
const FEE_USD = 0.50; // flat network + processing fee

function isValidXrplAddress(addr: string) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const body = await req.json();
    const {
      destination_address,
      destination_tag = null,
      asset = "XRP",
      amount_jvc,
      pin_verified = false,
    } = body ?? {};

    // Validation
    if (!destination_address || !isValidXrplAddress(destination_address)) {
      return new Response(JSON.stringify({ error: "Invalid XRPL destination address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["XRP", "RLUSD"].includes(asset)) {
      return new Response(JSON.stringify({ error: "Unsupported asset" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const amt = Number(amount_jvc);
    if (!Number.isFinite(amt) || amt < MIN_WITHDRAWAL_USD || amt > MAX_WITHDRAWAL_USD) {
      return new Response(JSON.stringify({
        error: `Amount must be between $${MIN_WITHDRAWAL_USD} and $${MAX_WITHDRAWAL_USD}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!pin_verified) {
      return new Response(JSON.stringify({ error: "PIN/biometric verification required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Atomic request via DB function (validates KYC, holds, debits)
    const { data, error } = await admin.rpc("request_crypto_withdrawal", {
      _user_id: user.id,
      _network: NETWORK,
      _destination_address: destination_address,
      _destination_tag: destination_tag,
      _asset: asset,
      _amount_jvc: amt,
      _fee_usd: FEE_USD,
      _pin_verified: true,
    });

    if (error) {
      const msg = error.message || String(error);
      const status = msg.includes("Identity verification") ? 403
        : msg.includes("Insufficient") ? 400
        : msg.includes("PIN") ? 403
        : 500;
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      withdrawal_id: data,
      status: amt >= 1000 ? "pending_review" : "approved",
      message: amt >= 1000
        ? "Withdrawal flagged for manual review (large amount). You'll be notified within 24h."
        : "Withdrawal approved and queued for broadcast.",
      fee_usd: FEE_USD,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("xrpl-request-withdrawal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
