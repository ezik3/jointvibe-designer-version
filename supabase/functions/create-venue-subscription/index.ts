import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getVenuePrice, getStripeUnitAmount } from "../_shared/venuePricing.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-VENUE-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) throw new Error('Unauthorized');

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    logStep('User authenticated', { userId, email: userEmail });

    const { venue_id, origin: clientOrigin } = await req.json();
    if (!venue_id) throw new Error('venue_id required');

    // Verify user owns this venue
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('id, owner_user_id, country_code, venue_status, name, registration_step, verified_at')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) throw new Error('Venue not found');
    if (venue.owner_user_id !== userId) throw new Error('Not the venue owner');
    if (venue.venue_status === 'live') throw new Error('Venue is already live');

    // Require verification before accepting a subscription
    if (!venue.verified_at) {
      logStep('Go-live blocked – venue not verified', { verified_at: venue.verified_at, registration_step: venue.registration_step });
      throw new Error('Please complete venue verification before going live.');
    }

    const countryCode = venue.country_code || 'US';
    const price = getVenuePrice(countryCode);
    const unitAmount = getStripeUnitAmount(countryCode);

    logStep('Venue found', { venueId: venue.id, countryCode, price: price.display });

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    // Find or create Stripe customer
    let customerId: string | undefined;
    const customers = await stripe.customers.list({ email: userEmail!, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const rawHttpOrigin = req.headers.get('origin');
    logStep('Origin resolution', {
      clientOrigin: clientOrigin ?? '(not set)',
      httpOrigin: rawHttpOrigin ?? '(not set)',
    });
    const origin = (
      clientOrigin ||
      rawHttpOrigin ||
      'https://www.jointvibe.app'
    ).replace(/\/$/, '');

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail!,
      line_items: [{
        price_data: {
          currency: price.currency.toLowerCase(),
          product_data: {
            name: 'JointVibe Venue Subscription',
            description: `Full access for ${venue.name || 'your venue'}`,
          },
          unit_amount: unitAmount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      metadata: {
        type: 'venue_subscription',
        venue_id: venue.id,
        user_id: userId,
      },
      subscription_data: {
        metadata: {
          venue_id: venue.id,
          type: 'venue_subscription',
        },
      },
      success_url: `${origin}/?checkout_return=venue_home&subscription=success`,
      cancel_url: `${origin}/?checkout_return=venue_home&subscription=cancelled`,
    });

    logStep('Checkout session created', { sessionId: session.id, url: session.url });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logStep('ERROR', { message: msg });
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
