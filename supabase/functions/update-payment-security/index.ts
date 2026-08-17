import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Not authenticated");

    const { action, face_threshold, selfie_base64, pin, device_id } = await req.json();

    // Get existing settings
    const { data: settings } = await supabase
      .from("payment_security_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!settings) {
      return new Response(
        JSON.stringify({ error: "no_settings", message: "Set up your payment PIN first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All security changes require PIN verification (except 'check')
    if (action !== "check") {
      if (!pin) {
        return new Response(
          JSON.stringify({ error: "pin_required", message: "Enter your PIN to make security changes." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify PIN internally using the same PBKDF2 approach
      const { encode: base64Encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
      const encoder = new TextEncoder();
      const salt = encoder.encode(Deno.env.get("PIN_SALT") || "jointvibe-pin-salt-2025");
      const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
      const derivedBits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
      const pinHash = base64Encode(new Uint8Array(derivedBits));

      if (pinHash !== settings.payment_pin_hash) {
        return new Response(
          JSON.stringify({ error: "incorrect_pin", message: "Incorrect PIN. Security changes require PIN verification." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ============ ENABLE FACE ============
    if (action === "enable_face") {
      await supabase
        .from("payment_security_settings")
        .update({
          face_enabled: true,
          face_threshold: face_threshold || "over_50",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, message: "Facial recognition enabled for payments." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ DISABLE FACE ============
    if (action === "disable_face") {
      await supabase
        .from("payment_security_settings")
        .update({
          face_enabled: false,
          face_threshold: "never",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, message: "Facial recognition disabled. PIN will be used for all payments." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ UPDATE THRESHOLD ============
    if (action === "update_threshold") {
      if (!["every", "over_50", "over_100", "never"].includes(face_threshold)) {
        return new Response(
          JSON.stringify({ error: "invalid_threshold", message: "Invalid threshold value." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("payment_security_settings")
        .update({
          face_threshold,
          face_enabled: face_threshold !== "never",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, message: `Face recognition threshold updated to: ${face_threshold}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ ENROLL FACE ============
    if (action === "enroll_face") {
      if (!selfie_base64) {
        return new Response(
          JSON.stringify({ error: "missing_selfie", message: "Selfie image required for enrollment." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fileName = `${user.id}/payment_reference_${Date.now()}.jpg`;
      const selfieBytes = Uint8Array.from(atob(selfie_base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from("verification-documents")
        .upload(fileName, selfieBytes, { contentType: "image/jpeg", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("verification-documents")
        .getPublicUrl(fileName);

      await supabase
        .from("payment_security_settings")
        .update({
          enrolled_selfie_url: urlData.publicUrl,
          enrolled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, message: "Face enrolled successfully for payment verification." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ REMOVE TRUSTED DEVICE ============
    if (action === "remove_trusted_device") {
      if (!device_id) {
        return new Response(
          JSON.stringify({ error: "missing_device_id", message: "Device ID required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updatedDevices = (settings.trusted_devices || []).filter((d: any) => d.device_id !== device_id);
      await supabase
        .from("payment_security_settings")
        .update({ trusted_devices: updatedDevices, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, message: "Trusted device removed." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ UPDATE LIMITS ============
    if (action === "update_limits") {
      const { daily_spend_limit, per_transaction_limit, daily_withdrawal_limit } = await req.json().catch(() => ({}));
      const updates: any = { updated_at: new Date().toISOString() };
      if (daily_spend_limit !== undefined) updates.daily_spend_limit = Math.max(0, Number(daily_spend_limit));
      if (per_transaction_limit !== undefined) updates.per_transaction_limit = Math.max(0, Number(per_transaction_limit));
      if (daily_withdrawal_limit !== undefined) updates.daily_withdrawal_limit = Math.max(0, Number(daily_withdrawal_limit));

      await supabase
        .from("transaction_limits")
        .update(updates)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, message: "Transaction limits updated." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("Payment security settings error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
