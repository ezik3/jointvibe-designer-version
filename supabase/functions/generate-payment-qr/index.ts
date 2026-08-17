import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const userId = userData.user.id;

    // Parse request body
    const { venue_id, order_id, amount, expires_in_minutes = 10 } = await req.json();

    // INPUT VALIDATION: UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!venue_id) {
      return new Response(JSON.stringify({ error: 'Missing venue_id' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    if (!uuidRegex.test(venue_id)) {
      return new Response(JSON.stringify({ error: 'Invalid venue_id format' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    if (order_id && !uuidRegex.test(order_id)) {
      return new Response(JSON.stringify({ error: 'Invalid order_id format' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (amount == null || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      return new Response(JSON.stringify({ error: 'Amount must be greater than 0' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // INPUT VALIDATION: Amount maximum limit
    if (Number(amount) > 1000000) {
      return new Response(JSON.stringify({ error: 'Amount exceeds maximum limit of 1,000,000' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    // INPUT VALIDATION: expires_in_minutes must be between 1-1440 (1 minute to 24 hours)
    const validExpiry = Math.min(Math.max(Number(expires_in_minutes) || 10, 1), 1440);
    if (typeof expires_in_minutes !== 'number' && expires_in_minutes !== undefined) {
      console.warn('Invalid expires_in_minutes, using default:', expires_in_minutes);
    }

    // Check if user is authorized for this venue (either owner or employee)
    // First check if user is the venue owner
    const { data: venueOwnership, error: ownerError } = await supabase
      .from('venues')
      .select('id, name, owner_user_id')
      .eq('id', venue_id)
      .single();

    if (ownerError || !venueOwnership) {
      console.error('Venue lookup error:', ownerError);
      return new Response(JSON.stringify({ error: 'Venue not found' }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const isVenueOwner = venueOwnership?.owner_user_id === userId;
    console.log('Auth check:', { userId, venue_id, owner_user_id: venueOwnership?.owner_user_id, isVenueOwner });

    // If not owner, check employee link
    let isEmployee = false;
    if (!isVenueOwner) {
      const { data: employeeLink, error: linkError } = await supabase
        .from('employee_venue_links')
        .select('id, permissions')
        .eq('venue_id', venue_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      isEmployee = !!employeeLink;
    }

    if (!isVenueOwner && !isEmployee) {
      return new Response(JSON.stringify({ error: 'Not authorized for this venue' }), { 
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Generate secure QR token
    const qrToken = crypto.randomUUID() + '-' + Date.now().toString(36);
    
    // Calculate expiration using validated expiry time
    const expiresAt = new Date(Date.now() + validExpiry * 60 * 1000);

    // Create payment request
    const { data: paymentRequest, error: insertError } = await supabase
      .from('payment_requests')
      .insert({
        venue_id,
        order_id,
        amount,
        fee: 0.10,
        status: 'pending',
        qr_token: qrToken,
        expires_at: expiresAt.toISOString(),
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create payment request' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Generate QR data - always point to the *current* app origin when possible
    const originHeader = req.headers.get('origin');
    const refererHeader = req.headers.get('referer');

    let appOrigin = originHeader;
    if (!appOrigin && refererHeader) {
      try {
        appOrigin = new URL(refererHeader).origin;
      } catch {
        // ignore
      }
    }

    // Fallback for native/embedded contexts where Origin/Referer may be missing
    if (!appOrigin || appOrigin.startsWith('capacitor://') || appOrigin.startsWith('http://localhost')) {
      appOrigin = `https://fctchotvtulopafnhohn.lovableproject.com`;
    }

    const webFallbackUrl = `${appOrigin}/app/pay/${qrToken}`;

    return new Response(JSON.stringify({
      success: true,
      payment_request_id: paymentRequest.id,
      qr_token: qrToken,
      qr_data: webFallbackUrl,
      amount,
      fee: 0.10,
      total: amount + 0.10,
      venue_name: venueOwnership?.name || 'Venue',
      expires_at: expiresAt.toISOString(),
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
