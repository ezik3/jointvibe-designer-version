import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function extractPayToken(input: string): string | null {
  const value = String(input || "").trim();
  if (!value) return null;

  // If it's a full URL with /app/pay/:token
  const pathMatch = value.match(/\/app\/pay\/([a-zA-Z0-9_-]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  // If it's a URL with qr_token query param
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      const qp = url.searchParams.get("qr_token");
      if (qp) return qp;
    }
  } catch {
    // ignore
  }

  // If it's a bare token
  if (/^[a-zA-Z0-9-]{32,120}$/.test(value)) return value;

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("[send-payment-link] Starting...");

    // Auth (venue staff)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[send-payment-link] No auth header");
      return new Response(JSON.stringify({ success: false, error: "Unauthorized - no auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      console.log("[send-payment-link] User auth failed:", userError?.message);
      return new Response(JSON.stringify({ success: false, error: "Unauthorized - invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    console.log("[send-payment-link] Requester userId:", userId);

    const body = await req.json().catch(() => ({}));
    const venueId = body?.venue_id as string | undefined;
    const customerUserId = body?.customer_user_id as string | undefined;
    const paymentLink = body?.payment_link as string | undefined;
    const amount = Number(body?.amount);

    console.log("[send-payment-link] Body:", { venueId, customerUserId, amount, paymentLink: paymentLink?.substring(0, 60) });

    if (!venueId || !isUuid(venueId)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid venue_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customerUserId || !isUuid(customerUserId)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid customer_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!paymentLink || typeof paymentLink !== "string" || paymentLink.length < 10 || paymentLink.length > 500) {
      return new Response(JSON.stringify({ success: false, error: "Invalid payment_link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (Number.isNaN(amount) || amount <= 0 || amount > 1000000) {
      return new Response(JSON.stringify({ success: false, error: "Invalid amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: venue owner or active employee
    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id, name, owner_user_id")
      .eq("id", venueId)
      .single();

    if (venueError || !venue) {
      console.log("[send-payment-link] Venue not found:", venueError?.message);
      return new Response(JSON.stringify({ success: false, error: "Venue not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwner = venue.owner_user_id === userId;
    console.log("[send-payment-link] Authorization check - isOwner:", isOwner, "venue.owner_user_id:", venue.owner_user_id);

    let isEmployee = false;
    if (!isOwner) {
      const { data: employeeLink } = await supabase
        .from("employee_venue_links")
        .select("id")
        .eq("venue_id", venueId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      isEmployee = !!employeeLink;
      console.log("[send-payment-link] Employee check:", isEmployee);
    }

    if (!isOwner && !isEmployee) {
      console.log("[send-payment-link] NOT AUTHORIZED - userId:", userId, "does not own or work at venue:", venueId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Not authorized for this venue. Must be owner or active employee.",
        debug: { requesterId: userId, venueOwnerId: venue.owner_user_id }
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payToken = extractPayToken(paymentLink);
    console.log("[send-payment-link] Extracted payToken:", payToken);
    
    if (!payToken) {
      return new Response(JSON.stringify({ success: false, error: "Could not extract token from payment_link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve to payment_request
    const { data: paymentRequest, error: prError } = await supabase
      .from("payment_requests")
      .select("id, venue_id, status, expires_at, qr_token")
      .eq("qr_token", payToken)
      .maybeSingle();

    if (prError || !paymentRequest) {
      console.log("[send-payment-link] Payment request not found for token:", payToken, prError?.message);
      return new Response(JSON.stringify({ success: false, error: "Payment request not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[send-payment-link] Found payment_request:", paymentRequest.id, "venue:", paymentRequest.venue_id);

    if (paymentRequest.venue_id !== venueId) {
      console.log("[send-payment-link] Venue mismatch:", paymentRequest.venue_id, "!=", venueId);
      return new Response(JSON.stringify({ success: false, error: "Payment request does not belong to this venue" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = `You have a payment request for $${amount.toFixed(2)} at ${venue.name}. Tap to review & pay.`;

    // Insert notification with payment_request.id as reference_id
    // The popup will navigate to /app/pay/{id} and get-payment-request handles both UUID and qr_token
    const { error: insertError } = await supabase.from("customer_notifications").insert({
      user_id: customerUserId,
      title: "Payment Request",
      message,
      type: "payment_request",
      reference_type: "payment_request",
      reference_id: paymentRequest.id, // UUID - get-payment-request can look up by id
      read: false,
    });

    if (insertError) {
      console.error("[send-payment-link] Insert notification error:", insertError);
      return new Response(JSON.stringify({ success: false, error: "Failed to create notification", details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[send-payment-link] SUCCESS! Notification sent to customer:", customerUserId, "with reference_id:", paymentRequest.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[send-payment-link] Unexpected error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internal server error", details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
