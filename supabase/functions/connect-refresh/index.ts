import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: any) => {
  console.log(`[CONNECT-REFRESH] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, venue_id, account_type, return_url, refresh_url } = await req.json();
    const origin = req.headers.get('origin') || 'https://app.jointvibe.com';

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2025-08-27.basil',
    });

    // Determine the stripe_account_id
    let accountId: string | null = null;

    if (account_type === 'venue' && venue_id) {
      const { data: venue } = await supabaseAdmin
        .from('venues')
        .select('owner_user_id, stripe_account_id')
        .eq('id', venue_id)
        .single();

      if (!venue || venue.owner_user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Not authorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      accountId = venue.stripe_account_id;
    } else if (account_type === 'user') {
      const { data: profile } = await supabaseAdmin
        .from('customer_profiles')
        .select('stripe_account_id')
        .eq('user_id', user.id)
        .single();
      accountId = profile?.stripe_account_id;
    }

    if (!accountId) {
      return new Response(JSON.stringify({ error: 'No connected account found. Please complete onboarding first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'status') {
      const account = await stripe.accounts.retrieve(accountId);
      logStep('Account status retrieved', { accountId, chargesEnabled: account.charges_enabled });

      // Update local DB with latest status
      if (account_type === 'venue' && venue_id) {
        await supabaseAdmin.from('venues').update({
          stripe_onboarding_complete: account.details_submitted,
          stripe_charges_enabled: account.charges_enabled,
          stripe_payouts_enabled: account.payouts_enabled,
        }).eq('id', venue_id);
      } else if (account_type === 'user') {
        await supabaseAdmin.from('customer_profiles').update({
          stripe_onboarding_complete: account.details_submitted,
          stripe_payouts_enabled: account.payouts_enabled,
        }).eq('user_id', user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: account.requirements,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'refresh') {
      const defaultReturn = account_type === 'venue'
        ? `${origin}/venue/settings?stripe=complete`
        : `${origin}/app/wallet?stripe=complete`;
      const defaultRefresh = account_type === 'venue'
        ? `${origin}/venue/settings?stripe=refresh`
        : `${origin}/app/wallet?stripe=refresh`;

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refresh_url || defaultRefresh,
        return_url: return_url || defaultReturn,
        type: 'account_onboarding',
      });

      logStep('Refreshed onboarding link', { accountId });

      return new Response(JSON.stringify({
        success: true,
        onboarding_url: accountLink.url,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use "status" or "refresh".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown' });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
