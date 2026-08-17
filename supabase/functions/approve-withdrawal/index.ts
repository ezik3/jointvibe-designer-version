import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[APPROVE-WITHDRAWAL] ${step}${detailsStr}`);
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
    // Authenticate admin user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('Not authenticated');
    }
    const admin = userData.user;

    // Verify admin role
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', admin.id)
      .in('role', ['owner_superadmin', 'admin_finance'])
      .single();

    if (!adminRole) {
      throw new Error('Not authorized - admin access required');
    }

    logStep('Admin authenticated', { adminId: admin.id, role: adminRole.role });

    const { 
      withdrawal_id,
      action, // 'approve' | 'reject'
      rejection_reason
    } = await req.json();

    if (!withdrawal_id || !action) {
      throw new Error('Missing withdrawal_id or action');
    }

    // Get withdrawal record
    const { data: withdrawal, error: withdrawalError } = await supabaseAdmin
      .from('withdrawal_records')
      .select('*')
      .eq('id', withdrawal_id)
      .single();

    if (withdrawalError || !withdrawal) {
      throw new Error('Withdrawal not found');
    }

    if (withdrawal.status !== 'pending') {
      throw new Error(`Withdrawal already ${withdrawal.status}`);
    }

    logStep('Withdrawal found', { withdrawalId: withdrawal.id, amount: withdrawal.amount_jvc });

    const isVenueWithdrawal = !!withdrawal.venue_id;
    const walletType = isVenueWithdrawal ? 'venue' : 'user';

    if (action === 'reject') {
      // Reject withdrawal - return funds to wallet
      logStep('Rejecting withdrawal');

      // Update withdrawal record
      await supabaseAdmin
        .from('withdrawal_records')
        .update({
          status: 'rejected',
          rejection_reason: rejection_reason || 'Rejected by admin',
          approved_by: admin.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', withdrawal_id);

      // Return pending funds to available balance
      if (isVenueWithdrawal) {
        const { data: wallet } = await supabaseAdmin
          .from('venue_wallets')
          .select('*')
          .eq('venue_id', withdrawal.venue_id)
          .single();

        await supabaseAdmin
          .from('venue_wallets')
          .update({ 
            pending_balance: Math.max(0, (wallet?.pending_balance || 0) - withdrawal.amount_jvc),
            updated_at: new Date().toISOString()
          })
          .eq('venue_id', withdrawal.venue_id);
      } else {
        const { data: wallet } = await supabaseAdmin
          .from('user_wallets')
          .select('*')
          .eq('user_id', withdrawal.user_id)
          .single();

        await supabaseAdmin
          .from('user_wallets')
          .update({ 
            pending_balance: Math.max(0, (wallet?.pending_balance || 0) - withdrawal.amount_jvc),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', withdrawal.user_id);
      }

      // Update treasury
      const { data: treasury } = await supabaseAdmin
        .from('platform_treasury')
        .select('*')
        .limit(1)
        .single();

      await supabaseAdmin
        .from('platform_treasury')
        .update({
          pending_withdrawals: Math.max(0, (treasury?.pending_withdrawals || 0) - withdrawal.amount_jvc),
          updated_at: new Date().toISOString()
        })
        .eq('id', treasury?.id);

      // Update transaction status
      await supabaseAdmin
        .from('transactions')
        .update({ status: 'rejected' })
        .eq('reference_id', withdrawal_id);

      // Audit log
      await supabaseAdmin.from('admin_audit_log').insert({
        admin_id: admin.id,
        action_type: 'withdrawal_rejected',
        target_type: 'withdrawal',
        target_id: withdrawal_id,
        details: { rejection_reason, amount: withdrawal.amount_jvc }
      });

      return new Response(
        JSON.stringify({ success: true, message: 'Withdrawal rejected', withdrawal_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // APPROVE withdrawal
    logStep('Approving withdrawal');

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    // Get wallet for final debit
    let wallet: any;
    let balanceBefore: number;

    if (isVenueWithdrawal) {
      const { data: venueWallet } = await supabaseAdmin
        .from('venue_wallets')
        .select('*')
        .eq('venue_id', withdrawal.venue_id)
        .single();
      wallet = venueWallet;
      balanceBefore = wallet?.balance_jvc || 0;
    } else {
      const { data: userWallet } = await supabaseAdmin
        .from('user_wallets')
        .select('*')
        .eq('user_id', withdrawal.user_id)
        .single();
      wallet = userWallet;
      balanceBefore = wallet?.balance_jv_token || 0;
    }

    // Debit wallet and clear pending
    const balanceAfter = balanceBefore - withdrawal.amount_jvc;

    if (isVenueWithdrawal) {
      await supabaseAdmin
        .from('venue_wallets')
        .update({ 
          balance_jvc: balanceAfter,
          balance_usd: (wallet?.balance_usd || 0) - withdrawal.amount_usd,
          pending_balance: Math.max(0, (wallet?.pending_balance || 0) - withdrawal.amount_jvc),
          updated_at: new Date().toISOString()
        })
        .eq('venue_id', withdrawal.venue_id);
    } else {
      await supabaseAdmin
        .from('user_wallets')
        .update({ 
          balance_jv_token: balanceAfter,
          balance_usd: (wallet?.balance_usd || 0) - withdrawal.amount_usd,
          pending_balance: Math.max(0, (wallet?.pending_balance || 0) - withdrawal.amount_jvc),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', withdrawal.user_id);
    }

    logStep('Wallet debited', { balanceBefore, balanceAfter });

    // Update treasury - BURN JVC
    const { data: treasury } = await supabaseAdmin
      .from('platform_treasury')
      .select('*')
      .limit(1)
      .single();

    const supplyBefore = treasury?.total_jvc_supply || 0;
    const supplyAfter = supplyBefore - withdrawal.amount_jvc;

    await supabaseAdmin
      .from('platform_treasury')
      .update({
        total_jvc_supply: supplyAfter,
        total_usd_backing: (treasury?.total_usd_backing || 0) - withdrawal.net_payout,
        stripe_balance: (treasury?.stripe_balance || 0) - withdrawal.net_payout,
        pending_withdrawals: Math.max(0, (treasury?.pending_withdrawals || 0) - withdrawal.amount_jvc),
        collected_fees: (treasury?.collected_fees || 0) + withdrawal.fee_amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', treasury?.id);

    logStep('Treasury updated - JVC burned', { supplyBefore, supplyAfter });

    // Create burn audit record
    await supabaseAdmin.from('mint_burn_audit').insert({
      wallet_id: isVenueWithdrawal ? withdrawal.venue_id : withdrawal.user_id,
      wallet_type: walletType,
      operation_type: 'burn',
      amount_jvc: withdrawal.amount_jvc,
      amount_usd: withdrawal.amount_usd,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      total_supply_before: supplyBefore,
      total_supply_after: supplyAfter,
      triggered_by: 'withdrawal',
      withdrawal_id: withdrawal_id,
      admin_id: admin.id,
      admin_reason: 'Withdrawal approved'
    });

    // Update withdrawal record
    await supabaseAdmin
      .from('withdrawal_records')
      .update({
        status: 'completed',
        approved_by: admin.id,
        approved_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      })
      .eq('id', withdrawal_id);

    // Update transaction status
    await supabaseAdmin
      .from('transactions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('reference_id', withdrawal_id);

    // Create ledger entry
    await supabaseAdmin.from('ledger_entries').insert({
      transaction_id: withdrawal_id,
      wallet_id: isVenueWithdrawal ? withdrawal.venue_id : withdrawal.user_id,
      wallet_type: walletType,
      entry_type: 'debit',
      amount: withdrawal.amount_jvc,
      balance_before: balanceBefore,
      balance_after: balanceAfter
    });

    // Audit log
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: admin.id,
      action_type: 'withdrawal_approved',
      target_type: 'withdrawal',
      target_id: withdrawal_id,
      details: { amount: withdrawal.amount_jvc, net_payout: withdrawal.net_payout }
    });

    logStep('DB operations complete - initiating real payout');

    // ============= REAL STRIPE TRANSFER =============
    const payoutAmount = withdrawal.net_payout;

    if (isVenueWithdrawal) {
      // Look up venue Connect account
      const { data: venueData } = await supabaseAdmin
        .from('venues')
        .select('stripe_account_id, stripe_payouts_enabled, owner_user_id')
        .eq('id', withdrawal.venue_id)
        .single();

      if (venueData?.stripe_account_id && venueData.stripe_payouts_enabled) {
        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(payoutAmount * 100),
            currency: 'usd',
            destination: venueData.stripe_account_id,
            description: `JointVibe venue payout - withdrawal ${withdrawal_id}`,
            metadata: {
              withdrawal_id: withdrawal_id,
              venue_id: withdrawal.venue_id,
              platform: 'jointvibe'
            }
          });

          await supabaseAdmin.from('stripe_payouts').insert({
            stripe_transfer_id: transfer.id,
            recipient_type: 'venue',
            recipient_id: venueData.owner_user_id,
            venue_id: withdrawal.venue_id,
            amount: payoutAmount,
            currency: 'usd',
            status: 'processing',
            stripe_account_id: venueData.stripe_account_id,
            withdrawal_record_id: withdrawal_id
          });

          await supabaseAdmin.rpc('increment_venue_payouts', { p_amount: payoutAmount });
          logStep('Stripe transfer created for venue', { transferId: transfer.id });
        } catch (stripeError: any) {
          logStep('Stripe transfer FAILED for venue', { error: stripeError.message });
          await supabaseAdmin.from('withdrawal_records')
            .update({ status: 'payout_failed', updated_at: new Date().toISOString() })
            .eq('id', withdrawal_id);
          await supabaseAdmin.from('stripe_payouts').insert({
            recipient_type: 'venue',
            recipient_id: venueData.owner_user_id,
            venue_id: withdrawal.venue_id,
            amount: payoutAmount,
            status: 'failed',
            failure_reason: stripeError.message,
            withdrawal_record_id: withdrawal_id
          });
        }
      } else {
        logStep('Venue has no Connect account - marking pending_manual_payout');
        await supabaseAdmin.from('withdrawal_records')
          .update({ status: 'pending_manual_payout', updated_at: new Date().toISOString() })
          .eq('id', withdrawal_id);
      }
    } else {
      // User withdrawal - check user Connect account
      const { data: userProfile } = await supabaseAdmin
        .from('customer_profiles')
        .select('stripe_account_id, stripe_payouts_enabled')
        .eq('user_id', withdrawal.user_id)
        .single();

      if (userProfile?.stripe_account_id && userProfile.stripe_payouts_enabled) {
        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(payoutAmount * 100),
            currency: 'usd',
            destination: userProfile.stripe_account_id,
            description: `JointVibe user payout - withdrawal ${withdrawal_id}`,
            metadata: {
              withdrawal_id: withdrawal_id,
              user_id: withdrawal.user_id,
              platform: 'jointvibe'
            }
          });

          await supabaseAdmin.from('stripe_payouts').insert({
            stripe_transfer_id: transfer.id,
            recipient_type: 'user',
            recipient_id: withdrawal.user_id,
            amount: payoutAmount,
            currency: 'usd',
            status: 'processing',
            stripe_account_id: userProfile.stripe_account_id,
            withdrawal_record_id: withdrawal_id
          });

          await supabaseAdmin.rpc('increment_user_payouts', { p_amount: payoutAmount });
          logStep('Stripe transfer created for user', { transferId: transfer.id });
        } catch (stripeError: any) {
          logStep('Stripe transfer FAILED for user', { error: stripeError.message });
          await supabaseAdmin.from('withdrawal_records')
            .update({ status: 'payout_failed', updated_at: new Date().toISOString() })
            .eq('id', withdrawal_id);
          await supabaseAdmin.from('stripe_payouts').insert({
            recipient_type: 'user',
            recipient_id: withdrawal.user_id,
            amount: payoutAmount,
            status: 'failed',
            failure_reason: stripeError.message,
            withdrawal_record_id: withdrawal_id
          });
        }
      } else {
        logStep('User has no Connect account - marking pending_manual_payout');
        await supabaseAdmin.from('withdrawal_records')
          .update({ status: 'pending_manual_payout', updated_at: new Date().toISOString() })
          .eq('id', withdrawal_id);
      }
    }

    logStep('Withdrawal completed');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Withdrawal approved and processed',
        withdrawal_id,
        amount: withdrawal.amount_jvc,
        net_payout: withdrawal.net_payout
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
