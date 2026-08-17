import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter (per-IP)
const rateLimitMap = new Map<string, { requests: number; resetTime: number }>();
const MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(ip, { requests: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (limit.requests >= MAX_REQUESTS) {
    return false;
  }

  limit.requests++;
  return true;
}

// Token can be either:
// - payment_requests.id (UUID)
// - payment_requests.qr_token (UUID + '-' + base36 timestamp)
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Validate QR token format
function isValidQRToken(token: string): boolean {
  if (!token || token.length < 32 || token.length > 100) {
    return false;
  }
  // Allow alphanumeric and hyphens only
  return /^[a-zA-Z0-9-]+$/.test(token);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting by IP
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    if (!checkRateLimit(clientIP)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), { 
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);

    // Support BOTH:
    // - GET /get-payment-request?qr_token=...
    // - POST { qr_token: "..." }
    let tokenOrId = url.searchParams.get('qr_token');

    if (!tokenOrId) {
      try {
        const body = await req.json();
        if (body?.qr_token) tokenOrId = body.qr_token;
      } catch {
        // ignore
      }
    }

    if (!tokenOrId) {
      return new Response(JSON.stringify({ error: 'Missing qr_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    tokenOrId = String(tokenOrId).trim();

    const isIdLookup = isUuid(tokenOrId);

    // Validate format for qr_token lookups (UUID id is validated separately)
    if (!isIdLookup && !isValidQRToken(tokenOrId)) {
      return new Response(JSON.stringify({ error: 'Invalid qr_token format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch payment request with minimal venue details (only name for display)
    const query = supabase
      .from('payment_requests')
      .select('id, venue_id, amount, fee, status, expires_at, created_at, order_id, venues(id, name)');
    const { data: paymentRequest, error } = isIdLookup
      ? await query.eq('id', tokenOrId).single()
      : await query.eq('qr_token', tokenOrId).single();

    if (error || !paymentRequest) {
      // Use generic error to prevent enumeration
      return new Response(JSON.stringify({ error: 'Payment request not found or expired' }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Check if expired
    const isExpired = new Date(paymentRequest.expires_at) < new Date();
    
    if (isExpired && paymentRequest.status === 'pending') {
      // Mark as expired
      await supabase
        .from('payment_requests')
        .update({ status: 'expired' })
        .eq('id', paymentRequest.id);
      paymentRequest.status = 'expired';
    }

    // Fetch order subtotal/total and notes to compute tax ratio and detect order type
    let orderSubtotal: number | null = null;
    let orderTotal: number | null = null;
    let orderNotes: string | null = null;
    if (paymentRequest.order_id) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('subtotal, total, notes')
        .eq('id', paymentRequest.order_id)
        .single();
      if (orderData) {
        orderSubtotal = Number(orderData.subtotal);
        orderTotal = Number(orderData.total);
        orderNotes = orderData.notes || null;
      }
    }

    // Return minimal data - no sensitive venue details (address removed)
    return new Response(JSON.stringify({
      id: paymentRequest.id,
      venue_id: paymentRequest.venue_id,
      venue_name: (paymentRequest.venues as unknown as { id: string; name: string } | null)?.name || 'Unknown Venue',
      order_id: paymentRequest.order_id,
      amount: Number(paymentRequest.amount),
      fee: Number(paymentRequest.fee),
      total: Number(paymentRequest.amount) + Number(paymentRequest.fee),
      status: paymentRequest.status,
      expires_at: paymentRequest.expires_at,
      is_expired: isExpired,
      order_subtotal: orderSubtotal,
      order_total: orderTotal,
      order_notes: orderNotes,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
