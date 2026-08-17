import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { calculatePlatformFee } from '../_shared/platformFees.ts';
import { handleSandboxPayment } from '../_shared/sandboxPayment.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[finalize-payment] Request received');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header for customer verification
    const authHeader = req.headers.get('Authorization');
    let customerId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError) {
        console.error('[finalize-payment] Auth error:', authError.message);
        return new Response(
          JSON.stringify({ success: false, error: 'unauthorized', detail: 'Invalid auth token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      customerId = user?.id || null;
    }

    if (!customerId) {
      console.error('[finalize-payment] No customer ID');
      return new Response(
        JSON.stringify({ success: false, error: 'unauthorized', detail: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { payment_request_id, updated_items, simulation_mode, verification_token, scheduled_for } = body;

    // ── Payment Verification Gate ──
    const { data: secSettings } = await supabase
      .from('payment_security_settings')
      .select('payment_pin_hash')
      .eq('user_id', customerId)
      .single();

    if (!secSettings?.payment_pin_hash) {
      return new Response(
        JSON.stringify({ success: false, error: 'payment_pin_required', detail: 'Please set up your payment PIN first.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!verification_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'verification_needed', detail: 'Payment verification required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Look up payer's country for dynamic fee
    const { data: payerProfile } = await supabase
      .from('customer_profiles')
      .select('country_code')
      .eq('user_id', customerId)
      .single();
    const payerCountry = payerProfile?.country_code || 'US';

    console.log('[finalize-payment] Input:', { 
      payment_request_id, 
      customerId, 
      itemCount: updated_items?.length,
      simulation_mode,
      payerCountry
    });

    if (!payment_request_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_input', detail: 'payment_request_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch payment request
    const { data: paymentRequest, error: prError } = await supabase
      .from('payment_requests')
      .select('id, venue_id, order_id, amount, fee, status, expires_at, qr_token')
      .eq('id', payment_request_id)
      .single();

    if (prError || !paymentRequest) {
      console.error('[finalize-payment] Payment request not found:', prError);
      return new Response(
        JSON.stringify({ success: false, error: 'not_found', detail: 'Payment request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[finalize-payment] Found payment request:', { 
      id: paymentRequest.id, 
      status: paymentRequest.status,
      order_id: paymentRequest.order_id 
    });

    // Verify not already completed
    if (paymentRequest.status === 'completed') {
      return new Response(
        JSON.stringify({ success: false, error: 'already_paid', detail: 'This payment has already been completed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check expiration
    if (new Date(paymentRequest.expires_at) < new Date()) {
      await supabase
        .from('payment_requests')
        .update({ status: 'expired' })
        .eq('id', payment_request_id);
      
      return new Response(
        JSON.stringify({ success: false, error: 'expired', detail: 'Payment request has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if venue is in testing mode
    const { data: venueInfo } = await supabase
      .from('venues')
      .select('venue_status')
      .eq('id', paymentRequest.venue_id)
      .single();

    if (venueInfo?.venue_status === 'testing') {
      console.log('[finalize-payment] Venue in testing mode - enforcing sandbox payment');
      
      // Calculate amount for sandbox debit
      let sandboxAmount = paymentRequest.amount || 0;
      const sandboxItems = updated_items?.filter((i: any) => i.quantity > 0) || [];
      if (sandboxItems.length > 0 && paymentRequest.order_id) {
        const { data: dbItems } = await supabase
          .from('order_items')
          .select('id, price')
          .eq('order_id', paymentRequest.order_id);
        const dbPriceMap = new Map((dbItems || []).map(i => [i.id, i.price]));
        sandboxAmount = 0;
        for (const item of sandboxItems) {
          const dbPrice = dbPriceMap.get(item.id);
          if (dbPrice !== undefined) sandboxAmount += dbPrice * (item.quantity || 1);
        }
        
        // Add tax and delivery fee from DB
        const { data: sandboxOrder } = await supabase
          .from('orders')
          .select('tax')
          .eq('id', paymentRequest.order_id)
          .single();
        const sandboxTax = sandboxOrder?.tax || 0;

        const { data: sandboxDelivery } = await supabase
          .from('food_delivery_orders')
          .select('delivery_fee')
          .eq('order_id', paymentRequest.order_id)
          .maybeSingle();
        const sandboxDeliveryFee = sandboxDelivery?.delivery_fee || 0;

        sandboxAmount = sandboxAmount + sandboxTax + sandboxDeliveryFee;
      }

      const sandboxResult = await handleSandboxPayment(supabase, {
        venue_id: paymentRequest.venue_id,
        customer_id: customerId,
        amount: sandboxAmount,
        order_id: paymentRequest.order_id,
        payment_method: 'finalize',
        description: 'Finalize payment',
      });

      if (sandboxResult.is_sandbox) {
        // Update payment request status regardless of success/failure
        if (sandboxResult.success) {
          await supabase.from('payment_requests').update({
            status: 'completed', paid_by: customerId,
            completed_at: new Date().toISOString(), amount: sandboxAmount,
          }).eq('id', payment_request_id);
        }
        return new Response(
          JSON.stringify(sandboxResult.response_body),
          { status: sandboxResult.status || 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fix 6: Load authoritative prices from DB, only trust quantity changes from frontend
    let itemSubtotal = 0;
    const validItems = updated_items?.filter((i: any) => i.quantity > 0) || [];
    
    if (validItems.length > 0 && paymentRequest.order_id) {
      // Load actual prices from database
      const { data: dbItems, error: dbItemsError } = await supabase
        .from('order_items')
        .select('id, price, quantity')
        .eq('order_id', paymentRequest.order_id);

      if (dbItemsError || !dbItems) {
        return new Response(
          JSON.stringify({ success: false, error: 'db_error', detail: 'Failed to load order items' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const dbPriceMap = new Map(dbItems.map(i => [i.id, i.price]));
      for (const item of validItems) {
        const dbPrice = dbPriceMap.get(item.id);
        if (dbPrice !== undefined) {
          itemSubtotal += dbPrice * (item.quantity || 1);
        }
      }
      console.log('[finalize-payment] Calculated item subtotal from DB prices:', { itemCount: validItems.length, itemSubtotal });
    } else {
      itemSubtotal = paymentRequest.amount || 0;
      console.log('[finalize-payment] Using original amount:', itemSubtotal);
    }

    // Load tax from orders table
    let orderTax = 0;
    let orderDeliveryFee = 0;
    if (paymentRequest.order_id) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('tax')
        .eq('id', paymentRequest.order_id)
        .single();
      orderTax = orderData?.tax || 0;

      const { data: deliveryData } = await supabase
        .from('food_delivery_orders')
        .select('delivery_fee')
        .eq('order_id', paymentRequest.order_id)
        .maybeSingle();
      orderDeliveryFee = deliveryData?.delivery_fee || 0;
    }

    // newTotal = items + tax + delivery (platform fee added separately below)
    const newTotal = itemSubtotal + orderTax + orderDeliveryFee;

    const PLATFORM_FEE = calculatePlatformFee(newTotal, payerCountry);
    const finalAmount = newTotal + PLATFORM_FEE;

    console.log('[finalize-payment] Final amounts:', { 
      originalAmount: paymentRequest.amount,
      itemSubtotal,
      orderTax,
      orderDeliveryFee,
      newTotal, 
      platformFee: PLATFORM_FEE,
      finalAmount 
    });

    // Fix 1: Debit customer wallet BEFORE crediting venue — use atomic function
    const { data: paymentResult, error: paymentError } = await supabase.rpc('process_payment_atomic', {
      p_user_id: customerId,
      p_venue_id: paymentRequest.venue_id,
      p_total_amount: finalAmount,
      p_platform_fee: PLATFORM_FEE
    });

    if (paymentError) {
      console.error('[finalize-payment] Atomic payment failed:', paymentError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'payment_failed', detail: paymentError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[finalize-payment] Atomic payment succeeded:', paymentResult);

    // Update order items if we have them
    if (paymentRequest.order_id) {
      console.log('[finalize-payment] Processing order:', paymentRequest.order_id);
      
      if (validItems.length > 0) {
        for (const item of validItems) {
          if (item.id) {
            await supabase
              .from('order_items')
              .update({ quantity: item.quantity })
              .eq('id', item.id);
          }
        }

        const keepItemIds = validItems.map((i: any) => i.id).filter(Boolean);
        if (keepItemIds.length > 0) {
          const { data: currentItems } = await supabase
            .from('order_items')
            .select('id')
            .eq('order_id', paymentRequest.order_id);
          
          const currentItemIds = currentItems?.map(i => i.id) || [];
          const itemsToDelete = currentItemIds.filter(id => !keepItemIds.includes(id));
          
          if (itemsToDelete.length > 0) {
            await supabase
              .from('order_items')
              .delete()
              .in('id', itemsToDelete);
          }
        }
      }

      const orderUpdate: Record<string, unknown> = {
        subtotal: newTotal,
        total: finalAmount,
        status: 'pending', // Move from awaiting_payment to pending so venue sees it
      };
      // Save scheduled_for if customer selected an ETA
      if (scheduled_for) {
        orderUpdate.scheduled_for = scheduled_for;
      }

      await supabase
        .from('orders')
        .update(orderUpdate)
        .eq('id', paymentRequest.order_id);
    }

    // Mark payment request as completed
    const { error: updateError } = await supabase
      .from('payment_requests')
      .update({
        status: 'completed',
        paid_by: customerId,
        completed_at: new Date().toISOString(),
        amount: newTotal,
        fee: PLATFORM_FEE,
      })
      .eq('id', payment_request_id);

    if (updateError) {
      console.error('[finalize-payment] Failed to update payment request:', updateError);
    }

    // Record transaction
    await supabase
      .from('transactions')
      .insert({
        from_wallet_id: customerId,
        from_wallet_type: 'user',
        to_wallet_id: paymentRequest.venue_id,
        to_wallet_type: 'venue',
        amount_jvc: newTotal,
        amount_usd: newTotal,
        fee_amount: PLATFORM_FEE,
        fee_collected: true,
        transaction_type: 'payment',
        status: 'completed',
        reference_id: paymentRequest.order_id || payment_request_id,
        reference_type: 'order',
        completed_at: new Date().toISOString()
      });

    console.log('[finalize-payment] Payment finalized successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        payment_request_id,
        order_id: paymentRequest.order_id,
        amount: newTotal,
        fee: PLATFORM_FEE,
        total: finalAmount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[finalize-payment] Unexpected error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: 'internal_error', detail: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
