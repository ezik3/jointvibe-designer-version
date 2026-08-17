import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate time-based VPK using HMAC - rotates every 30 seconds
async function generateVPK(venueId: string, secret: string): Promise<string> {
  const timeBucket = Math.floor(Date.now() / 30000); // 30 second buckets
  const data = `${venueId}:${timeBucket}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Return first 12 characters for BLE-friendly short VPK
  return hashHex.substring(0, 12);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { venue_id } = await req.json();

    if (!venue_id) {
      return new Response(
        JSON.stringify({ error: 'venue_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is checked-in to this venue OR is staff at this venue
    const { data: checkIn } = await supabaseClient
      .from('check_ins')
      .select('id')
      .eq('user_id', user.id)
      .eq('venue_id', venue_id)
      .is('checked_out_at', null)
      .single();

    const { data: staffLink } = await supabaseClient
      .from('employee_venue_links')
      .select('id')
      .eq('user_id', user.id)
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .single();

    // Also check if user is venue owner
    const { data: venueOwner } = await supabaseClient
      .from('venues')
      .select('id')
      .eq('id', venue_id)
      .eq('owner_user_id', user.id)
      .single();

    if (!checkIn && !staffLink && !venueOwner) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to access this venue VPK' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vpkSecret = Deno.env.get('VPK_SECRET');
    if (!vpkSecret) {
      console.error('VPK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vpk = await generateVPK(venue_id, vpkSecret);
    const expiresAt = Math.ceil(Date.now() / 30000) * 30000; // Next rotation time

    console.log(`Generated VPK for venue ${venue_id}, user ${user.id}, role: ${staffLink ? 'staff' : venueOwner ? 'owner' : 'customer'}`);

    return new Response(
      JSON.stringify({ 
        vpk,
        venue_id,
        expires_at: expiresAt,
        is_staff: !!(staffLink || venueOwner)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating VPK:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
