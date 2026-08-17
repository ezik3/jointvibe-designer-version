// bridge-create-customer: creates (or refreshes) a Bridge customer + hosted KYC link
// for the authenticated user. Falls back to stub data when BRIDGE_API_KEY is unset
// so the rest of the app can be developed/tested without partner credentials.
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

    const { country_code = null, accept_tos = false } = await req.json().catch(() => ({}));
    if (!accept_tos) {
      return new Response(JSON.stringify({ error: "tos_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { liveMode } = bridgeConfig();
    let bridgeCustomerId: string;
    let kycLink: string;
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    if (liveMode) {
      const created = await bridgeFetch("/v0/customers", {
        method: "POST",
        body: JSON.stringify({
          email: user.email,
          country: country_code,
          external_id: user.id,
        }),
      });
      bridgeCustomerId = created.id;
      const kyc = await bridgeFetch(`/v0/customers/${bridgeCustomerId}/kyc_links`, {
        method: "POST",
        body: JSON.stringify({ redirect_uri: `${Deno.env.get("SUPABASE_URL")}/kyc/return` }),
      });
      kycLink = kyc.url;
    } else {
      bridgeCustomerId = stub.customerId();
      kycLink = stub.kycLink(bridgeCustomerId);
    }

    const { data: row, error } = await supabase
      .from("bridge_customers")
      .upsert({
        user_id: user.id,
        bridge_customer_id: bridgeCustomerId,
        kyc_status: "pending",
        kyc_link: kycLink,
        kyc_link_expires_at: expiresAt,
        country_code,
        tos_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      live_mode: liveMode,
      customer: row,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[bridge-create-customer] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
