import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(Deno.env.get("PIN_SALT") || "jointvibe-pin-salt-2025");
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return base64Encode(new Uint8Array(derivedBits));
}

async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const newHash = await hashPin(pin);
  return newHash === hash;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const token = authHeader.replace("Bearer ", "");

    // Use anon-key client to validate the JWT (signing-keys system)
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: claimsData, error: authError } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (authError || !userId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const user = { id: userId };

    const { action, pin, new_pin } = await req.json();

    // Get existing settings
    let { data: settings } = await supabase
      .from("payment_security_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!settings && action !== "setup" && action !== "check_status") {
      return new Response(
        JSON.stringify({ error: "pin_not_set", message: "Please set up your payment PIN first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ CHECK STATUS ============
    if (action === "check_status") {
      return new Response(
        JSON.stringify({
          pin_set: !!settings?.payment_pin_hash,
          face_enabled: settings?.face_enabled || false,
          face_threshold: settings?.face_threshold || "never",
          has_enrolled_selfie: !!settings?.enrolled_selfie_url,
          trusted_device_count: Array.isArray(settings?.trusted_devices) ? settings.trusted_devices.length : 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ SETUP PIN ============
    if (action === "setup") {
      if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
        return new Response(
          JSON.stringify({ error: "invalid_pin", message: "PIN must be exactly 6 digits." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const obviousPins = ["000000", "111111", "222222", "333333", "444444", "555555",
        "666666", "777777", "888888", "999999", "123456", "654321", "123123"];
      if (obviousPins.includes(pin)) {
        return new Response(
          JSON.stringify({ error: "weak_pin", message: "This PIN is too easy to guess. Please choose a stronger one." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pinHash = await hashPin(pin);

      const { error } = await supabase
        .from("payment_security_settings")
        .upsert({
          user_id: user.id,
          payment_pin_hash: pinHash,
          pin_set_at: new Date().toISOString(),
          pin_failed_attempts: 0,
          pin_locked_until: null,
        }, { onConflict: "user_id" });

      if (error) throw error;

      // Also create transaction limits with defaults
      await supabase
        .from("transaction_limits")
        .upsert({
          user_id: user.id,
          daily_spend_limit: 500.00,
          per_transaction_limit: 200.00,
          daily_withdrawal_limit: 1000.00,
        }, { onConflict: "user_id" });

      return new Response(
        JSON.stringify({ success: true, message: "Payment PIN set successfully." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ VERIFY PIN ============
    if (action === "verify") {
      if (!pin) {
        return new Response(
          JSON.stringify({ error: "missing_pin", message: "PIN is required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check lockout
      if (settings.pin_locked_until && new Date(settings.pin_locked_until) > new Date()) {
        const remainingMs = new Date(settings.pin_locked_until).getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        return new Response(
          JSON.stringify({
            error: "pin_locked",
            message: `Too many failed attempts. Try again in ${remainingMin} minute${remainingMin > 1 ? "s" : ""}.`,
            locked_until: settings.pin_locked_until,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isValid = await verifyPin(pin, settings.payment_pin_hash);

      if (!isValid) {
        const newAttempts = (settings.pin_failed_attempts || 0) + 1;
        let lockUntil = null;

        if (newAttempts >= 10) {
          lockUntil = new Date(Date.now() + 60 * 60000).toISOString();
        } else if (newAttempts >= 7) {
          lockUntil = new Date(Date.now() + 15 * 60000).toISOString();
        } else if (newAttempts >= 5) {
          lockUntil = new Date(Date.now() + 5 * 60000).toISOString();
        } else if (newAttempts >= 3) {
          lockUntil = new Date(Date.now() + 1 * 60000).toISOString();
        }

        await supabase
          .from("payment_security_settings")
          .update({
            pin_failed_attempts: newAttempts,
            pin_locked_until: lockUntil,
          })
          .eq("user_id", user.id);

        await supabase.from("payment_verification_log").insert({
          user_id: user.id,
          verification_method: "pin",
          success: false,
          failure_reason: "incorrect_pin",
          ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
        });

        return new Response(
          JSON.stringify({
            error: "incorrect_pin",
            message: newAttempts < 3
              ? `Incorrect PIN. ${3 - newAttempts} attempt${3 - newAttempts > 1 ? "s" : ""} before temporary lock.`
              : "Incorrect PIN. Your account has been temporarily locked.",
            attempts: newAttempts,
            locked_until: lockUntil,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // PIN correct — reset attempts
      await supabase
        .from("payment_security_settings")
        .update({
          pin_failed_attempts: 0,
          pin_locked_until: null,
          last_verification_method: "pin",
          last_verification_at: new Date().toISOString(),
          total_pin_verifications: (settings.total_pin_verifications || 0) + 1,
        })
        .eq("user_id", user.id);

      await supabase.from("payment_verification_log").insert({
        user_id: user.id,
        verification_method: "pin",
        success: true,
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
      });

      return new Response(
        JSON.stringify({ success: true, verified: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ CHANGE PIN ============
    if (action === "change") {
      if (!pin || !new_pin) {
        return new Response(
          JSON.stringify({ error: "missing_pins", message: "Current PIN and new PIN are required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isCurrentValid = await verifyPin(pin, settings.payment_pin_hash);
      if (!isCurrentValid) {
        return new Response(
          JSON.stringify({ error: "incorrect_pin", message: "Current PIN is incorrect." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (new_pin.length !== 6 || !/^\d{6}$/.test(new_pin)) {
        return new Response(
          JSON.stringify({ error: "invalid_pin", message: "New PIN must be exactly 6 digits." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const obviousPins = ["000000", "111111", "222222", "333333", "444444", "555555",
        "666666", "777777", "888888", "999999", "123456", "654321", "123123"];
      if (obviousPins.includes(new_pin)) {
        return new Response(
          JSON.stringify({ error: "weak_pin", message: "This PIN is too easy to guess. Please choose a stronger one." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newPinHash = await hashPin(new_pin);
      await supabase
        .from("payment_security_settings")
        .update({
          payment_pin_hash: newPinHash,
          pin_set_at: new Date().toISOString(),
          pin_failed_attempts: 0,
          pin_locked_until: null,
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, message: "Payment PIN changed successfully." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("Payment PIN error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
