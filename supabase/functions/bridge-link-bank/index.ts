// bridge-link-bank: registers a new external bank account with Bridge for the user.
// Stub mode auto-activates the account; live mode marks it pending until Bridge approves.
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

    const body = await req.json();
    const {
      rail, currency, beneficiary_name, account_label,
      account_number, routing_number, iban, bic,
    } = body ?? {};
    if (!rail || !currency || !beneficiary_name) {
      return new Response(JSON.stringify({ error: "invalid_input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: cust } = await supabase
      .from("bridge_customers").select("bridge_customer_id, kyc_status").eq("user_id", user.id).maybeSingle();
    if (!cust?.bridge_customer_id) {
      return new Response(JSON.stringify({ error: "kyc_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { liveMode } = bridgeConfig();
    let externalId: string;
    let status = "pending";

    if (liveMode) {
      const created = await bridgeFetch(
        `/v0/customers/${cust.bridge_customer_id}/external_accounts`,
        {
          method: "POST",
          body: JSON.stringify({
            rail, currency, beneficiary_name,
            account_number, routing_number, iban, bic,
          }),
        },
      );
      externalId = created.id;
      status = created.status ?? "pending";
    } else {
      externalId = stub.externalAccountId();
      status = "active"; // stub auto-approves so the rest of the flow is testable
    }

    const { data: row, error } = await supabase
      .from("bridge_external_accounts")
      .insert({
        user_id: user.id,
        bridge_external_account_id: externalId,
        rail, currency, beneficiary_name, account_label,
        status,
      })
      .select()
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, account: row }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[bridge-link-bank] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
