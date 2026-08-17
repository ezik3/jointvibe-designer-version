import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CONFIGURABLE LIMITS =============
const WITHDRAWAL_FEE = 1.00;           // Flat $1 withdrawal fee
const MIN_VENUE_WITHDRAWAL = 50.00;    // Minimum venue withdrawal
const MIN_USER_WITHDRAWAL = 10.00;     // Minimum user withdrawal
const DAILY_LIMIT_USD = 500.00;        // Max per withdrawal for end users
const DAILY_CAP_COUNT = 3;             // Max withdrawals per day for end users
const VENUE_DAILY_CAP = 1;             // Max withdrawals per day for venues
const ELIGIBILITY_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PROCESS-WITHDRAWAL] ${step}${detailsStr}`);
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
    const user = userData.user;
    logStep('User authenticated', { userId: user.id });

    const { 
      amount,
      withdrawal_method, // 'bank' | 'crypto'
      venue_id,          // If venue withdrawal
      bank_details,      // { account_last4, bank_name, routing_number, account_number }
      crypto_address,    // For crypto withdrawals
      authorization_token // Required for venue withdrawals (from verify-owner-withdrawal)
    } = await req.json();

    if (!amount || amount <= WITHDRAWAL_FEE) {
      throw new Error(`Minimum withdrawal is $${(WITHDRAWAL_FEE + 0.01).toFixed(2)}`);
    }

    const isVenueWithdrawal = !!venue_id;
    const totalWithdrawal = amount;
    const netPayout = amount - WITHDRAWAL_FEE;

    logStep('Processing withdrawal REQUEST', { amount, fee: WITHDRAWAL_FEE, netPayout, isVenue: isVenueWithdrawal });

    // ============= ELIGIBILITY EVALUATION =============
    let wallet: any;
    let walletType: 'user' | 'venue';
    let availableBalance: number;
    let autoApproved = false;
    let needsReview = false;
    let reviewReason = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    if (isVenueWithdrawal) {
      // ============= VENUE WITHDRAWAL =============

      // Require authorization token from verify-owner-withdrawal
      if (!authorization_token) {
        throw new Error('Withdrawal authorization required. Please verify your identity first.');
      }

      // Validate the single-use token
      const { data: tokenValid, error: tokenError } = await supabaseAdmin.rpc('validate_withdrawal_token', {
        p_token: authorization_token,
        p_venue_id: venue_id,
        p_owner_id: user.id,
        p_amount: amount
      });

      if (tokenError || !tokenValid) {
        logStep('Authorization token invalid', { tokenError });
        throw new Error('Invalid or expired withdrawal authorization. Please verify again.');
      }

      logStep('Authorization token validated and consumed');
      
      // Verify user owns this venue
      const { data: venue, error: venueError } = await supabaseAdmin
        .from('venues')
        .select('owner_user_id, approval_status')
        .eq('id', venue_id)
        .single();

      if (venueError || venue?.owner_user_id !== user.id) {
        throw new Error('Not authorized to withdraw from this venue');
      }

      // Check venue verification
      if (venue.approval_status !== 'approved') {
        needsReview = true;
        reviewReason = 'Venue not verified';
      }

      const { data: venueWallet, error: walletError } = await supabaseAdmin
        .from('venue_wallets')
        .select('*')
        .eq('venue_id', venue_id)
        .single();

      if (walletError || !venueWallet) {
        throw new Error('Venue wallet not found');
      }

      if (venueWallet.is_frozen) {
        throw new Error('Venue wallet is frozen. Contact support.');
      }

      availableBalance = (venueWallet.balance_jvc || 0) - (venueWallet.locked_balance || 0);

      // VENUE ELIGIBILITY: Minimum balance check
      if (totalWithdrawal < MIN_VENUE_WITHDRAWAL) {
        throw new Error(`Minimum venue withdrawal is $${MIN_VENUE_WITHDRAWAL}. Requested: $${totalWithdrawal.toFixed(2)}`);
      }

      if (availableBalance < totalWithdrawal) {
        throw new Error(`Insufficient available balance. Available: ${availableBalance.toFixed(2)} JVC (${venueWallet.locked_balance?.toFixed(2) || 0} JVC locked)`);
      }

      // Check venue withdrawal frequency (max 1 per day)
      const { data: todayVenueWithdrawals } = await supabaseAdmin
        .from('withdrawal_records')
        .select('id')
        .eq('venue_id', venue_id)
        .gte('created_at', todayISO)
        .in('status', ['pending', 'approved', 'approved_automatically', 'completed']);

      if ((todayVenueWithdrawals?.length || 0) >= VENUE_DAILY_CAP) {
        throw new Error('Venue withdrawal limit reached (1 per day). Try again tomorrow.');
      }

      wallet = venueWallet;
      walletType = 'venue';

      // If no review reason, auto-approve
      if (!needsReview && venue.approval_status === 'approved') {
        autoApproved = true;
      }

      logStep('Venue wallet verified', { balance: wallet.balance_jvc, locked: wallet.locked_balance, available: availableBalance, autoApproved, needsReview });

    } else {
      // ============= USER WITHDRAWAL =============
      
      const { data: userWallet, error: walletError } = await supabaseAdmin
        .from('user_wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (walletError || !userWallet) {
        throw new Error('Wallet not found');
      }

      if (userWallet.is_frozen) {
        throw new Error('Your wallet is frozen. Contact support.');
      }

      // === PENDING BALANCE GUARD ===
      // Auto-clear expired pending balance
      if ((userWallet.pending_balance || 0) > 0 && userWallet.pending_until) {
        const pendingUntil = new Date(userWallet.pending_until);
        if (new Date() >= pendingUntil) {
          const newBalance = (userWallet.balance_jv_token || 0) + (userWallet.pending_balance || 0);
          await supabaseAdmin
            .from('user_wallets')
            .update({
              balance_jv_token: newBalance,
              pending_balance: 0,
              pending_until: null,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
          userWallet.balance_jv_token = newBalance;
          userWallet.pending_balance = 0;
          logStep('Expired pending balance promoted', { newBalance });
        }
      }

      const pendingHeld = userWallet.pending_balance || 0;
      availableBalance = (userWallet.balance_jv_token || 0) - (userWallet.locked_balance || 0) - pendingHeld;

      // Minimum withdrawal check
      if (totalWithdrawal < MIN_USER_WITHDRAWAL) {
        throw new Error(`Minimum withdrawal is $${MIN_USER_WITHDRAWAL}. Requested: $${totalWithdrawal.toFixed(2)}`);
      }

      // Daily limit check
      if (totalWithdrawal > DAILY_LIMIT_USD) {
        needsReview = true;
        reviewReason = `Amount exceeds daily limit of $${DAILY_LIMIT_USD}`;
      }

      // USER ELIGIBILITY CHECK
      const now = Date.now();
      const firstDepositAt = userWallet.first_deposit_at ? new Date(userWallet.first_deposit_at).getTime() : null;
      const lastDepositAt = userWallet.last_deposit_at ? new Date(userWallet.last_deposit_at).getTime() : null;
      const lastSpendAt = userWallet.last_spend_at ? new Date(userWallet.last_spend_at).getTime() : null;

      // Rule: first deposit >= 7 days ago OR last spend > last deposit
      const sevenDaysEligible = firstDepositAt && (now - firstDepositAt >= ELIGIBILITY_DAYS_MS);
      const spendEligible = lastSpendAt && lastDepositAt && (lastSpendAt > lastDepositAt);

      if (!sevenDaysEligible && !spendEligible) {
        const daysRemaining = firstDepositAt 
          ? Math.ceil((ELIGIBILITY_DAYS_MS - (now - firstDepositAt)) / (24 * 60 * 60 * 1000))
          : 7;
        
        throw new Error(
          `Withdrawals not available yet. Either wait ${daysRemaining} more day(s) from your first deposit, or make a purchase at a venue to unlock withdrawals immediately.`
        );
      }

      if (availableBalance < totalWithdrawal) {
        const errorMsg = pendingHeld > 0
          ? `Insufficient cleared funds. $${pendingHeld.toFixed(2)} is still pending clearance. Available to withdraw: $${availableBalance.toFixed(2)}`
          : `Insufficient available balance. Available: ${availableBalance.toFixed(2)} JVC (${userWallet.locked_balance?.toFixed(2) || 0} JVC locked)`;
        throw new Error(errorMsg);
      }

      // Check daily withdrawal count
      const { data: todayUserWithdrawals } = await supabaseAdmin
        .from('withdrawal_records')
        .select('id, amount_jvc')
        .eq('user_id', user.id)
        .gte('created_at', todayISO)
        .in('status', ['pending', 'approved', 'approved_automatically', 'completed']);

      if ((todayUserWithdrawals?.length || 0) >= DAILY_CAP_COUNT) {
        throw new Error(`Daily withdrawal limit reached (${DAILY_CAP_COUNT} per day). Try again tomorrow.`);
      }

      // Check for frozen/flagged wallet (is_frozen already checked above)
      // Additional check: if freeze_reason exists, flag for review
      if (userWallet.freeze_reason) {
        needsReview = true;
        reviewReason = 'Account has compliance notes';
      }

      wallet = userWallet;
      walletType = 'user';

      // If no review reason and eligible, auto-approve
      if (!needsReview && (sevenDaysEligible || spendEligible)) {
        autoApproved = true;
      }

      logStep('User wallet verified and eligible', { 
        balance: wallet.balance_jv_token, 
        locked: wallet.locked_balance, 
        available: availableBalance,
        sevenDaysEligible,
        spendEligible,
        autoApproved,
        needsReview
      });
    }

    // ============= LOCK FUNDS =============
    const newLockedBalance = (wallet.locked_balance || 0) + totalWithdrawal;

    if (walletType === 'venue') {
      await supabaseAdmin
        .from('venue_wallets')
        .update({ 
          locked_balance: newLockedBalance,
          updated_at: new Date().toISOString()
        })
        .eq('venue_id', venue_id);
    } else {
      await supabaseAdmin
        .from('user_wallets')
        .update({ 
          locked_balance: newLockedBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
    }

    logStep('Funds locked for withdrawal', { previousLocked: wallet.locked_balance || 0, newLockedBalance });

    // ============= DETERMINE STATUS =============
    const withdrawalStatus = autoApproved ? 'approved_automatically' : (needsReview ? 'needs_review' : 'pending');
    const approvedAt = autoApproved ? new Date().toISOString() : null;

    // ============= CREATE WITHDRAWAL RECORD =============
    const { data: withdrawalRecord, error: recordError } = await supabaseAdmin
      .from('withdrawal_records')
      .insert({
        user_id: isVenueWithdrawal ? null : user.id,
        venue_id: isVenueWithdrawal ? venue_id : null,
        amount_jvc: totalWithdrawal,
        amount_usd: totalWithdrawal, // 1:1 peg
        amount_local: totalWithdrawal,
        fee_amount: WITHDRAWAL_FEE,
        net_payout: netPayout,
        withdrawal_method: withdrawal_method,
        status: withdrawalStatus,
        approved_at: approvedAt,
        approved_by: autoApproved ? user.id : null, // Self-approved via rules
        bank_account_last4: bank_details?.account_last4,
        bank_name: bank_details?.bank_name,
        crypto_to_address: crypto_address,
        metadata: { 
          requested_by: user.id,
          auto_approved: autoApproved,
          needs_review: needsReview,
          review_reason: reviewReason || null
        }
      })
      .select()
      .single();

    if (recordError) {
      // Rollback locked balance on failure
      if (walletType === 'venue') {
        await supabaseAdmin.from('venue_wallets').update({ locked_balance: wallet.locked_balance || 0 }).eq('venue_id', venue_id);
      } else {
        await supabaseAdmin.from('user_wallets').update({ locked_balance: wallet.locked_balance || 0 }).eq('user_id', user.id);
      }
      throw new Error('Failed to create withdrawal request');
    }

    logStep(`Withdrawal created (${withdrawalStatus})`, { withdrawalId: withdrawalRecord.id, autoApproved, needsReview });

    // ============= CREATE TRANSACTION RECORD =============
    const statusDescription = autoApproved 
      ? `Withdrawal auto-approved for ${netPayout.toFixed(2)} USD - queued for payout`
      : needsReview 
        ? `Withdrawal request of ${netPayout.toFixed(2)} USD - needs review: ${reviewReason}`
        : `Withdrawal request of ${netPayout.toFixed(2)} USD - awaiting processing`;

    await supabaseAdmin.from('transactions').insert({
      from_wallet_id: isVenueWithdrawal ? venue_id : user.id,
      from_wallet_type: walletType,
      amount_jvc: totalWithdrawal,
      amount_usd: totalWithdrawal,
      fee_amount: WITHDRAWAL_FEE,
      fee_collected: false, // Not collected until paid
      transaction_type: 'withdrawal',
      status: autoApproved ? 'approved' : 'pending',
      description: statusDescription,
      reference_id: withdrawalRecord.id,
      reference_type: 'withdrawal',
      created_by: user.id
    });

    // ============= UPDATE PLATFORM TREASURY =============
    const { data: treasury } = await supabaseAdmin
      .from('platform_treasury')
      .select('id, pending_withdrawals, collected_fees')
      .limit(1)
      .single();

    if (treasury) {
      await supabaseAdmin.from('platform_treasury').update({
        pending_withdrawals: (treasury.pending_withdrawals || 0) + netPayout,
        collected_fees: (treasury.collected_fees || 0) + WITHDRAWAL_FEE,
        updated_at: new Date().toISOString()
      }).eq('id', treasury.id);
      logStep('Treasury updated', { pendingWithdrawals: (treasury.pending_withdrawals || 0) + netPayout });
    }

    logStep('Withdrawal request submitted successfully', { withdrawalId: withdrawalRecord.id, status: withdrawalStatus });

    // ============= REAL STRIPE TRANSFER (for auto-approved) =============
    if (autoApproved && !isVenueWithdrawal) {
      const { data: userProfile } = await supabaseAdmin
        .from('customer_profiles')
        .select('stripe_account_id, stripe_payouts_enabled')
        .eq('user_id', user.id)
        .single();

      if (!userProfile?.stripe_account_id || !userProfile?.stripe_payouts_enabled) {
        await supabaseAdmin.from('withdrawal_records')
          .update({ status: 'pending_connect_setup' })
          .eq('id', withdrawalRecord.id);
        
        return new Response(JSON.stringify({
          success: true,
          withdrawal_id: withdrawalRecord.id,
          status: 'pending_connect_setup',
          needs_connect_setup: true,
          message: 'Please complete payout account setup to receive your withdrawal.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Attempt real transfer
      const Stripe = (await import("https://esm.sh/stripe@18.5.0")).default;
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-08-27.basil' });

      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(netPayout * 100),
          currency: 'usd',
          destination: userProfile.stripe_account_id,
          description: `JointVibe user withdrawal`,
          metadata: { user_id: user.id, withdrawal_id: withdrawalRecord.id, platform: 'jointvibe' }
        });

        await supabaseAdmin.from('stripe_payouts').insert({
          stripe_transfer_id: transfer.id,
          recipient_type: 'user',
          recipient_id: user.id,
          amount: netPayout,
          currency: 'usd',
          status: 'processing',
          stripe_account_id: userProfile.stripe_account_id,
          withdrawal_record_id: withdrawalRecord.id
        });

        await supabaseAdmin.rpc('increment_user_payouts', { p_amount: netPayout });
        logStep('User Stripe transfer created', { transferId: transfer.id });
      } catch (stripeErr: any) {
        logStep('User Stripe transfer FAILED', { error: stripeErr.message });
        await supabaseAdmin.from('withdrawal_records')
          .update({ status: 'payout_failed' })
          .eq('id', withdrawalRecord.id);
        await supabaseAdmin.from('stripe_payouts').insert({
          recipient_type: 'user', recipient_id: user.id, amount: netPayout,
          status: 'failed', failure_reason: stripeErr.message, withdrawal_record_id: withdrawalRecord.id
        });
      }
    }

    // ============= RESPONSE =============
    const responseMessage = autoApproved
      ? `Withdrawal of $${netPayout.toFixed(2)} approved! Funds will be paid in the next batch (typically 1-3 business days).`
      : needsReview
        ? `Withdrawal request for $${netPayout.toFixed(2)} submitted and is under review. You'll be notified once processed.`
        : `Withdrawal request for $${netPayout.toFixed(2)} submitted. Processing typically takes 3-5 business days.`;

    return new Response(
      JSON.stringify({
        success: true,
        withdrawal_id: withdrawalRecord.id,
        amount: totalWithdrawal,
        fee: WITHDRAWAL_FEE,
        net_payout: netPayout,
        status: withdrawalStatus,
        auto_approved: autoApproved,
        needs_review: needsReview,
        message: responseMessage,
        estimated_time: autoApproved ? '1-3 business days' : '3-5 business days'
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
