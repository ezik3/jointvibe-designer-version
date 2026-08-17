import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
    apiVersion: '2025-08-27.basil',
  });

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    logStep('Received webhook', { hasSignature: !!signature });

    // SECURITY: Webhook secret is MANDATORY
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('FATAL: STRIPE_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      logStep('Webhook signature verified');
    } catch (err) {
      logStep('Webhook signature verification failed', { error: err instanceof Error ? err.message : 'Unknown' });
      return new Response(
        JSON.stringify({ error: 'Invalid webhook signature' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    logStep('Event received', { type: event.type, id: event.id });

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        logStep('Payment succeeded', { 
          paymentIntentId: paymentIntent.id, 
          amount: paymentIntent.amount,
          metadata: paymentIntent.metadata 
        });

        // IDEMPOTENCY CHECK: Find the deposit record by payment intent ID
        const { data: deposit, error: depositError } = await supabaseAdmin
          .from('deposit_records')
          .select('*')
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .single();

        if (depositError || !deposit) {
          logStep('No pending deposit found for payment intent', { paymentIntentId: paymentIntent.id });
          break;
        }

        // IDEMPOTENCY: Skip if already completed
        if (deposit.status === 'completed') {
          logStep('IDEMPOTENCY: Deposit already completed, skipping', { depositId: deposit.id });
          break;
        }

        // Use wallet_credit_amount (the intended amount user wants to receive)
        // NOT net_amount which was deducted by fees
        const walletCreditAmount = deposit.wallet_credit_amount || deposit.amount_jvc;
        const stripeChargeAmount = deposit.stripe_charge_amount || (paymentIntent.amount / 100);
        const stripeFee = deposit.stripe_fee || (stripeChargeAmount * 0.029 + 0.30);

        logStep('Minting JVC', { walletCreditAmount, stripeChargeAmount, stripeFee });

        // Update deposit record to completed FIRST (prevents duplicate processing)
        const { error: updateError } = await supabaseAdmin
          .from('deposit_records')
          .update({
            status: 'completed',
            stripe_charge_id: paymentIntent.latest_charge,
            completed_at: new Date().toISOString()
          })
          .eq('id', deposit.id)
          .eq('status', 'pending'); // Only update if still pending (double-check idempotency)

        if (updateError) {
          logStep('Error updating deposit or already processed', { error: updateError });
          break;
        }

        // Credit the wallet with the intended amount (wallet_credit_amount)
        const isVenueDeposit = !!deposit.venue_id;
        
        if (isVenueDeposit) {
          const { data: wallet } = await supabaseAdmin
            .from('venue_wallets')
            .select('balance_jvc')
            .eq('venue_id', deposit.venue_id)
            .single();

          const balanceBefore = wallet?.balance_jvc || 0;
          const newBalance = balanceBefore + walletCreditAmount;

          await supabaseAdmin
            .from('venue_wallets')
            .update({ 
              balance_jvc: newBalance,
              updated_at: new Date().toISOString()
            })
            .eq('venue_id', deposit.venue_id);

          // Create mint audit
          await supabaseAdmin.from('mint_burn_audit').insert({
            operation_type: 'mint',
            amount_jvc: walletCreditAmount,
            amount_usd: walletCreditAmount,
            wallet_id: deposit.venue_id,
            wallet_type: 'venue',
            triggered_by: 'deposit',
            deposit_id: deposit.id,
            balance_before: balanceBefore,
            balance_after: newBalance,
            total_supply_before: 0,
            total_supply_after: 0
          });

          logStep('Venue wallet credited', { balanceBefore, newBalance, credited: walletCreditAmount });
        } else {
          const { data: wallet } = await supabaseAdmin
            .from('user_wallets')
            .select('balance_jv_token, first_deposit_at')
            .eq('user_id', deposit.user_id)
            .single();

          const balanceBefore = wallet?.balance_jv_token || 0;
          const newBalance = balanceBefore + walletCreditAmount;
          const now = new Date().toISOString();

          // Update wallet with eligibility tracking
          await supabaseAdmin
            .from('user_wallets')
            .update({ 
              balance_jv_token: newBalance,
              updated_at: now,
              last_deposit_at: now,
              first_deposit_at: wallet?.first_deposit_at || now // Only set if first deposit
            })
            .eq('user_id', deposit.user_id);

          // Create mint audit
          await supabaseAdmin.from('mint_burn_audit').insert({
            operation_type: 'mint',
            amount_jvc: walletCreditAmount,
            amount_usd: walletCreditAmount,
            wallet_id: deposit.user_id,
            wallet_type: 'user',
            triggered_by: 'deposit',
            deposit_id: deposit.id,
            balance_before: balanceBefore,
            balance_after: newBalance,
            total_supply_before: 0,
            total_supply_after: 0
          });

          logStep('User wallet credited', { balanceBefore, newBalance, credited: walletCreditAmount });
        }

        // Update treasury - mint JVC
        const { data: treasury } = await supabaseAdmin
          .from('platform_treasury')
          .select('*')
          .limit(1)
          .single();

        const newSupply = (treasury?.total_jvc_supply || 0) + walletCreditAmount;
        const newBacking = (treasury?.total_usd_backing || 0) + walletCreditAmount;

        await supabaseAdmin
          .from('platform_treasury')
          .upsert({
            id: treasury?.id || undefined,
            total_jvc_supply: newSupply,
            total_usd_backing: newBacking,
            stripe_balance: (treasury?.stripe_balance || 0) + stripeChargeAmount,
            pending_deposits: Math.max(0, (treasury?.pending_deposits || 0) - stripeChargeAmount),
            updated_at: new Date().toISOString()
          });

        // Create transaction record
        await supabaseAdmin.from('transactions').insert({
          to_wallet_id: isVenueDeposit ? deposit.venue_id : deposit.user_id,
          to_wallet_type: isVenueDeposit ? 'venue' : 'user',
          amount_jvc: walletCreditAmount,
          amount_usd: walletCreditAmount,
          fee_amount: stripeFee,
          transaction_type: 'deposit',
          status: 'completed',
          description: `Deposit via ${deposit.deposit_method} - Received ${walletCreditAmount.toFixed(2)} JVC (Stripe charged: $${stripeChargeAmount.toFixed(2)}, fee: $${stripeFee.toFixed(2)})`,
          reference_id: deposit.id,
          reference_type: 'deposit',
          completed_at: new Date().toISOString()
        });

        logStep('Deposit completed successfully', { depositId: deposit.id, credited: walletCreditAmount });
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        logStep('Payment failed', { paymentIntentId: paymentIntent.id });

        await supabaseAdmin
          .from('deposit_records')
          .update({
            status: 'failed',
            failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed'
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        logStep('Checkout session completed', { 
          sessionId: session.id, 
          paymentIntentId: session.payment_intent,
          metadata: session.metadata 
        });

        // ============= VENUE SUBSCRIPTION GO-LIVE =============
        if (session.metadata?.type === 'venue_subscription') {
          const venueId = session.metadata.venue_id;
          const subscriptionId = session.subscription;
          logStep('Processing venue subscription go-live', { venueId, subscriptionId });

          // 1. Wipe test data
          await supabaseAdmin
            .from('orders')
            .delete()
            .eq('venue_id', venueId)
            .eq('is_test_order', true);

          await supabaseAdmin
            .from('transactions')
            .delete()
            .eq('to_wallet_id', venueId)
            .eq('to_wallet_type', 'venue')
            .eq('is_test', true);

          await supabaseAdmin
            .from('table_reservations')
            .delete()
            .eq('venue_id', venueId)
            .eq('is_test', true);

          // 2. Remove all test users (legacy + new invite system)
          await supabaseAdmin
            .from('venue_test_users')
            .update({ status: 'removed' })
            .eq('venue_id', venueId);

          // 2b. Revoke all test invites
          await supabaseAdmin
            .from('venue_test_invites')
            .update({ status: 'revoked' })
            .eq('venue_id', venueId)
            .in('status', ['pending', 'accepted']);

          // 2c. Deactivate all test wallet balances
          await supabaseAdmin
            .from('test_wallet_balances')
            .update({ is_active: false, balance_cents: 0, updated_at: new Date().toISOString() })
            .eq('venue_id', venueId)
            .eq('is_active', true);

          // 3. Flip venue to live
          await supabaseAdmin
            .from('venues')
            .update({
              venue_status: 'live',
              subscription_id: subscriptionId,
              subscription_started_at: new Date().toISOString(),
              went_live_at: new Date().toISOString(),
            })
            .eq('id', venueId);

          // Wipe test vibe credits
          await supabaseAdmin
            .from('venue_vibe_credits')
            .delete()
            .eq('venue_id', venueId)
            .eq('credit_type', 'purchased');

          logStep('Venue went live!', { venueId, subscriptionId });
          break;
        }

        // Handle Guest Payments (non-app customers)
        if (session.metadata?.type === 'guest_payment') {
          const venueId = session.metadata.venue_id;
          const orderId = session.metadata.order_id;
          const claimToken = session.metadata.claim_token;
          const amount = parseFloat(session.metadata.amount || '0');
          const customerEmail = session.customer_details?.email;
          const customerPhone = session.customer_details?.phone;

          logStep('Processing guest payment', { venueId, orderId, claimToken, amount });

          // Check if already processed
          const { data: existingPayment } = await supabaseAdmin
            .from('guest_payments')
            .select('id, status')
            .eq('stripe_session_id', session.id)
            .single();

          if (existingPayment?.status === 'completed') {
            logStep('IDEMPOTENCY: Guest payment already completed', { sessionId: session.id });
            break;
          }

          // Update guest_payments record
          const { error: updateError } = await supabaseAdmin
            .from('guest_payments')
            .update({
              status: 'completed',
              stripe_payment_intent_id: session.payment_intent,
              guest_email: customerEmail,
              guest_phone: customerPhone,
              paid_at: new Date().toISOString(),
            })
            .eq('stripe_session_id', session.id);

          if (updateError) {
            logStep('Error updating guest payment', { error: updateError });
          }

          // Mark the order as paid if order_id exists
          if (orderId) {
            await supabaseAdmin
              .from('orders')
              .update({ status: 'paid' })
              .eq('id', orderId);
            logStep('Order marked as paid', { orderId });
          }

          // Credit venue wallet (amount minus platform fee already collected by Stripe)
          const platformFee = 0.10;
          const venueCredit = amount; // Venue gets the full order amount, platform keeps fee

          const { data: venueWallet } = await supabaseAdmin
            .from('venue_wallets')
            .select('balance_jvc')
            .eq('venue_id', venueId)
            .single();

          const balanceBefore = venueWallet?.balance_jvc || 0;
          const newBalance = balanceBefore + venueCredit;

          await supabaseAdmin
            .from('venue_wallets')
            .upsert({
              venue_id: venueId,
              balance_jvc: newBalance,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'venue_id' });

          // Create transaction record for venue
          await supabaseAdmin.from('transactions').insert({
            to_wallet_id: venueId,
            to_wallet_type: 'venue',
            amount_jvc: venueCredit,
            amount_usd: venueCredit,
            fee_amount: platformFee,
            transaction_type: 'payment',
            status: 'completed',
            description: `Guest payment via Stripe Checkout${orderId ? ` (Order)` : ''}`,
            reference_type: 'guest_payment',
            completed_at: new Date().toISOString(),
          });

          // Update platform treasury with collected fee
          const { data: treasury } = await supabaseAdmin
            .from('platform_treasury')
            .select('*')
            .limit(1)
            .single();

          await supabaseAdmin
            .from('platform_treasury')
            .upsert({
              id: treasury?.id || undefined,
              collected_fees: (treasury?.collected_fees || 0) + platformFee,
              updated_at: new Date().toISOString(),
            });

          logStep('Guest payment completed', { venueId, venueCredit, newBalance });
          break;
        }

        // ============= AD BOOKING PAYMENT =============
        if (session.metadata?.type === 'ad_booking') {
          const bookingId = session.metadata.booking_id;
          logStep('Processing ad booking payment', { bookingId });

          // Mark booking as paid
          await supabaseAdmin
            .from('ad_bookings')
            .update({ payment_status: 'paid' })
            .eq('id', bookingId);

          // Activate campaign only if admin has already approved it
          const { data: booking } = await supabaseAdmin
            .from('ad_bookings')
            .select('campaign_id')
            .eq('id', bookingId)
            .single();

          if (booking?.campaign_id) {
            await supabaseAdmin
              .from('ad_campaigns')
              .update({ status: 'live' })
              .eq('id', booking.campaign_id)
              .eq('status', 'approved'); // Only go live if admin approved
          }

          logStep('Ad booking activated', { bookingId, campaignId: booking?.campaign_id });
          break;
        }

        // ============= PUSH CREDITS PURCHASE =============
        if (session.metadata?.type === 'push_credits_purchase') {
          const { venue_id, credits, reach_tier } = session.metadata;
          const creditsToAdd = parseInt(credits || '0');
          logStep('Processing push credits purchase', { venue_id, creditsToAdd, reach_tier });

          const { data: existing } = await supabaseAdmin
            .from('venue_push_credits')
            .select('credits_remaining')
            .eq('venue_id', venue_id)
            .eq('reach_tier', reach_tier)
            .eq('credit_type', 'purchase')
            .maybeSingle();

          const newTotal = Math.min(600, (existing?.credits_remaining || 0) + creditsToAdd);

          await supabaseAdmin
            .from('venue_push_credits')
            .upsert({
              venue_id,
              reach_tier,
              credit_type: 'purchase',
              credits_remaining: newTotal,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'venue_id,reach_tier,credit_type' });

          logStep('Push credits added', { venue_id, creditsToAdd, newTotal });
          break;
        }

        // ============= VIBE CREDITS PURCHASE =============
        if (session.metadata?.type === 'vibe_credits_purchase') {
          const { venue_id, credits, reach_tier } = session.metadata;
          const creditsToAdd = parseInt(credits || '0');
          logStep('Processing vibe credits purchase', { venue_id, creditsToAdd, reach_tier });

          // Idempotency check
          const { data: existingFulfillment } = await supabaseAdmin
            .from('vibe_credit_fulfillments')
            .select('id')
            .eq('stripe_session_id', session.id)
            .maybeSingle();

          if (existingFulfillment) {
            logStep('IDEMPOTENCY: Vibe credits already fulfilled', { sessionId: session.id });
            break;
          }

          // Upsert purchased vibe credits
          const { data: existing } = await supabaseAdmin
            .from('venue_vibe_credits')
            .select('credits_remaining')
            .eq('venue_id', venue_id)
            .eq('reach_tier', reach_tier)
            .eq('credit_type', 'purchased')
            .maybeSingle();

          const newTotal = (existing?.credits_remaining || 0) + creditsToAdd;

          await supabaseAdmin
            .from('venue_vibe_credits')
            .upsert({
              venue_id,
              reach_tier,
              credit_type: 'purchased',
              credits_remaining: newTotal,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'venue_id,reach_tier,credit_type' });

          // Record fulfillment for idempotency
          await supabaseAdmin
            .from('vibe_credit_fulfillments')
            .insert({
              stripe_session_id: session.id,
              venue_id,
              reach_tier,
              credits_granted: creditsToAdd,
              amount_cents: session.amount_total || 0,
            });

          logStep('Vibe credits added', { venue_id, creditsToAdd, newTotal });
          break;
        }

        // Handle JVC deposits from checkout sessions (both card and bank)
        if (session.metadata?.type === 'jvc_deposit') {
          const userId = session.metadata.user_id;
          const walletCreditAmount = parseFloat(session.metadata.wallet_credit_amount || '0');
          const stripeChargeAmount = parseFloat(session.metadata.stripe_charge_amount || String(session.amount_total / 100));
          
          if (!userId || walletCreditAmount <= 0) {
            logStep('Invalid checkout metadata', { userId, walletCreditAmount });
            break;
          }

          // Check if already processed by looking for completed deposit with this session ID
          const { data: existingDeposit } = await supabaseAdmin
            .from('deposit_records')
            .select('id, status')
            .eq('stripe_payment_intent_id', session.id)
            .single();

          if (existingDeposit?.status === 'completed') {
            logStep('IDEMPOTENCY: Checkout deposit already completed', { sessionId: session.id });
            break;
          }

          // Update deposit record if exists, or create new one
          const depositMethod = session.metadata.deposit_type === 'card' ? 'stripe_card' : 'stripe_bank';
          
          if (existingDeposit) {
            await supabaseAdmin
              .from('deposit_records')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', existingDeposit.id);
          } else {
            // Create deposit record if it doesn't exist (edge case)
            await supabaseAdmin
              .from('deposit_records')
              .insert({
                user_id: userId,
                amount_jvc: walletCreditAmount,
                amount_usd: walletCreditAmount,
                amount_local: stripeChargeAmount,
                wallet_credit_amount: walletCreditAmount,
                stripe_charge_amount: stripeChargeAmount,
                deposit_method: depositMethod,
                status: 'completed',
                stripe_payment_intent_id: session.id,
                completed_at: new Date().toISOString(),
                local_currency: 'USD'
              });
          }

          // Credit user wallet
          const { data: wallet } = await supabaseAdmin
            .from('user_wallets')
            .select('balance_jv_token, first_deposit_at')
            .eq('user_id', userId)
            .single();

          const balanceBefore = wallet?.balance_jv_token || 0;
          const newBalance = balanceBefore + walletCreditAmount;
          const now = new Date().toISOString();

          await supabaseAdmin
            .from('user_wallets')
            .update({ 
              balance_jv_token: newBalance,
              updated_at: now,
              last_deposit_at: now,
              first_deposit_at: wallet?.first_deposit_at || now
            })
            .eq('user_id', userId);

          // Create mint audit
          await supabaseAdmin.from('mint_burn_audit').insert({
            operation_type: 'mint',
            amount_jvc: walletCreditAmount,
            amount_usd: walletCreditAmount,
            wallet_id: userId,
            wallet_type: 'user',
            triggered_by: 'deposit',
            balance_before: balanceBefore,
            balance_after: newBalance,
            total_supply_before: 0,
            total_supply_after: 0
          });

          // Update treasury
          const { data: treasury } = await supabaseAdmin
            .from('platform_treasury')
            .select('*')
            .limit(1)
            .single();

          const newSupply = (treasury?.total_jvc_supply || 0) + walletCreditAmount;
          const newBacking = (treasury?.total_usd_backing || 0) + walletCreditAmount;

          await supabaseAdmin
            .from('platform_treasury')
            .upsert({
              id: treasury?.id || undefined,
              total_jvc_supply: newSupply,
              total_usd_backing: newBacking,
              stripe_balance: (treasury?.stripe_balance || 0) + stripeChargeAmount,
              updated_at: now
            });

          // Create transaction record
          await supabaseAdmin.from('transactions').insert({
            to_wallet_id: userId,
            to_wallet_type: 'user',
            amount_jvc: walletCreditAmount,
            amount_usd: walletCreditAmount,
            transaction_type: 'deposit',
            status: 'completed',
            description: `Checkout deposit - Received ${walletCreditAmount.toFixed(2)} JVC`,
            completed_at: now
          });

          logStep('Checkout deposit processed', { userId, credited: walletCreditAmount, newBalance });
        }
        break;
      }

      // Handle subscription invoice paid - trigger residual for user-to-venue referrals
      case 'invoice.paid': {
        const invoice = event.data.object;
        logStep('Invoice paid', { 
          invoiceId: invoice.id, 
          subscriptionId: invoice.subscription,
          customerId: invoice.customer,
          amountPaid: invoice.amount_paid
        });

        // Only process subscription invoices (not one-time payments)
        if (!invoice.subscription) {
          logStep('Not a subscription invoice, skipping residual');
          break;
        }

        // Get subscription metadata to find venue_id
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const venueId = subscription.metadata?.venue_id;
        
        if (!venueId) {
          logStep('No venue_id in subscription metadata, skipping residual');
          break;
        }

        logStep('Processing referral residual for venue', { venueId });

        // Find qualifying referrals for this venue (status = rewarded means one-time was already paid)
        const { data: referrals, error: refError } = await supabaseAdmin
          .from('referrals')
          .select('id, referrer_type, referrer_id')
          .eq('referred_venue_id', venueId)
          .eq('status', 'rewarded')
          .eq('referrer_type', 'user'); // Only user-to-venue referrals get residuals

        if (refError || !referrals || referrals.length === 0) {
          logStep('No qualifying referrals found for venue', { venueId });
          break;
        }

        // Calculate billing period (use invoice period or current month)
        const periodStart = new Date(invoice.period_start * 1000);
        const periodEnd = new Date(invoice.period_end * 1000);
        const billingPeriodStart = periodStart.toISOString().split('T')[0];
        const billingPeriodEnd = periodEnd.toISOString().split('T')[0];

        for (const referral of referrals) {
          // Check residual cap (max 12 months OR $50 = 2500 cents per venue)
          const { data: existingResiduals } = await supabaseAdmin
            .from('referral_rewards')
            .select('amount_cents')
            .eq('referral_id', referral.id)
            .eq('reward_type', 'monthly_residual')
            .eq('status', 'issued');

          const residualCount = existingResiduals?.length || 0;
          const totalResidualCents = existingResiduals?.reduce((sum, r) => sum + r.amount_cents, 0) || 0;

          // Cap at 12 months or $50 (5000 cents) total
          if (residualCount >= 12 || totalResidualCents >= 5000) {
            logStep('Residual cap reached, skipping', { 
              referralId: referral.id, 
              residualCount, 
              totalResidualCents 
            });
            continue;
          }

          // Idempotency check - don't double-pay for same billing period
          const { data: existingForPeriod } = await supabaseAdmin
            .from('referral_rewards')
            .select('id')
            .eq('referral_id', referral.id)
            .eq('reward_type', 'monthly_residual')
            .eq('billing_period_start', billingPeriodStart)
            .maybeSingle();

          if (existingForPeriod) {
            logStep('Residual already issued for this period', { 
              referralId: referral.id, 
              billingPeriodStart 
            });
            continue;
          }

          // Issue $2 residual credit
          const residualAmountCents = 200; // $2.00

          const { error: rewardError } = await supabaseAdmin
            .from('referral_rewards')
            .insert({
              referral_id: referral.id,
              reward_type: 'monthly_residual',
              amount_cents: residualAmountCents,
              status: 'issued',
              issued_to_type: referral.referrer_type,
              issued_to_id: referral.referrer_id,
              issued_at: new Date().toISOString(),
              billing_period_start: billingPeriodStart,
              billing_period_end: billingPeriodEnd,
              venue_id: venueId
            });

          if (rewardError) {
            logStep('Error creating residual reward', { error: rewardError });
            continue;
          }

          // Credit the user's wallet with $2
          const { data: wallet } = await supabaseAdmin
            .from('user_wallets')
            .select('balance_jv_token')
            .eq('user_id', referral.referrer_id)
            .maybeSingle();

          if (wallet) {
            await supabaseAdmin
              .from('user_wallets')
              .update({ 
                balance_jv_token: (wallet.balance_jv_token || 0) + 2,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', referral.referrer_id);

            logStep('Residual credit issued', { 
              referralId: referral.id, 
              referrerId: referral.referrer_id,
              amount: 2,
              billingPeriod: billingPeriodStart
            });
          }
        }

        // Area 8: Grant monthly subscription push credits (5 local credits, cap 60)
        logStep('Granting monthly push credits for venue subscription', { venueId });
        const { data: existingCredits } = await supabaseAdmin
          .from('venue_push_credits')
          .select('credits_remaining')
          .eq('venue_id', venueId)
          .eq('reach_tier', 'local')
          .eq('credit_type', 'subscription')
          .maybeSingle();

        const currentCredits = existingCredits?.credits_remaining || 0;
        const newCredits = Math.min(60, currentCredits + 5);

        await supabaseAdmin
          .from('venue_push_credits')
          .upsert({
            venue_id: venueId,
            reach_tier: 'local',
            credit_type: 'subscription',
            credits_remaining: newCredits,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'venue_id,reach_tier,credit_type' });

        logStep('Push credits granted', { venueId, previousCredits: currentCredits, newCredits });

        break;
      }

      // ============= STRIPE CONNECT EVENTS =============
      case 'account.updated': {
        const account = event.data.object;
        const accountId = account.id;
        logStep('Account updated', { accountId, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled });

        // Check if venue
        const { data: venue } = await supabaseAdmin
          .from('venues')
          .select('id')
          .eq('stripe_account_id', accountId)
          .maybeSingle();

        if (venue) {
          await supabaseAdmin
            .from('venues')
            .update({
              stripe_onboarding_complete: account.details_submitted,
              stripe_charges_enabled: account.charges_enabled,
              stripe_payouts_enabled: account.payouts_enabled
            })
            .eq('id', venue.id);
          logStep('Venue Connect status updated', { venueId: venue.id });
          break;
        }

        // Check if user
        const { data: userProfile } = await supabaseAdmin
          .from('customer_profiles')
          .select('user_id')
          .eq('stripe_account_id', accountId)
          .maybeSingle();

        if (userProfile) {
          await supabaseAdmin
            .from('customer_profiles')
            .update({
              stripe_onboarding_complete: account.details_submitted,
              stripe_payouts_enabled: account.payouts_enabled
            })
            .eq('stripe_account_id', accountId);
          logStep('User Connect status updated', { userId: userProfile.user_id });
        }
        break;
      }

      case 'transfer.created': {
        const transfer = event.data.object;
        logStep('Transfer created', { transferId: transfer.id });
        await supabaseAdmin
          .from('stripe_payouts')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('stripe_transfer_id', transfer.id);
        break;
      }

      case 'transfer.reversed':
      case 'transfer.failed': {
        const transfer = event.data.object;
        const newStatus = event.type === 'transfer.reversed' ? 'reversed' : 'failed';
        logStep(`Transfer ${newStatus}`, { transferId: transfer.id });

        await supabaseAdmin
          .from('stripe_payouts')
          .update({
            status: newStatus,
            failure_reason: transfer.failure_message || event.type,
            updated_at: new Date().toISOString()
          })
          .eq('stripe_transfer_id', transfer.id);

        // Re-credit wallet
        const { data: payout } = await supabaseAdmin
          .from('stripe_payouts')
          .select('recipient_type, recipient_id, venue_id, amount, withdrawal_record_id')
          .eq('stripe_transfer_id', transfer.id)
          .single();

        if (payout) {
          if (payout.recipient_type === 'venue' && payout.venue_id) {
            await supabaseAdmin.rpc('credit_venue_wallet', { p_venue_id: payout.venue_id, p_amount: payout.amount });
            logStep('Venue wallet re-credited', { venueId: payout.venue_id, amount: payout.amount });
          } else if (payout.recipient_type === 'user') {
            await supabaseAdmin.rpc('credit_wallet', { p_user_id: payout.recipient_id, p_amount: payout.amount });
            logStep('User wallet re-credited', { userId: payout.recipient_id, amount: payout.amount });
          }

          if (payout.withdrawal_record_id) {
            await supabaseAdmin
              .from('withdrawal_records')
              .update({ status: 'payout_failed' })
              .eq('id', payout.withdrawal_record_id);
          }
        }
        break;
      }

      case 'payout.paid': {
        const payout = event.data.object;
        logStep('Payout completed to bank', { payoutId: payout.id, destination: payout.destination });
        // Update matching stripe_payouts record if exists
        await supabaseAdmin
          .from('stripe_payouts')
          .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('stripe_payout_id', payout.id);
        break;
      }

      // ============= SUBSCRIPTION CANCELLATION =============
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        logStep('Subscription cancelled', { subscriptionId });

        const { data: venue } = await supabaseAdmin
          .from('venues')
          .select('id')
          .eq('subscription_id', subscriptionId)
          .maybeSingle();

        if (venue) {
          await supabaseAdmin
            .from('venues')
            .update({ venue_status: 'testing' })
            .eq('id', venue.id);
          logStep('Venue reverted to testing', { venueId: venue.id });
        }
        break;
      }

      default:
        logStep('Unhandled event type', { type: event.type });
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
