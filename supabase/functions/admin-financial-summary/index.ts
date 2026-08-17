import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch all data in parallel
    const [
      treasuryResult,
      totalDepositsResult,
      venueWalletSumResult,
      userWalletSumResult,
      venuePayoutsResult,
      userPayoutsResult,
      pendingVenueWithdrawalsResult,
      pendingUserWithdrawalsResult,
      failedPayoutsResult,
      venuesWithConnectResult,
      venuesPayoutsEnabledResult,
      usersWithConnectResult,
      totalVenuesResult,
    ] = await Promise.all([
      supabaseAdmin.from('platform_treasury').select('*').limit(1).single(),
      supabaseAdmin.from('deposit_records').select('amount_usd').eq('status', 'completed'),
      supabaseAdmin.from('venue_wallets').select('balance_jvc'),
      supabaseAdmin.from('user_wallets').select('balance_jv_token'),
      supabaseAdmin.from('stripe_payouts').select('amount').eq('recipient_type', 'venue').eq('status', 'completed'),
      supabaseAdmin.from('stripe_payouts').select('amount').eq('recipient_type', 'user').eq('status', 'completed'),
      supabaseAdmin.from('withdrawal_records').select('id, net_payout').not('venue_id', 'is', null).in('status', ['pending', 'approved', 'approved_automatically', 'needs_review']),
      supabaseAdmin.from('withdrawal_records').select('id, net_payout').is('venue_id', null).in('status', ['pending', 'approved', 'approved_automatically', 'needs_review']),
      supabaseAdmin.from('stripe_payouts').select('id').eq('status', 'failed'),
      supabaseAdmin.from('venues').select('id').not('stripe_account_id', 'is', null),
      supabaseAdmin.from('venues').select('id').eq('stripe_payouts_enabled', true),
      supabaseAdmin.from('customer_profiles').select('id').not('stripe_account_id', 'is', null),
      supabaseAdmin.from('venues').select('id').eq('approval_status', 'approved'),
    ]);

    const treasury = treasuryResult.data;
    const totalDeposits = totalDepositsResult.data?.reduce((sum, d) => sum + (d.amount_usd || 0), 0) || 0;
    const totalVenueBalances = venueWalletSumResult.data?.reduce((sum, w) => sum + (w.balance_jvc || 0), 0) || 0;
    const totalUserBalances = userWalletSumResult.data?.reduce((sum, w) => sum + (w.balance_jv_token || 0), 0) || 0;
    const totalVenuePayouts = venuePayoutsResult.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const totalUserPayouts = userPayoutsResult.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    const collectedFees = treasury?.collected_fees || 0;
    const ownerWithdrawn = treasury?.owner_withdrawn || 0;
    const safetyBuffer = collectedFees * 0.10;
    const platformWithdrawable = Math.max(0, collectedFees - ownerWithdrawn - safetyBuffer);

    const reconciliationDelta = totalDeposits - totalVenueBalances - totalUserBalances - totalVenuePayouts - totalUserPayouts - collectedFees;

    const summary = {
      total_deposits: totalDeposits,
      total_venue_balances: totalVenueBalances,
      total_user_balances: totalUserBalances,
      total_platform_fees: collectedFees,
      total_venue_payouts: totalVenuePayouts,
      total_user_payouts: totalUserPayouts,
      platform_owner_withdrawn: ownerWithdrawn,
      platform_withdrawable: platformWithdrawable,
      safety_buffer: safetyBuffer,
      reconciliation_delta: reconciliationDelta,
      pending_venue_withdrawals: {
        count: pendingVenueWithdrawalsResult.data?.length || 0,
        total: pendingVenueWithdrawalsResult.data?.reduce((sum, w) => sum + (w.net_payout || 0), 0) || 0,
      },
      pending_user_withdrawals: {
        count: pendingUserWithdrawalsResult.data?.length || 0,
        total: pendingUserWithdrawalsResult.data?.reduce((sum, w) => sum + (w.net_payout || 0), 0) || 0,
      },
      failed_payouts: failedPayoutsResult.data?.length || 0,
      venues_with_connect: venuesWithConnectResult.data?.length || 0,
      venues_payouts_enabled: venuesPayoutsEnabledResult.data?.length || 0,
      users_with_connect: usersWithConnectResult.data?.length || 0,
      total_venues: totalVenuesResult.data?.length || 0,
      treasury: {
        total_jvc_supply: treasury?.total_jvc_supply || 0,
        total_usd_backing: treasury?.total_usd_backing || 0,
        stripe_balance: treasury?.stripe_balance || 0,
        pending_deposits: treasury?.pending_deposits || 0,
        pending_withdrawals: treasury?.pending_withdrawals || 0,
      },
    };

    return new Response(JSON.stringify({ success: true, ...summary }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[ADMIN-FINANCIAL-SUMMARY] ERROR:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
