import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { calculatePlatformFee } from '../_shared/platformFees.ts';
import { handleSandboxPayment } from '../_shared/sandboxPayment.ts';

// Verify VPK matches current time bucket
async function verifyVPK(venueId: string, providedVpk: string, secret: string): Promise<boolean> {
  const timeBucket = Math.floor(Date.now() / 30000);
  
  // Check current and previous bucket (to handle edge cases)
  for (const bucket of [timeBucket, timeBucket - 1]) {
    const data = `${venueId}:${bucket}`;
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
    const expectedVpk = hashHex.substring(0, 12);
    
    if (expectedVpk === providedVpk) {
      return true;
    }
  }
  
  return false;
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

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify customer is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      proximity_token, 
      vpk,
      payment_method = 'ble',
      verification_token
    } = await req.json();

    // ── Payment Verification Gate ──
    const { data: secSettings } = await adminClient
      .from('payment_security_settings')
      .select('payment_pin_hash')
      .eq('user_id', user.id)
      .single();

    if (!secSettings?.payment_pin_hash) {
      return new Response(
        JSON.stringify({ error: 'payment_pin_required', message: 'Please set up your payment PIN first.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!verification_token) {
      return new Response(
        JSON.stringify({ error: 'verification_needed', message: 'Payment verification required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing proximity payment: method=${payment_method}, token=${proximity_token?.substring(0, 8)}...`);

    if (!proximity_token) {
      return new Response(
        JSON.stringify({ error: 'proximity_token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch payment request by proximity_token
    const { data: paymentRequest, error: prError } = await adminClient
      .from('payment_requests')
      .select('*, venues(id, name, owner_user_id)')
      .eq('proximity_token', proximity_token)
      .eq('status', 'pending')
      .single();

    if (prError || !paymentRequest) {
      console.error('Payment request not found:', prError);
      return new Response(
        JSON.stringify({ error: 'Payment request not found or already processed' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token has expired
    if (paymentRequest.proximity_token_expires_at && 
        new Date(paymentRequest.proximity_token_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Payment request has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify VPK if provided (for BLE payments)
    if (vpk && payment_method === 'ble') {
      const vpkSecret = Deno.env.get('VPK_SECRET');
      if (vpkSecret) {
        const isValidVpk = await verifyVPK(paymentRequest.venue_id, vpk, vpkSecret);
        if (!isValidVpk) {
          console.error('Invalid VPK provided');
          return new Response(
            JSON.stringify({ error: 'Invalid venue proximity key' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Check if venue is in testing mode
    const { data: venueInfo } = await adminClient
      .from('venues')
      .select('venue_status')
      .eq('id', paymentRequest.venue_id)
      .single();

    if (venueInfo?.venue_status === 'testing') {
      console.log('[process-proximity-payment] Venue in testing mode - enforcing sandbox payment');
      const sandboxResult = await handleSandboxPayment(adminClient, {
        venue_id: paymentRequest.venue_id,
        customer_id: user.id,
        amount: paymentRequest.amount,
        order_id: paymentRequest.order_id,
        payment_method,
        description: `Proximity payment (${payment_method.toUpperCase()})`,
      });

      if (sandboxResult.is_sandbox) {
        if (sandboxResult.success) {
          await adminClient.from('payment_requests').update({
            status: 'completed', paid_by: user.id,
            completed_at: new Date().toISOString(), payment_method,
          }).eq('id', paymentRequest.id);
        }
        return new Response(JSON.stringify(sandboxResult.response_body), {
          status: sandboxResult.status || 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Look up payer's country for dynamic fee
    const { data: payerProfile } = await adminClient
      .from('customer_profiles')
      .select('country_code')
      .eq('user_id', user.id)
      .single();
    const payerCountry = payerProfile?.country_code || 'US';

    const amount = paymentRequest.amount;
    const PLATFORM_FEE = calculatePlatformFee(amount, payerCountry);
    const totalWithFee = amount + PLATFORM_FEE;
    const venueId = paymentRequest.venue_id;

    // Fix 3: Use atomic payment function (also fixes wrong column name 'balance')
    console.log(`Processing proximity payment atomically: ${amount} JVC + ${PLATFORM_FEE} fee`);

    const { data: paymentResult, error: atomicError } = await adminClient.rpc('process_payment_atomic', {
      p_user_id: user.id,
      p_venue_id: venueId,
      p_total_amount: totalWithFee,
      p_platform_fee: PLATFORM_FEE
    });

    if (atomicError) {
      console.error('Atomic proximity payment failed:', atomicError.message);
      return new Response(
        JSON.stringify({ error: atomicError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const customerBalanceAfter = paymentResult?.user_new_balance;

    // Create transaction record
    const { data: transaction, error: txError } = await adminClient
      .from('transactions')
      .insert({
        transaction_type: 'payment',
        amount_jvc: amount,
        amount_usd: amount,
        fee_amount: PLATFORM_FEE,
        fee_collected: true,
        from_wallet_id: customerWallet.id,
        from_wallet_type: 'user',
        to_wallet_id: venueWallet.id,
        to_wallet_type: 'venue',
        status: 'completed',
        completed_at: new Date().toISOString(),
        description: `Proximity payment (${payment_method.toUpperCase()}) to ${paymentRequest.venues?.name || 'venue'}`,
        reference_type: 'payment_request',
        reference_id: paymentRequest.id,
        created_by: user.id,
      })
      .select()
      .single();

    if (txError) {
      console.error('Failed to create transaction record:', txError);
    }

    // Create ledger entries
    if (transaction) {
      await adminClient.from('ledger_entries').insert([
        {
          transaction_id: transaction.id,
          wallet_id: customerWallet.id,
          wallet_type: 'user',
          entry_type: 'debit',
          amount: totalWithFee,
          balance_before: customerBalanceBefore,
          balance_after: customerBalanceAfter,
        },
        {
          transaction_id: transaction.id,
          wallet_id: venueWallet.id,
          wallet_type: 'venue',
          entry_type: 'credit',
          amount: amount,
          balance_before: venueBalanceBefore,
          balance_after: venueBalanceAfter,
        },
      ]);
    }

    // Update payment request status
    await adminClient
      .from('payment_requests')
      .update({
        status: 'completed',
        paid_by: user.id,
        completed_at: new Date().toISOString(),
        payment_method: payment_method,
      })
      .eq('id', paymentRequest.id);

    // If there's an associated order, update it
    if (paymentRequest.order_id) {
      await adminClient
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', paymentRequest.order_id);

      // Create payment record
      await adminClient.from('payments').insert({
        order_id: paymentRequest.order_id,
        amount: amount,
        payment_method: payment_method,
        status: 'completed',
        transaction_id: transaction?.id,
      });
    }

    console.log(`Proximity payment completed: ${amount} JVC from user ${user.id} to venue ${venueId}, method: ${payment_method}`);

    return new Response(
      JSON.stringify({
        success: true,
        transaction_id: transaction?.id,
        amount: amount,
        fee: PLATFORM_FEE,
        total: totalWithFee,
        venue_name: paymentRequest.venues?.name,
        payment_method: payment_method,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing proximity payment:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
