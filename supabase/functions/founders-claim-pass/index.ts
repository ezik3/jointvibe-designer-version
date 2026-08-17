import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.190.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashClaimCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.toUpperCase().replace(/-/g, ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(new Uint8Array(hashBuffer));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate user via service role getUser
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }

    const { claimCode, passType } = await req.json();

    if (!claimCode || typeof claimCode !== "string") {
      return new Response(JSON.stringify({ error: "Claim code is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const validPassType = passType === "venue" ? "venue" : "user";
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // Rate limiting
    const { data: rateLimit } = await supabaseAdmin
      .from("founder_claim_rate_limits")
      .select("*")
      .eq("identifier", user.email)
      .eq("identifier_type", "email")
      .maybeSingle();

    if (rateLimit) {
      if (rateLimit.locked_until && new Date(rateLimit.locked_until) > new Date()) {
        return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429,
        });
      }
      const oneHourAgo = new Date(Date.now() - 3600000);
      if (new Date(rateLimit.first_attempt_at) > oneHourAgo && rateLimit.attempts >= 5) {
        await supabaseAdmin.from("founder_claim_rate_limits")
          .update({ locked_until: new Date(Date.now() + 3600000).toISOString() })
          .eq("id", rateLimit.id);
        return new Response(JSON.stringify({ error: "Too many attempts. Please try again in 1 hour." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429,
        });
      }
      await supabaseAdmin.from("founder_claim_rate_limits")
        .update({ attempts: rateLimit.attempts + 1, last_attempt_at: new Date().toISOString() })
        .eq("id", rateLimit.id);
    } else {
      await supabaseAdmin.from("founder_claim_rate_limits").insert({
        identifier: user.email!,
        identifier_type: "email",
      });
    }

    // Hash and find purchase
    const normalizedCode = claimCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const codeHash = await hashClaimCode(normalizedCode);

    const { data: purchase } = await supabaseAdmin
      .from("founders_purchases")
      .select("*, city_product:city_products(*)")
      .eq("claim_code_hash", codeHash)
      .eq("pass_type", validPassType)
      .is("claimed_by_user_id", null)
      .in("status", ["paid", "created"])
      .maybeSingle();

    if (!purchase) {
      await supabaseAdmin.from("founder_audit_logs").insert({
        actor_user_id: user.id,
        action: "CLAIM_ATTEMPT_FAILED",
        entity_type: "claim_code",
        entity_id: normalizedCode.substring(0, 4),
        details: { reason: "not_found_or_claimed", pass_type: validPassType },
        ip_address: ip,
      });
      return new Response(JSON.stringify({ error: "Invalid or already claimed code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Check existing entitlement
    const { data: existingEntitlement } = await supabaseAdmin
      .from("founder_entitlements")
      .select("id")
      .eq("user_id", user.id)
      .eq("pass_type", validPassType)
      .in("status", ["active", "pending_kyc", "pending_claim"])
      .maybeSingle();

    if (existingEntitlement) {
      return new Response(JSON.stringify({ error: "You already have an active Founders Pass" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // Claim the purchase
    await supabaseAdmin.from("founders_purchases").update({
      claimed_by_user_id: user.id,
      claimed_at: new Date().toISOString(),
      status: "claimed",
    }).eq("id", purchase.id);

    // Create entitlement (active immediately; KYC can be checked later)
    const benefits = validPassType === "venue"
      ? ["Platinum Venue Status", "Priority Listing", "Venue Pre-Registration", "Activation Rewards", "Founder Crown Badge", "Priority Support"]
      : ["Platinum Membership", "7+ Days Early Access", "Venue Pre-Registration", "Activation Rewards", "Founder Badge", "Priority Support"];

    await supabaseAdmin.from("founder_entitlements").insert({
      user_id: user.id,
      pass_type: validPassType,
      city_product_id: purchase.city_product_id,
      status: "active",
      start_at: new Date().toISOString(),
      metadata: { benefits, platinum_access: true },
    });

    // Set founder flag
    if (validPassType === "venue") {
      // Set is_founder_venue on venue_classifications for the user's venues
      const { data: venues } = await supabaseAdmin
        .from("venues")
        .select("id")
        .eq("owner_user_id", user.id);

      if (venues && venues.length > 0) {
        for (const venue of venues) {
          await supabaseAdmin
            .from("venue_classifications")
            .update({ is_founder_venue: true })
            .eq("venue_id", venue.id);
        }
      }
    }

    // Clear rate limit
    await supabaseAdmin.from("founder_claim_rate_limits")
      .delete()
      .eq("identifier", user.email!)
      .eq("identifier_type", "email");

    // Audit
    await supabaseAdmin.from("founder_audit_logs").insert({
      actor_user_id: user.id,
      action: "PASS_CLAIMED",
      entity_type: "founders_purchase",
      entity_id: purchase.id,
      details: { city: purchase.city_product?.city, pass_type: validPassType },
      ip_address: ip,
    });

    return new Response(JSON.stringify({
      success: true,
      status: "active",
      city: purchase.city_product?.city,
      passType: validPassType,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Claim error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to claim pass" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
