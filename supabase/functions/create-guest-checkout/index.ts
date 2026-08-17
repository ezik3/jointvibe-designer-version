import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GUEST-CHECKOUT] ${step}${detailsStr}`);
};

// Generate a random claim token for attribution
const generateClaimToken = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
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
    const { venue_id, order_id, amount, order_items, order_number } = await req.json();

    logStep('Creating guest checkout', { venue_id, order_id, amount, order_number });

    // Validate required fields
    if (!venue_id || !amount || amount <= 0) {
      throw new Error('venue_id and positive amount are required');
    }

    // Get venue details for display
    const { data: venue, error: venueError } = await supabaseAdmin
      .from('venues')
      .select('id, name, approval_status')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) {
      logStep('Venue not found', { venue_id, error: venueError });
      throw new Error('Venue not found');
    }

    if (venue.approval_status !== 'approved') {
      throw new Error('Venue is not approved for payments');
    }

    // Generate unique claim token
    const claimToken = generateClaimToken();
    
    // Dynamic platform fee — guest checkout defaults to Tier A since no profile
    const { calculatePlatformFee } = await import('../_shared/platformFees.ts');
    const platformFee = calculatePlatformFee(amount, 'US');
    const totalAmount = amount + platformFee;

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    // Build line items for Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    if (order_items && order_items.length > 0) {
      // Add each order item as a line item
      for (const item of order_items) {
        lineItems.push({
          price_data: {
            currency: 'aud',
            product_data: {
              name: item.name,
              description: item.quantity > 1 ? `Qty: ${item.quantity}` : undefined,
            },
            unit_amount: Math.round(item.price * 100), // Stripe uses cents
          },
          quantity: item.quantity,
        });
      }
    } else {
      // Single line item for the total
      lineItems.push({
        price_data: {
          currency: 'aud',
          product_data: {
            name: order_number ? `Order #${order_number}` : 'Payment',
            description: `Payment to ${venue.name}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      });
    }

    // Add platform fee as separate line item
    lineItems.push({
      price_data: {
        currency: 'aud',
        product_data: {
          name: 'Platform Fee',
        },
        unit_amount: Math.round(platformFee * 100),
      },
      quantity: 1,
    });

    // Get origin for success/cancel URLs
    const origin = req.headers.get('origin') || 'https://id-preview--2832b44b-03b1-48dc-9403-dce95f9cbd2b.lovable.app';

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${origin}/guest-pay/success?token=${claimToken}`,
      cancel_url: `${origin}/guest-pay/cancelled`,
      customer_email: undefined, // Let customer enter email
      phone_number_collection: { enabled: true },
      payment_intent_data: {
        metadata: {
          type: 'guest_payment',
          venue_id,
          order_id: order_id || '',
          claim_token: claimToken,
          amount: amount.toString(),
        },
      },
      metadata: {
        type: 'guest_payment',
        venue_id,
        order_id: order_id || '',
        claim_token: claimToken,
        amount: amount.toString(),
      },
    });

    logStep('Stripe session created', { sessionId: session.id, url: session.url });

    // Insert guest payment record
    const { error: insertError } = await supabaseAdmin
      .from('guest_payments')
      .insert({
        venue_id,
        order_id: order_id || null,
        amount,
        platform_fee: platformFee,
        stripe_session_id: session.id,
        claim_token: claimToken,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
      });

    if (insertError) {
      logStep('Error inserting guest payment', { error: insertError });
      throw new Error('Failed to create payment record');
    }

    logStep('Guest payment created', { claimToken, sessionId: session.id });

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        qr_data: session.url,
        claim_token: claimToken,
        session_id: session.id,
        expires_in: 1800, // 30 minutes
      }),
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