import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Conversion rate: 1 USD = 1 JVC (stablecoin model)
const USD_TO_JVC_RATE = 1;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user) {
      throw new Error('Not authenticated');
    }

    const { 
      deposit_type, // 'card' | 'bank_transfer' | 'payid' | 'crypto'
      amount, 
      currency = 'usd',
      payment_method_id,
      bank_details,
      return_url
    } = await req.json();

    if (!deposit_type || !amount || amount <= 0) {
      throw new Error('Invalid deposit details');
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    let transaction_id = '';
    let status = 'pending';
    let jv_tokens = 0;
    let client_secret = null;
    let payment_url = null;

    console.log(`[BANK-DEPOSIT] Processing ${deposit_type} deposit of ${amount} ${currency} for user ${user.id}`);

    // Check if Stripe customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
    }

    switch (deposit_type) {
      case 'card': {
        // Card payment via Stripe PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: currency,
          customer: customerId,
          payment_method: payment_method_id,
          confirm: payment_method_id ? true : false,
          automatic_payment_methods: payment_method_id ? undefined : {
            enabled: true,
          },
          metadata: {
            user_id: user.id,
            type: 'jv_coin_purchase',
            deposit_type: 'card'
          },
        });

        transaction_id = paymentIntent.id;
        client_secret = paymentIntent.client_secret;
        
        if (paymentIntent.status === 'succeeded') {
          status = 'completed';
          jv_tokens = amount * USD_TO_JVC_RATE;
        } else {
          status = 'pending';
        }

        console.log(`[BANK-DEPOSIT] Card payment created: ${transaction_id}, status: ${paymentIntent.status}`);
        break;
      }

      case 'bank_transfer': {
        // Bank transfer via Stripe (ACH/BECS/SEPA)
        // Create a checkout session for bank transfer
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['us_bank_account', 'card'], // ACH for US
          line_items: [{
            price_data: {
              currency: currency,
              product_data: {
                name: 'JV Coin Purchase',
                description: `${amount} JVC tokens`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: return_url ? `${return_url}?success=true&session_id={CHECKOUT_SESSION_ID}` : `${req.headers.get('origin')}/wallet?success=true`,
          cancel_url: return_url ? `${return_url}?canceled=true` : `${req.headers.get('origin')}/wallet?canceled=true`,
          metadata: {
            user_id: user.id,
            type: 'jv_coin_purchase',
            deposit_type: 'bank_transfer',
            jvc_amount: amount.toString()
          },
        });

        transaction_id = session.id;
        payment_url = session.url;
        status = 'pending';

        console.log(`[BANK-DEPOSIT] Bank transfer session created: ${transaction_id}`);
        break;
      }

      case 'payid': {
        // PayID simulation - generate reference for manual transfer
        const reference = `JV${user.id.slice(-6).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
        
        transaction_id = `payid_${reference}`;
        status = 'awaiting_transfer';
        
        // In production, this would integrate with PayID system
        console.log(`[BANK-DEPOSIT] PayID reference generated: ${reference}`);
        
        return new Response(JSON.stringify({
          success: true,
          deposit_type: 'payid',
          transaction_id,
          status,
          instructions: {
            payid: 'joinvibe@payid.com.au', // Your venue's PayID
            amount: amount,
            reference: reference,
            message: `Transfer $${amount} AUD to the PayID above with reference: ${reference}. Your JVC will be credited within 1-2 business days after verification.`
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      case 'crypto': {
        // Crypto deposit simulation
        // In production, this would integrate with XRP Ledger or crypto payment processor
        const depositAddress = `r${user.id.slice(0, 20).replace(/-/g, '')}Deposit`;
        
        transaction_id = `crypto_${Date.now()}_${user.id}`;
        status = 'awaiting_deposit';

        console.log(`[BANK-DEPOSIT] Crypto deposit address generated: ${depositAddress}`);
        
        return new Response(JSON.stringify({
          success: true,
          deposit_type: 'crypto',
          transaction_id,
          status,
          instructions: {
            address: depositAddress,
            currency: 'XRP',
            amount: amount,
            rate: '1 XRP = 1 JVC',
            message: `Send ${amount} XRP to the address above. Your JVC will be credited automatically after 3 confirmations.`
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      default:
        throw new Error(`Unsupported deposit type: ${deposit_type}`);
    }

    // If payment succeeded immediately (card with payment_method_id), update wallet
    if (status === 'completed' && jv_tokens > 0) {
      const { data: wallet, error: walletError } = await supabaseClient
        .from('user_wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (walletError && walletError.code !== 'PGRST116') {
        throw walletError;
      }

      const newBalance = {
        user_id: user.id,
        balance_jv_token: (wallet?.balance_jv_token || 0) + jv_tokens,
        balance_usd: (wallet?.balance_usd || 0) + amount,
      };

      const { error: upsertError } = await supabaseClient
        .from('user_wallets')
        .upsert(newBalance);

      if (upsertError) {
        throw upsertError;
      }

      console.log(`[BANK-DEPOSIT] Wallet updated: +${jv_tokens} JVC`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction_id,
        deposit_type,
        status,
        amount,
        jv_tokens: status === 'completed' ? jv_tokens : 0,
        client_secret,
        payment_url,
        message: status === 'completed' 
          ? `Successfully deposited ${jv_tokens} JVC` 
          : 'Deposit initiated, complete payment to receive JVC'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[BANK-DEPOSIT] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
