import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { calculatePlatformFee } from '../_shared/platformFees.ts';

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TRANSFER-JVC] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('Not authenticated');
    }
    const sender = userData.user;
    logStep('Sender authenticated', { userId: sender.id });

    const { 
      recipient_id,      // For user-to-user transfer
      recipient_venue_id, // For user-to-venue payment
      amount,
      order_id,          // Optional: for venue payments
      description,
      verification_token
    } = await req.json();

    // ── Payment Verification Gate ──
    const { data: secSettings } = await supabaseAdmin
      .from('payment_security_settings')
      .select('payment_pin_hash')
      .eq('user_id', sender.id)
      .single();

    if (!secSettings?.payment_pin_hash) {
      throw new Error('payment_pin_required');
    }

    if (!verification_token) {
      throw new Error('verification_needed');
    }

    // INPUT VALIDATION: Amount checks
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('Invalid amount: must be a positive number');
    }
    if (amount > 200) {
      throw new Error('Amount exceeds per-transaction limit of $200');
    }
    if (amount > 1000000) {
      throw new Error('Amount exceeds maximum transaction limit of 1,000,000 JVC');
    }
    
    // INPUT VALIDATION: Recipient required
    if (!recipient_id && !recipient_venue_id) {
      throw new Error('Recipient required');
    }
    
    // INPUT VALIDATION: UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (recipient_id && !uuidRegex.test(recipient_id)) {
      throw new Error('Invalid recipient_id format');
    }
    if (recipient_venue_id && !uuidRegex.test(recipient_venue_id)) {
      throw new Error('Invalid recipient_venue_id format');
    }
    if (order_id && !uuidRegex.test(order_id)) {
      throw new Error('Invalid order_id format');
    }
    
    // INPUT VALIDATION: Description length limit
    const sanitizedDescription = description ? String(description).slice(0, 500) : undefined;

    const isVenuePayment = !!recipient_venue_id;

    // Fix 7a: Sender identity verification check
    const { data: senderVerification } = await supabaseAdmin
      .from('user_verification')
      .select('overall_status, face_status')
      .eq('user_id', sender.id)
      .single();

    if (!senderVerification || senderVerification.overall_status !== 'verified' || senderVerification.face_status !== 'verified') {
      return new Response(
        JSON.stringify({ success: false, error: 'Identity verification required to send money', code: 'SENDER_NOT_VERIFIED' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fix 7b: Recipient identity verification (for user-to-user transfers only)
    if (!isVenuePayment && recipient_id) {
      const { data: recipientVerification } = await supabaseAdmin
        .from('user_verification')
        .select('overall_status, face_status')
        .eq('user_id', recipient_id)
        .single();

      if (!recipientVerification || recipientVerification.overall_status !== 'verified' || recipientVerification.face_status !== 'verified') {
        return new Response(
          JSON.stringify({ success: false, error: 'Recipient must complete identity verification before receiving transfers', code: 'RECIPIENT_NOT_VERIFIED' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fix 7c: Daily transfer limit check ($500/day)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dailyTransfers } = await supabaseAdmin
      .from('transactions')
      .select('amount_jvc')
      .eq('from_wallet_id', sender.id)
      .in('transaction_type', ['transfer', 'venue_payment'])
      .eq('status', 'completed')
      .gte('created_at', oneDayAgo);

    const dailyTotal = dailyTransfers?.reduce((sum, t) => sum + (t.amount_jvc || 0), 0) || 0;
    if (dailyTotal + amount > 500) {
      return new Response(
        JSON.stringify({ success: false, error: 'Daily transfer limit exceeded ($500/day)', code: 'DAILY_LIMIT_EXCEEDED' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dynamic platform fee based on sender country
    const { data: senderProfile } = await supabaseAdmin
      .from('customer_profiles')
      .select('country_code')
      .eq('user_id', sender.id)
      .single();
    const senderCountry = senderProfile?.country_code || 'US';
    const PLATFORM_FEE = calculatePlatformFee(amount, senderCountry);

    const totalRequired = amount + PLATFORM_FEE;

    logStep('Processing transfer', { amount, fee: PLATFORM_FEE, totalRequired, isVenuePayment, senderCountry });

    // Fix 7d: Use atomic functions instead of read-then-write
    let senderBalanceAfter: number;
    let recipientBalanceAfter: number;

    if (isVenuePayment) {
      // Venue payment: use process_payment_atomic
      const { data: paymentResult, error: atomicError } = await supabaseAdmin.rpc('process_payment_atomic', {
        p_user_id: sender.id,
        p_venue_id: recipient_venue_id,
        p_total_amount: totalRequired,
        p_platform_fee: PLATFORM_FEE
      });

      if (atomicError) {
        logStep('Atomic venue payment failed', { error: atomicError.message });
        throw new Error(atomicError.message);
      }

      senderBalanceAfter = paymentResult?.user_new_balance;
      recipientBalanceAfter = paymentResult?.venue_new_balance;
      logStep('Atomic venue payment succeeded', paymentResult);
    } else {
      // User-to-user: debit sender then credit recipient
      const { data: newSenderBalance, error: debitError } = await supabaseAdmin.rpc('debit_wallet', {
        p_user_id: sender.id,
        p_amount: totalRequired
      });

      if (debitError) {
        logStep('Debit failed', { error: debitError.message });
        throw new Error(debitError.message);
      }
      senderBalanceAfter = newSenderBalance;

      const { data: newRecipientBalance, error: creditError } = await supabaseAdmin.rpc('credit_wallet', {
        p_user_id: recipient_id,
        p_amount: amount
      });

      if (creditError) {
        // Rollback: re-credit sender
        await supabaseAdmin.rpc('credit_wallet', { p_user_id: sender.id, p_amount: totalRequired });
        logStep('Credit failed, rolled back debit', { error: creditError.message });
        throw new Error(creditError.message);
      }
      recipientBalanceAfter = newRecipientBalance;

      // Collect platform fee in treasury
      await supabaseAdmin
        .from('platform_treasury')
        .update({ collected_fees: supabaseAdmin.rpc ? undefined : 0 })
        .limit(0); // no-op, fee already handled via debit_wallet taking totalRequired

      // Actually update treasury for user-to-user (atomic functions don't handle this)
      const { data: treasury } = await supabaseAdmin
        .from('platform_treasury')
        .select('id, collected_fees')
        .limit(1)
        .single();
      
      if (treasury) {
        await supabaseAdmin
          .from('platform_treasury')
          .update({ 
            collected_fees: (treasury.collected_fees || 0) + PLATFORM_FEE,
            updated_at: new Date().toISOString()
          })
          .eq('id', treasury.id);
      }

      logStep('User-to-user transfer succeeded');
    }

    const recipientType = isVenuePayment ? 'venue' : 'user';

    // 7. Create transaction record
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('transactions')
      .insert({
        from_wallet_id: sender.id,
        from_wallet_type: 'user',
        to_wallet_id: isVenuePayment ? recipient_venue_id : recipient_id,
        to_wallet_type: recipientType,
        amount_jvc: amount,
        amount_usd: amount, // 1:1 peg
        fee_amount: PLATFORM_FEE,
        fee_collected: true,
        transaction_type: isVenuePayment ? 'venue_payment' : 'transfer',
        status: 'completed',
        description: sanitizedDescription || (isVenuePayment ? `Payment at venue` : `Transfer to user`),
        reference_id: order_id || null,
        reference_type: order_id ? 'order' : null,
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    logStep('Transaction recorded', { transactionId: transaction?.id });

    // 8. Create ledger entries for both parties
    await supabaseAdmin.from('ledger_entries').insert([
      {
        transaction_id: transaction?.id,
        wallet_id: sender.id,
        wallet_type: 'user',
        entry_type: 'debit',
        amount: totalRequired,
        balance_before: 0, // Exact before-balance unavailable with atomic ops
        balance_after: senderBalanceAfter
      },
      {
        transaction_id: transaction?.id,
        wallet_id: isVenuePayment ? recipient_venue_id : recipient_id,
        wallet_type: recipientType,
        entry_type: 'credit',
        amount: amount,
        balance_before: 0, // Exact before-balance unavailable with atomic ops
        balance_after: recipientBalanceAfter
      }
    ]);

    // 9. If venue payment with order_id, update order status
    if (order_id) {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', order_id);

      // Also create payment record
      await supabaseAdmin.from('payments').insert({
        order_id: order_id,
        amount: amount,
        payment_method: 'jvc',
        status: 'completed',
        transaction_id: transaction?.id,
        staff_id: sender.id
      });

      logStep('Order marked as paid', { orderId: order_id });
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction_id: transaction?.id,
        amount,
        fee: PLATFORM_FEE,
        total_deducted: totalRequired,
        sender_balance: senderBalanceAfter,
        message: isVenuePayment 
          ? `Payment of ${amount} JVC successful` 
          : `Transfer of ${amount} JVC successful`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
