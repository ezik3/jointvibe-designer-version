import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADMIN-WITHDRAWAL] ${step}${detailsStr}`);
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
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('Not authenticated');
    }
    const adminId = userData.user.id;

    // Verify admin role
    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: adminId });
    if (!isAdmin) {
      throw new Error('Unauthorized: Admin access required');
    }

    const { action, withdrawal_id, reason } = await req.json();

    if (!withdrawal_id || !action) {
      throw new Error('Missing withdrawal_id or action');
    }

    // Get withdrawal record
    const { data: withdrawal, error: wError } = await supabaseAdmin
      .from('withdrawal_records')
      .select('*')
      .eq('id', withdrawal_id)
      .single();

    if (wError || !withdrawal) {
      throw new Error('Withdrawal not found');
    }

    const now = new Date().toISOString();
    const isVenue = !!withdrawal.venue_id;
    const walletId = isVenue ? withdrawal.venue_id : withdrawal.user_id;

    switch (action) {
      case 'approve': {
        if (withdrawal.status !== 'pending') {
          throw new Error('Can only approve pending withdrawals');
        }

        await supabaseAdmin.from('withdrawal_records').update({
          status: 'approved',
          approved_by: adminId,
          approved_at: now
        }).eq('id', withdrawal_id);

        logStep('Withdrawal approved', { withdrawal_id, adminId });
        break;
      }

      case 'mark_paid': {
        if (withdrawal.status !== 'approved') {
          throw new Error('Can only mark approved withdrawals as paid');
        }

        // NOW we actually debit the wallet and burn JVC
        const walletTable = isVenue ? 'venue_wallets' : 'user_wallets';
        const balanceField = isVenue ? 'balance_jvc' : 'balance_jv_token';
        const idField = isVenue ? 'venue_id' : 'user_id';

        const { data: wallet } = await supabaseAdmin
          .from(walletTable)
          .select('*')
          .eq(idField, walletId)
          .single();

        const balanceBefore = wallet?.[balanceField] || 0;
        const balanceAfter = balanceBefore - withdrawal.amount_jvc;
        const newLocked = Math.max(0, (wallet?.locked_balance || 0) - withdrawal.amount_jvc);

        // Debit wallet and unlock
        await supabaseAdmin.from(walletTable).update({
          [balanceField]: balanceAfter,
          locked_balance: newLocked,
          updated_at: now
        }).eq(idField, walletId);

        // Burn JVC from treasury
        const { data: treasury } = await supabaseAdmin
          .from('platform_treasury')
          .select('*')
          .limit(1)
          .single();

        const newSupply = Math.max(0, (treasury?.total_jvc_supply || 0) - withdrawal.amount_jvc);
        const newBacking = Math.max(0, (treasury?.total_usd_backing || 0) - withdrawal.amount_jvc);

        await supabaseAdmin.from('platform_treasury').upsert({
          id: treasury?.id,
          total_jvc_supply: newSupply,
          total_usd_backing: newBacking,
          collected_fees: (treasury?.collected_fees || 0) + withdrawal.fee_amount,
          updated_at: now
        });

        // Create burn audit
        await supabaseAdmin.from('mint_burn_audit').insert({
          operation_type: 'burn',
          amount_jvc: withdrawal.amount_jvc,
          amount_usd: withdrawal.amount_usd,
          wallet_id: walletId,
          wallet_type: isVenue ? 'venue' : 'user',
          triggered_by: 'withdrawal',
          withdrawal_id: withdrawal_id,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          total_supply_before: treasury?.total_jvc_supply || 0,
          total_supply_after: newSupply
        });

        // Update withdrawal to paid
        await supabaseAdmin.from('withdrawal_records').update({
          status: 'completed',
          completed_at: now,
          processed_at: now
        }).eq('id', withdrawal_id);

        // Update transaction
        await supabaseAdmin.from('transactions').update({
          status: 'completed',
          fee_collected: true,
          completed_at: now
        }).eq('reference_id', withdrawal_id).eq('reference_type', 'withdrawal');

        logStep('Withdrawal marked as PAID, JVC burned', { withdrawal_id, burned: withdrawal.amount_jvc });
        break;
      }

      case 'reject': {
        if (withdrawal.status !== 'pending' && withdrawal.status !== 'approved') {
          throw new Error('Cannot reject completed withdrawals');
        }

        // Unlock funds back to user
        const walletTable = isVenue ? 'venue_wallets' : 'user_wallets';
        const idField = isVenue ? 'venue_id' : 'user_id';

        const { data: wallet } = await supabaseAdmin
          .from(walletTable)
          .select('locked_balance')
          .eq(idField, walletId)
          .single();

        const newLocked = Math.max(0, (wallet?.locked_balance || 0) - withdrawal.amount_jvc);

        await supabaseAdmin.from(walletTable).update({
          locked_balance: newLocked,
          updated_at: now
        }).eq(idField, walletId);

        await supabaseAdmin.from('withdrawal_records').update({
          status: 'rejected',
          rejection_reason: reason || 'Rejected by admin'
        }).eq('id', withdrawal_id);

        await supabaseAdmin.from('transactions').update({
          status: 'failed',
          description: `Withdrawal rejected: ${reason || 'Rejected by admin'}`
        }).eq('reference_id', withdrawal_id).eq('reference_type', 'withdrawal');

        logStep('Withdrawal rejected, funds unlocked', { withdrawal_id, unlocked: withdrawal.amount_jvc });
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, action, withdrawal_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
