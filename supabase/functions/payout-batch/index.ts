import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PAYOUT-BATCH] ${step}${detailsStr}`);
};

/**
 * PAYOUT BATCH PROCESSOR
 * 
 * Processes approved withdrawals in batches with real Stripe transfers.
 * Creates Stripe Connect transfers for venues/users with connected accounts.
 * Marks withdrawals without Connect accounts as pending_connect_setup.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // SECURITY: Admin authentication is MANDATORY
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: userData.user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminId = userData.user.id;
    logStep('Admin authenticated', { adminId });

    // Parse optional parameters
    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 100; // Max withdrawals per batch
    const dryRun = body.dry_run || false; // Preview without processing

    logStep('Starting batch payout process', { limit, dryRun });

    // Fetch approved withdrawals ready for payout
    const { data: pendingPayouts, error: fetchError } = await supabaseAdmin
      .from('withdrawal_records')
      .select('*')
      .in('status', ['approved_automatically', 'approved'])
      .order('created_at', { ascending: true }) // FIFO
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch pending payouts: ${fetchError.message}`);
    }

    logStep('Found pending payouts', { count: pendingPayouts?.length || 0 });

    if (!pendingPayouts || pendingPayouts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending payouts to process',
          processed: 0,
          failed: 0,
          total_amount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (dryRun) {
      const totalAmount = pendingPayouts.reduce((sum, p) => sum + p.net_payout, 0);
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          message: `Would process ${pendingPayouts.length} payouts totaling $${totalAmount.toFixed(2)}`,
          payouts: pendingPayouts.map(p => ({
            id: p.id,
            amount: p.net_payout,
            method: p.withdrawal_method,
            type: p.venue_id ? 'venue' : 'user'
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each payout
    const results = {
      processed: 0,
      failed: 0,
      total_paid: 0,
      total_fees: 0,
      total_burned: 0,
      errors: [] as string[]
    };

    for (const withdrawal of pendingPayouts) {
      try {
        const now = new Date().toISOString();
        const isVenue = !!withdrawal.venue_id;
        const walletId = isVenue ? withdrawal.venue_id : withdrawal.user_id;

        logStep('Processing payout', { withdrawalId: withdrawal.id, amount: withdrawal.net_payout });

        // 1. Get wallet and current balance
        const walletTable = isVenue ? 'venue_wallets' : 'user_wallets';
        const balanceField = isVenue ? 'balance_jvc' : 'balance_jv_token';
        const idField = isVenue ? 'venue_id' : 'user_id';

        const { data: wallet, error: walletError } = await supabaseAdmin
          .from(walletTable)
          .select('*')
          .eq(idField, walletId)
          .single();

        if (walletError || !wallet) {
          throw new Error(`Wallet not found for ${idField}: ${walletId}`);
        }

        const balanceBefore = wallet[balanceField] || 0;
        const balanceAfter = balanceBefore - withdrawal.amount_jvc;
        const newLocked = Math.max(0, (wallet.locked_balance || 0) - withdrawal.amount_jvc);

        // 2. Debit wallet and unlock
        const { error: updateError } = await supabaseAdmin
          .from(walletTable)
          .update({
            [balanceField]: balanceAfter,
            locked_balance: newLocked,
            updated_at: now
          })
          .eq(idField, walletId);

        if (updateError) {
          throw new Error(`Failed to update wallet: ${updateError.message}`);
        }

        // 3. Burn JVC from treasury
        const { data: treasury, error: treasuryFetchError } = await supabaseAdmin
          .from('platform_treasury')
          .select('*')
          .limit(1)
          .single();

        if (treasuryFetchError) {
          throw new Error(`Failed to fetch treasury: ${treasuryFetchError.message}`);
        }

        const newSupply = Math.max(0, (treasury?.total_jvc_supply || 0) - withdrawal.amount_jvc);
        const newBacking = Math.max(0, (treasury?.total_usd_backing || 0) - withdrawal.amount_jvc);

        await supabaseAdmin
          .from('platform_treasury')
          .update({
            total_jvc_supply: newSupply,
            total_usd_backing: newBacking,
            collected_fees: (treasury?.collected_fees || 0) + withdrawal.fee_amount,
            updated_at: now
          })
          .eq('id', treasury.id);

        // 4. Create burn audit
        await supabaseAdmin.from('mint_burn_audit').insert({
          operation_type: 'burn',
          amount_jvc: withdrawal.amount_jvc,
          amount_usd: withdrawal.amount_usd,
          wallet_id: walletId,
          wallet_type: isVenue ? 'venue' : 'user',
          triggered_by: 'batch_payout',
          withdrawal_id: withdrawal.id,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          total_supply_before: treasury?.total_jvc_supply || 0,
          total_supply_after: newSupply,
          admin_id: adminId
        });

        // 5. Update withdrawal to PAID
        await supabaseAdmin
          .from('withdrawal_records')
          .update({
            status: 'completed',
            completed_at: now,
            processed_at: now
          })
          .eq('id', withdrawal.id);

        // 6. Update transaction
        await supabaseAdmin
          .from('transactions')
          .update({
            status: 'completed',
            fee_collected: true,
            completed_at: now
          })
          .eq('reference_id', withdrawal.id)
          .eq('reference_type', 'withdrawal');

        // 7. Create ledger entry
        await supabaseAdmin.from('ledger_entries').insert({
          wallet_id: walletId,
          wallet_type: isVenue ? 'venue' : 'user',
          entry_type: 'debit',
          amount: withdrawal.amount_jvc,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          transaction_id: withdrawal.id
        });

        // 8. Real Stripe Transfer
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2025-08-27.basil' });
        
        let stripeAccountId: string | null = null;
        let recipientOwnerId: string | null = null;

        if (isVenue) {
          const { data: venueData } = await supabaseAdmin
            .from('venues')
            .select('stripe_account_id, stripe_payouts_enabled, owner_user_id')
            .eq('id', walletId)
            .single();
          stripeAccountId = venueData?.stripe_payouts_enabled ? venueData.stripe_account_id : null;
          recipientOwnerId = venueData?.owner_user_id;
        } else {
          const { data: userProfile } = await supabaseAdmin
            .from('customer_profiles')
            .select('stripe_account_id, stripe_payouts_enabled, user_id')
            .eq('user_id', walletId)
            .single();
          stripeAccountId = userProfile?.stripe_payouts_enabled ? userProfile.stripe_account_id : null;
          recipientOwnerId = userProfile?.user_id;
        }

        if (stripeAccountId) {
          try {
            const transfer = await stripe.transfers.create({
              amount: Math.round(withdrawal.net_payout * 100),
              currency: 'usd',
              destination: stripeAccountId,
              description: `JointVibe batch payout - ${withdrawal.id}`,
              metadata: { withdrawal_id: withdrawal.id, platform: 'jointvibe' }
            });

            await supabaseAdmin.from('stripe_payouts').insert({
              stripe_transfer_id: transfer.id,
              recipient_type: isVenue ? 'venue' : 'user',
              recipient_id: recipientOwnerId || walletId,
              venue_id: isVenue ? walletId : null,
              amount: withdrawal.net_payout,
              currency: 'usd',
              status: 'processing',
              stripe_account_id: stripeAccountId,
              withdrawal_record_id: withdrawal.id
            });

            if (isVenue) {
              await supabaseAdmin.rpc('increment_venue_payouts', { p_amount: withdrawal.net_payout });
            } else {
              await supabaseAdmin.rpc('increment_user_payouts', { p_amount: withdrawal.net_payout });
            }

            logStep('Stripe transfer created', { transferId: transfer.id, withdrawalId: withdrawal.id });
          } catch (stripeError: any) {
            logStep('Stripe transfer failed (batch)', { withdrawalId: withdrawal.id, error: stripeError.message });
            await supabaseAdmin.from('stripe_payouts').insert({
              recipient_type: isVenue ? 'venue' : 'user',
              recipient_id: recipientOwnerId || walletId,
              venue_id: isVenue ? walletId : null,
              amount: withdrawal.net_payout,
              status: 'failed',
              failure_reason: stripeError.message,
              withdrawal_record_id: withdrawal.id
            });
          }
        } else {
          logStep('No Connect account - marking pending_connect_setup', { withdrawalId: withdrawal.id });
          await supabaseAdmin.from('withdrawal_records')
            .update({ status: 'pending_connect_setup' })
            .eq('id', withdrawal.id);
        }

        results.processed++;
        results.total_paid += withdrawal.net_payout;
        results.total_fees += withdrawal.fee_amount;
        results.total_burned += withdrawal.amount_jvc;

        logStep('Payout completed', { withdrawalId: withdrawal.id, netPayout: withdrawal.net_payout });

      } catch (payoutError) {
        const errorMsg = payoutError instanceof Error ? payoutError.message : 'Unknown error';
        results.failed++;
        results.errors.push(`${withdrawal.id}: ${errorMsg}`);
        logStep('Payout failed', { withdrawalId: withdrawal.id, error: errorMsg });

        // Mark as failed and unlock funds
        try {
          const isVenue = !!withdrawal.venue_id;
          const walletTable = isVenue ? 'venue_wallets' : 'user_wallets';
          const idField = isVenue ? 'venue_id' : 'user_id';
          const walletId = isVenue ? withdrawal.venue_id : withdrawal.user_id;

          // Get current locked balance and reduce it
          const { data: wallet } = await supabaseAdmin
            .from(walletTable)
            .select('locked_balance')
            .eq(idField, walletId)
            .single();

          const newLocked = Math.max(0, (wallet?.locked_balance || 0) - withdrawal.amount_jvc);

          await supabaseAdmin
            .from(walletTable)
            .update({ locked_balance: newLocked })
            .eq(idField, walletId);

          await supabaseAdmin
            .from('withdrawal_records')
            .update({
              status: 'failed',
              failure_reason: errorMsg
            })
            .eq('id', withdrawal.id);

        } catch (rollbackError) {
          logStep('Rollback failed', { withdrawalId: withdrawal.id, error: rollbackError });
        }
      }
    }

    logStep('Batch payout complete', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Batch payout complete: ${results.processed} processed, ${results.failed} failed`,
        ...results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    logStep('BATCH ERROR', { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
