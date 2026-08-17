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

  console.log('[get-order-items] Request received');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header for customer verification (optional for viewing)
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const body = await req.json();
    const { order_id, payment_request_id } = body;
    
    console.log('[get-order-items] Input:', { order_id, payment_request_id, userId });

    let orderId = order_id;

    // If we have a payment_request_id, look up the order_id
    if (!orderId && payment_request_id) {
      const { data: pr, error: prError } = await supabase
        .from('payment_requests')
        .select('order_id')
        .eq('id', payment_request_id)
        .single();
      
      if (prError || !pr) {
        console.error('[get-order-items] Payment request not found:', prError);
        return new Response(
          JSON.stringify({ success: false, error: 'not_found', detail: 'Payment request not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      orderId = pr.order_id;
    }

    if (!orderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_input', detail: 'order_id or payment_request_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch order items
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('id, name, price, quantity, image_url, notes, modifiers')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('[get-order-items] Failed to fetch items:', itemsError);
      return new Response(
        JSON.stringify({ success: false, error: 'db_error', detail: 'Failed to fetch order items' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[get-order-items] Found', items?.length || 0, 'items');

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: orderId,
        items: items || [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[get-order-items] Unexpected error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: 'internal_error', detail: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
