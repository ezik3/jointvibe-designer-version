import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SAFETY_BUFFER_PERCENT = 0.10; // Keep 10% as reserve

const logStep = (step: string, details?: any) => {
  console.log(`[ADMIN-PLATFORM-WITHDRAWAL] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
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

    // Verify admin
    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { amount } = await req.json();

    // Get treasury
    const { data: treasury } = await supabaseAdmin
      .from('platform_treasury')
      .select('*')
      .limit(1)
      .single();

    if (!treasury) {
      return new Response(JSON.stringify({ error: 'Treasury not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const collectedFees = treasury.collected_fees || 0;
    const alreadyWithdrawn = treasury.owner_withdrawn || 0;
    const grossAvailable = collectedFees - alreadyWithdrawn;
    const safetyBuffer = collectedFees * SAFETY_BUFFER_PERCENT;
    const maxWithdrawable = Math.max(0, grossAvailable - safetyBuffer);

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({
        success: true,
        action: 'info',
        collected_fees: collectedFees,
        already_withdrawn: alreadyWithdrawn,
        safety_buffer: safetyBuffer,
        max_withdrawable: maxWithdrawable,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (amount > maxWithdrawable) {
      return new Response(JSON.stringify({
        error: `Maximum withdrawable is $${maxWithdrawable.toFixed(2)} (10% safety buffer reserved)`,
        max_withdrawable: maxWithdrawable,
        safety_buffer: safetyBuffer,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    logStep('Processing platform withdrawal', { amount, maxWithdrawable });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2025-08-27.basil',
    });

    // Create Stripe payout to platform's bank
    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      description: 'JointVibe platform profit withdrawal',
      metadata: {
        admin_id: user.id,
        platform: 'jointvibe',
        type: 'platform_profit'
      }
    });

    logStep('Stripe payout created', { payoutId: payout.id });

    // Record in stripe_payouts
    await supabaseAdmin.from('stripe_payouts').insert({
      stripe_payout_id: payout.id,
      recipient_type: 'platform',
      recipient_id: user.id,
      amount: amount,
      currency: 'usd',
      status: 'processing',
    });

    // Update treasury
    await supabaseAdmin
      .from('platform_treasury')
      .update({
        owner_withdrawn: alreadyWithdrawn + amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', treasury.id);

    // Audit log
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: user.id,
      action_type: 'platform_profit_withdrawal',
      target_type: 'treasury',
      target_id: treasury.id,
      details: { amount, payout_id: payout.id, safety_buffer: safetyBuffer }
    });

    return new Response(JSON.stringify({
      success: true,
      amount,
      payout_id: payout.id,
      remaining_withdrawable: maxWithdrawable - amount,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown' });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
