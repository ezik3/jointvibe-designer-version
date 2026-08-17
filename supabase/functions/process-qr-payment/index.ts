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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[process-qr-payment] Starting...');

    // Authenticate the customer
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[process-qr-payment] No auth header');
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userData.user) {
      console.log('[process-qr-payment] Auth error:', authError?.message);
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const customerId = userData.user.id;
    console.log('[process-qr-payment] Customer:', customerId);

    const { qr_token: tokenOrIdRaw, verification_token } = await req.json();
    const tokenOrId = typeof tokenOrIdRaw === 'string' ? tokenOrIdRaw.trim() : '';

    if (!tokenOrId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing qr_token' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    
    console.log('[process-qr-payment] Token:', tokenOrId);

    // INPUT VALIDATION: QR token format and length validation
    if (tokenOrId.length > 200 || tokenOrId.length < 10) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid qr_token format' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Token may be either payment_request.id (UUID) or qr_token
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isIdLookup = uuidRegex.test(tokenOrId);
    
    // INPUT VALIDATION: QR token should match expected pattern (UUID + timestamp)
    const qrTokenRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9]+$/i;
    if (!isIdLookup && !qrTokenRegex.test(tokenOrId)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid qr_token format' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // ── Payment Verification Gate ──
    const { data: secSettings } = await supabase
      .from('payment_security_settings')
      .select('payment_pin_hash')
      .eq('user_id', customerId)
      .single();

    if (!secSettings?.payment_pin_hash) {
      return new Response(JSON.stringify({ success: false, error: 'payment_pin_required', message: 'Please set up your payment PIN first.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!verification_token) {
      return new Response(JSON.stringify({ success: false, error: 'verification_needed', message: 'Payment verification required.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch payment request - use owner_user_id (correct column name)
    const requestQuery = supabase
      .from('payment_requests')
      .select('*, venues(name, owner_user_id)');

    const { data: paymentRequest, error: fetchError } = isIdLookup
      ? await requestQuery.eq('id', tokenOrId).single()
      : await requestQuery.eq('qr_token', tokenOrId).single();

    if (fetchError || !paymentRequest) {
      console.log('[process-qr-payment] Payment request not found:', fetchError?.message);
      return new Response(JSON.stringify({ success: false, error: 'Payment request not found' }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log('[process-qr-payment] Found payment request:', paymentRequest.id, 'status:', paymentRequest.status);

    // Validate payment request status
    if (paymentRequest.status !== 'pending') {
      return new Response(JSON.stringify({ success: false, error: 'Payment already processed or cancelled' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Check expiration
    if (new Date(paymentRequest.expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('payment_requests')
        .update({ status: 'expired' })
        .eq('id', paymentRequest.id);

      return new Response(JSON.stringify({ success: false, error: 'Payment request expired' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Check if venue is in testing mode
    const { data: venueInfo } = await supabase
      .from('venues')
      .select('venue_status')
      .eq('id', paymentRequest.venue_id)
      .single();

    if (venueInfo?.venue_status === 'testing') {
      console.log('[process-qr-payment] Venue in testing mode - enforcing sandbox payment');
      const sandboxResult = await handleSandboxPayment(supabase, {
        venue_id: paymentRequest.venue_id,
        customer_id: customerId,
        amount: Number(paymentRequest.amount),
        order_id: paymentRequest.order_id,
        payment_method: 'qr_scan',
        description: 'QR payment',
      });

      if (sandboxResult.is_sandbox) {
        if (sandboxResult.success) {
          await supabase.from('payment_requests').update({
            status: 'completed', paid_by: customerId,
            completed_at: new Date().toISOString(), payment_method: 'qr_scan',
          }).eq('id', paymentRequest.id);
        }
        return new Response(JSON.stringify(sandboxResult.response_body), {
          status: sandboxResult.status || 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Look up payer's country for dynamic fee
    const { data: payerProfile } = await supabase
      .from('customer_profiles')
      .select('country_code')
      .eq('user_id', customerId)
      .single();
    const payerCountry = payerProfile?.country_code || 'US';

    const amount = Number(paymentRequest.amount);
    const PLATFORM_FEE = calculatePlatformFee(amount, payerCountry);
    const totalWithFee = amount + PLATFORM_FEE;

    // Get customer wallet
    const { data: customerWallet, error: walletError } = await supabase
      .from('user_wallets')
      .select('*')
      .eq('user_id', customerId)
      .single();

    if (walletError || !customerWallet) {
      console.log('[process-qr-payment] Customer wallet not found:', walletError?.message);
      return new Response(JSON.stringify({ success: false, error: 'Customer wallet not found' }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (customerWallet.is_frozen) {
      return new Response(JSON.stringify({ success: false, error: 'Customer wallet is frozen' }), { 
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const customerBalance = customerWallet.balance_jv_token || 0;
    if (customerBalance < totalWithFee) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Insufficient balance',
        required: totalWithFee,
        available: customerBalance,
      }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Get or create venue wallet
    const { data: existingVenueWallet } = await supabase
      .from('venue_wallets')
      .select('*')
      .eq('venue_id', paymentRequest.venue_id)
      .single();

    let venueWalletBalance = existingVenueWallet?.balance_jvc || 0;

    if (!existingVenueWallet) {
      await supabase
        .from('venue_wallets')
        .insert({ venue_id: paymentRequest.venue_id, balance_jvc: 0, balance_usd: 0 });
    }

    // Fix 3: Use atomic payment function
    console.log('[process-qr-payment] Executing atomic transfer:', { amount, totalWithFee });

    const { data: paymentResult, error: atomicError } = await supabase.rpc('process_payment_atomic', {
      p_user_id: customerId,
      p_venue_id: paymentRequest.venue_id,
      p_total_amount: totalWithFee,
      p_platform_fee: PLATFORM_FEE
    });

    if (atomicError) {
      console.error('[process-qr-payment] Atomic payment failed:', atomicError.message);
      return new Response(JSON.stringify({ success: false, error: atomicError.message }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const customerBalanceAfter = paymentResult?.user_new_balance;

    // Record transaction
    const venueName = (paymentRequest.venues as any)?.name || 'venue';
    const { data: transaction } = await supabase
      .from('transactions')
      .insert({
        transaction_type: 'payment',
        amount_jvc: amount,
        amount_usd: amount,
        fee_amount: PLATFORM_FEE,
        fee_collected: true,
        from_wallet_id: customerId,
        from_wallet_type: 'user',
        to_wallet_id: paymentRequest.venue_id,
        to_wallet_type: 'venue',
        status: 'completed',
        completed_at: new Date().toISOString(),
        description: `QR payment to ${venueName}`,
        reference_type: 'order',
        reference_id: paymentRequest.order_id,
        created_by: customerId,
      })
      .select()
      .single();

    console.log('[process-qr-payment] Transaction recorded:', transaction?.id);

    // Update payment request
    await supabase
      .from('payment_requests')
      .update({
        status: 'completed',
        payment_method: 'qr_scan',
        paid_by: customerId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', paymentRequest.id);

    // Update order status if linked
    if (paymentRequest.order_id) {
      await supabase
        .from('orders')
        .update({ status: 'pending' })
        .eq('id', paymentRequest.order_id);
    }

    console.log('[process-qr-payment] Success!');

    return new Response(JSON.stringify({
      success: true,
      transaction_id: transaction?.id,
      amount,
      fee: PLATFORM_FEE,
      total_paid: totalWithFee,
      venue_name: venueName,
      balance_after: customerBalanceAfter,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[process-qr-payment] Error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
