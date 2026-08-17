import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { orderId, paymentMethod, verification_token } = await req.json();

    if (!orderId || !paymentMethod) {
      throw new Error('Missing required fields: orderId and paymentMethod');
    }

    // Fix 6: Load authoritative amount from database
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('id, total, venue_id, status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found');
    }
    if (order.status === 'paid') {
      throw new Error('Order already paid');
    }

    const amount = order.total;

    // ── Payment Verification Gate ──
    const { data: secSettings } = await supabaseClient
      .from('payment_security_settings')
      .select('payment_pin_hash')
      .eq('user_id', user.id)
      .single();

    if (!secSettings?.payment_pin_hash) {
      return new Response(
        JSON.stringify({ error: 'payment_pin_required', message: 'Please set up your payment PIN first.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!verification_token) {
      return new Response(
        JSON.stringify({ error: 'verification_needed', message: 'Payment verification required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For card payments, use Stripe
    if (paymentMethod === 'card') {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeKey) {
        throw new Error('Stripe not configured');
      }

      const stripe = new Stripe(stripeKey, {
        apiVersion: '2025-08-27.basil',
      });

      // Create a payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          orderId,
          userId: user.id,
        },
      });

      // Record payment in database
      const { error: paymentError } = await supabaseClient
        .from('payments')
        .insert({
          order_id: orderId,
          amount,
          payment_method: paymentMethod,
          status: 'pending',
          transaction_id: paymentIntent.id,
          staff_id: user.id,
        });

      if (paymentError) {
        console.error('Error recording payment:', paymentError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // For cash/mobile payments, just record in database
    const { error: paymentError } = await supabaseClient
      .from('payments')
      .insert({
        order_id: orderId,
        amount,
        payment_method: paymentMethod,
        status: 'completed',
        staff_id: user.id,
      });

    if (paymentError) {
      throw paymentError;
    }

    // Update order status
    const { error: orderError } = await supabaseClient
      .from('orders')
      .update({ status: 'served' })
      .eq('id', orderId);

    if (orderError) {
      console.error('Error updating order:', orderError);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Payment processed successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Payment processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
