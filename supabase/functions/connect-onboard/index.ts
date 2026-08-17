import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CONNECT-ONBOARD] ${step}${detailsStr}`);
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

    const { venue_id, return_url, refresh_url, account_type } = await req.json();
    const origin = req.headers.get('origin') || 'https://app.jointvibe.com';

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2025-08-27.basil',
    });

    if (account_type === 'venue') {
      if (!venue_id) {
        return new Response(JSON.stringify({ error: 'venue_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: venue } = await supabaseAdmin
        .from('venues')
        .select('id, owner_user_id, name, stripe_account_id, stripe_country')
        .eq('id', venue_id)
        .single();

      if (!venue || venue.owner_user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Not the venue owner' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let accountId = venue.stripe_account_id;

      if (!accountId) {
        logStep('Creating Stripe Express account for venue', { venueId: venue.id });
        const account = await stripe.accounts.create({
          type: 'express',
          country: venue.stripe_country || 'US',
          email: user.email,
          capabilities: {
            transfers: { requested: true },
          },
          business_type: 'company',
          metadata: {
            venue_id: venue.id,
            platform: 'jointvibe'
          }
        });

        accountId = account.id;
        await supabaseAdmin
          .from('venues')
          .update({ stripe_account_id: accountId })
          .eq('id', venue.id);
        logStep('Account created', { accountId });
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refresh_url || `${origin}/venue/settings?stripe=refresh`,
        return_url: return_url || `${origin}/venue/settings?stripe=complete`,
        type: 'account_onboarding',
      });

      await supabaseAdmin
        .from('venues')
        .update({
          stripe_onboarding_url: accountLink.url,
          stripe_onboarding_expires_at: new Date(accountLink.expires_at * 1000).toISOString()
        })
        .eq('id', venue.id);

      logStep('Onboarding link created', { accountId, url: accountLink.url });

      return new Response(JSON.stringify({
        success: true,
        onboarding_url: accountLink.url,
        account_id: accountId
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (account_type === 'user') {
      const { data: profile } = await supabaseAdmin
        .from('customer_profiles')
        .select('id, stripe_account_id')
        .eq('user_id', user.id)
        .single();

      let accountId = profile?.stripe_account_id;

      if (!accountId) {
        logStep('Creating Stripe Express account for user', { userId: user.id });
        const account = await stripe.accounts.create({
          type: 'express',
          email: user.email,
          capabilities: {
            transfers: { requested: true },
          },
          business_type: 'individual',
          metadata: {
            user_id: user.id,
            platform: 'jointvibe'
          }
        });

        accountId = account.id;
        await supabaseAdmin
          .from('customer_profiles')
          .update({ stripe_account_id: accountId })
          .eq('user_id', user.id);
        logStep('User account created', { accountId });
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refresh_url || `${origin}/app/wallet?stripe=refresh`,
        return_url: return_url || `${origin}/app/wallet?stripe=complete`,
        type: 'account_onboarding',
      });

      return new Response(JSON.stringify({
        success: true,
        onboarding_url: accountLink.url,
        account_id: accountId
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid account_type. Must be "venue" or "user".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown' });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
