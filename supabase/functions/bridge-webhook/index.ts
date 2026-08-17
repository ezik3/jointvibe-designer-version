// bridge-webhook: receives status updates from Bridge.xyz.
// Verifies HMAC signature, dedupes by event id, dispatches to status RPCs.
// In stub mode (no BRIDGE_WEBHOOK_SECRET) signature check is skipped — useful
// for replaying mock events during development.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { bridgeConfig } from "../_shared/bridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-signature",
};

async function verifyHmac(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { webhookSecret } = bridgeConfig();
    const raw = await req.text();
    const sig = req.headers.get("x-bridge-signature") ?? "";

    // Verify signature ONLY when a webhook secret is configured.
    // Sandbox does not yet emit signed webhooks — once BRIDGE_WEBHOOK_SECRET
    // is set (production), verification turns on automatically.
    if (webhookSecret) {
      const ok = await verifyHmac(raw, sig, webhookSecret);
      if (!ok) {
        return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      console.warn("[bridge-webhook] no BRIDGE_WEBHOOK_SECRET set — skipping signature verification (sandbox mode)");
    }

    const event = JSON.parse(raw);
    const eventId: string = event.id ?? crypto.randomUUID();
    const eventType: string = event.type ?? "unknown";

    // Idempotency: dedupe by Bridge event id
    const { data: existing } = await supabase
      .from("bridge_webhook_events").select("id, processed").eq("bridge_event_id", eventId).maybeSingle();
    if (existing?.processed) {
      return new Response(JSON.stringify({ ok: true, deduped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!existing) {
      await supabase.from("bridge_webhook_events").insert({
        bridge_event_id: eventId, event_type: eventType, payload: event,
      });
    }

    try {
      const data = event.data ?? {};
      switch (eventType) {
        case "kyc.approved":
        case "customer.kyc.approved":
          await supabase.from("bridge_customers").update({
            kyc_status: "approved",
            updated_at: new Date().toISOString(),
          }).eq("bridge_customer_id", data.customer_id);
          break;

        case "kyc.rejected":
        case "customer.kyc.rejected":
          await supabase.from("bridge_customers").update({
            kyc_status: "rejected",
            rejection_reason: data.reason ?? null,
            updated_at: new Date().toISOString(),
          }).eq("bridge_customer_id", data.customer_id);
          break;

        case "external_account.activated":
          await supabase.from("bridge_external_accounts").update({
            status: "active",
            updated_at: new Date().toISOString(),
          }).eq("bridge_external_account_id", data.external_account_id);
          break;

        case "transfer.completed":
          await supabase.rpc("complete_bridge_transfer", {
            p_transfer_id: data.external_id,
            p_destination_amount: Number(data.destination_amount ?? 0),
            p_bank_reference: data.bank_reference ?? null,
            p_bridge_transfer_id: data.transfer_id,
          });
          break;

        case "transfer.failed":
          await supabase.rpc("fail_bridge_transfer", {
            p_transfer_id: data.external_id,
            p_reason: data.reason ?? "unknown",
          });
          break;

        default:
          console.log("[bridge-webhook] unhandled", eventType);
      }

      await supabase.from("bridge_webhook_events").update({
        processed: true, processed_at: new Date().toISOString(),
      }).eq("bridge_event_id", eventId);
    } catch (handlerErr) {
      await supabase.from("bridge_webhook_events").update({
        error: (handlerErr as Error).message?.slice(0, 240) ?? "handler_error",
      }).eq("bridge_event_id", eventId);
      throw handlerErr;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[bridge-webhook] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
