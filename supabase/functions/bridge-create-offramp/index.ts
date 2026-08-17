// bridge-create-offramp: user requests a fiat payout to their linked bank.
// Validates KYC, creates a pending transfer row, then registers it with Bridge.
// Stub mode auto-completes for development.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { bridgeConfig, bridgeFetch, stub } from "../_shared/bridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { external_account_id, source_asset = "RLUSD", source_amount, destination_currency = "USD" } = await req.json();
    if (!external_account_id || !source_amount || source_amount <= 0) {
      return new Response(JSON.stringify({ error: "invalid_input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: transferId, error: rpcErr } = await supabase.rpc("request_bridge_offramp", {
      p_user_id: user.id,
      p_external_account_id: external_account_id,
      p_source_asset: source_asset,
      p_source_amount: source_amount,
      p_destination_currency: destination_currency,
    });
    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { liveMode } = bridgeConfig();
    let bridgeXferId: string;
    let estimatedArrival: string | null = null;

    if (liveMode) {
      const { data: cust } = await supabase
        .from("bridge_customers").select("bridge_customer_id").eq("user_id", user.id).single();
      const { data: ext } = await supabase
        .from("bridge_external_accounts").select("bridge_external_account_id").eq("id", external_account_id).single();

      const created = await bridgeFetch("/v0/transfers", {
        method: "POST",
        body: JSON.stringify({
          customer_id: cust?.bridge_customer_id,
          source: { payment_rail: "xrpl", currency: source_asset.toLowerCase(), amount: String(source_amount) },
          destination: {
            payment_rail: "ach",
            currency: destination_currency.toLowerCase(),
            external_account_id: ext?.bridge_external_account_id,
          },
        }),
      });
      bridgeXferId = created.id;
      estimatedArrival = created.estimated_arrival ?? null;
    } else {
      bridgeXferId = stub.transferId();
      estimatedArrival = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    }

    await supabase.from("bridge_transfers").update({
      bridge_transfer_id: bridgeXferId,
      status: "processing",
      estimated_arrival: estimatedArrival,
    }).eq("id", transferId);

    return new Response(JSON.stringify({
      success: true,
      transfer_id: transferId,
      bridge_transfer_id: bridgeXferId,
      live_mode: liveMode,
      estimated_arrival: estimatedArrival,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[bridge-create-offramp] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
