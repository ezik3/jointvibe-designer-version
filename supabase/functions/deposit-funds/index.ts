import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Conversion rate: 1 USD = 1 JVC (stablecoin model)
const USD_TO_JVC_RATE = 1;

// Feature flags for launch - PayID and Crypto DISABLED
const FEATURE_FLAGS = {
  PAYID_ENABLED: false,
  CRYPTO_ENABLED: false,
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DEPOSIT-FUNDS] ${step}${detailsStr}`);
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
    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('Not authenticated');
    }
    const user = userData.user;
    logStep('User authenticated', { userId: user.id, email: user.email });

    const { 
      deposit_type, // 'card' | 'bank_transfer' | 'payid' | 'crypto'
      amount,       // This is the wallet top-up amount (what user wants to receive)
      currency = 'usd',
      payment_method_id,
      return_url
    } = await req.json();

    // Derive origin for Stripe redirect URLs (strip path, keep protocol+host)
    let clientOrigin = req.headers.get('origin') || '';
    if (return_url) {
      try { clientOrigin = new URL(return_url).origin; } catch { /* keep header origin */ }
    }

    if (!deposit_type || !amount || amount <= 0) {
      throw new Error('Invalid deposit details');
    }

    // Feature flag checks for PayID and Crypto
    if (deposit_type === 'payid' && !FEATURE_FLAGS.PAYID_ENABLED) {
      throw new Error('PayID deposits are temporarily unavailable. Please use Card or Bank Transfer.');
    }

    if (deposit_type === 'crypto' && !FEATURE_FLAGS.CRYPTO_ENABLED) {
      throw new Error('Crypto deposits are temporarily unavailable. Please use Card or Bank Transfer.');
    }

    logStep('Processing deposit', { deposit_type, amount, currency });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    let transaction_id = '';
    let status = 'pending';
    
    // The wallet credit amount is ALWAYS the intended amount (what user wants to receive)
    const wallet_credit_amount = amount * USD_TO_JVC_RATE;
    let stripe_charge_amount = amount; // Will be updated for card to include fee
    let stripe_fee = 0;
    let client_secret = null;
    let payment_url = null;

    // Check if Stripe customer ID is cached in profile first
    let customerId: string | null = null;
    
    const { data: profileForCustomer } = await supabaseAdmin
      .from('customer_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (profileForCustomer?.stripe_customer_id) {
      customerId = profileForCustomer.stripe_customer_id;
      logStep('Found cached Stripe customer', { customerId });
    } else {
      // Fallback: lookup by email in Stripe
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep('Found existing Stripe customer', { customerId });
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { user_id: user.id }
        });
        customerId = customer.id;
        logStep('Created new Stripe customer', { customerId });
      }

      // Cache the customer ID for future lookups
      await supabaseAdmin
        .from('customer_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
      logStep('Cached stripe_customer_id in profile');
    }

    // Map deposit types to database-compatible values
    const dbDepositMethod = deposit_type === 'card' ? 'stripe_card' 
      : deposit_type === 'bank_transfer' ? 'stripe_bank' 
      : deposit_type;

    switch (deposit_type) {
      case 'card': {
        // Card payment: User pays X + fee, receives X JVC
        // Calculate Stripe fee: 2.9% + $0.30
        stripe_fee = (amount * 0.029) + 0.30;
        stripe_charge_amount = amount + stripe_fee; // User pays this total
        
        logStep('Card deposit calculation', {
          walletCreditAmount: wallet_credit_amount,
          stripeFee: stripe_fee,
          stripeChargeAmount: stripe_charge_amount
        });

        // Use Stripe Checkout for card payments (redirects user to Stripe hosted page)
        // Use the user's local currency for a better experience
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: currency,
              product_data: {
                name: 'Wallet Deposit',
                description: `Add funds to your wallet (includes processing fee)`,
              },
              unit_amount: Math.round(stripe_charge_amount * 100), // Total with fee
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: `${clientOrigin}/?checkout_return=user_wallet&success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${clientOrigin}/?checkout_return=user_wallet&canceled=true`,
          metadata: {
            user_id: user.id,
            type: 'jvc_deposit',
            deposit_type: 'card',
            wallet_credit_amount: wallet_credit_amount.toString(),
            stripe_charge_amount: stripe_charge_amount.toString(),
            display_currency: currency.toUpperCase()
          },
        });

        transaction_id = session.id;
        payment_url = session.url;
        status = 'pending';
        logStep('Card checkout session created', { sessionId: session.id, url: session.url, currency });
        break;
      }

      case 'bank_transfer': {
        // Bank transfer: No fees, user pays X and receives X JVC
        stripe_fee = 0;
        stripe_charge_amount = amount;
        
        // Use Stripe Checkout with card as fallback (BECS for AU coming later)
        // Use the user's local currency for a better experience
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'], // Start with card, expand to BECS later
          line_items: [{
            price_data: {
              currency: currency,
              product_data: {
                name: 'Wallet Deposit',
                description: `Add funds to your wallet`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: `${clientOrigin}/?checkout_return=user_wallet&success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${clientOrigin}/?checkout_return=user_wallet&canceled=true`,
          metadata: {
            user_id: user.id,
            type: 'jvc_deposit',
            deposit_type: 'bank_transfer',
            wallet_credit_amount: wallet_credit_amount.toString(),
            display_currency: currency.toUpperCase()
          },
        });

        transaction_id = session.id;
        payment_url = session.url;
        status = 'pending';
        logStep('Bank transfer checkout session created', { sessionId: session.id, currency });
        break;
      }

      // PayID and Crypto are DISABLED for launch
      case 'payid':
      case 'crypto':
        throw new Error(`${deposit_type} deposits are temporarily unavailable. Please use Card or Bank Transfer.`);

      default:
        throw new Error(`Unsupported deposit type: ${deposit_type}`);
    }

    // Create deposit record with new fields for proper tracking
    const depositRecord = {
      user_id: user.id,
      amount_local: stripe_charge_amount, // What Stripe charges
      amount_usd: amount, // The base amount before fees
      amount_jvc: wallet_credit_amount, // What user receives (same as wallet_credit_amount)
      wallet_credit_amount: wallet_credit_amount, // NEW: Explicit field for what to mint
      stripe_charge_amount: stripe_charge_amount, // NEW: What Stripe actually charges
      deposit_method: dbDepositMethod, // Use DB-compatible value
      status: status,
      local_currency: currency.toUpperCase(),
      stripe_payment_intent_id: transaction_id, // Now stores session ID for checkout
      stripe_fee: stripe_fee,
      net_amount: amount, // The intended amount (not net after fees)
      metadata: { stripe_customer_id: customerId }
    };

    const { data: depositData, error: depositError } = await supabaseAdmin
      .from('deposit_records')
      .insert(depositRecord)
      .select()
      .single();

    if (depositError) {
      logStep('Error creating deposit record', { error: depositError });
      throw new Error('Failed to create deposit record');
    }
    
    logStep('Deposit record created', { depositId: depositData?.id, walletCreditAmount: wallet_credit_amount });

    // If payment completed immediately (card with payment_method_id), process the deposit
    if (status === 'completed') {
      await processCompletedDeposit(supabaseAdmin, user.id, wallet_credit_amount, amount, depositData?.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction_id,
        deposit_type,
        status,
        amount: stripe_charge_amount, // Total charged
        wallet_credit_amount: wallet_credit_amount, // What user receives
        stripe_fee: stripe_fee,
        jvc_amount: status === 'completed' ? wallet_credit_amount : 0,
        client_secret,
        payment_url,
        message: status === 'completed' 
          ? `Successfully deposited ${wallet_credit_amount} JVC` 
          : `Deposit initiated. You will receive ${wallet_credit_amount} JVC after payment.`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// Helper function to process completed deposits - mints JVC and updates treasury
async function processCompletedDeposit(
  supabase: any,
  userId: string,
  jvcAmount: number, // This is the wallet_credit_amount
  usdAmount: number,
  depositId?: string
) {
  logStep('Processing completed deposit', { userId, jvcAmount, usdAmount });

  const now = new Date().toISOString();

  // Fix 3: Use atomic credit_wallet function
  const { data: newBalance, error: creditError } = await supabase.rpc('credit_wallet', {
    p_user_id: userId,
    p_amount: jvcAmount
  });

  if (creditError) {
    logStep('Error crediting wallet', { error: creditError });
    throw creditError;
  }

  const balanceBefore = (newBalance || 0) - jvcAmount; // Derive from result
  logStep('Wallet credited atomically', { balanceBefore, newBalance, jvcAmount });

  // 3. Get current treasury state
  const { data: treasury } = await supabase
    .from('platform_treasury')
    .select('*')
    .limit(1)
    .single();

  const supplyBefore = treasury?.total_jvc_supply || 0;
  const newSupply = supplyBefore + jvcAmount;

  // 4. Update treasury - MINT JVC
  await supabase
    .from('platform_treasury')
    .upsert({
      id: treasury?.id || undefined,
      total_jvc_supply: newSupply,
      total_usd_backing: (treasury?.total_usd_backing || 0) + jvcAmount,
      stripe_balance: (treasury?.stripe_balance || 0) + usdAmount,
      updated_at: now
    });

  logStep('Treasury updated - JVC minted', { supplyBefore, newSupply, usdBacking: jvcAmount });

  // 5. Create mint audit record
  await supabase.from('mint_burn_audit').insert({
    wallet_id: userId,
    wallet_type: 'user',
    operation_type: 'mint',
    amount_jvc: jvcAmount,
    amount_usd: jvcAmount,
    balance_before: balanceBefore,
    balance_after: newBalance,
    total_supply_before: supplyBefore,
    total_supply_after: newSupply,
    triggered_by: 'deposit',
    deposit_id: depositId
  });

  // 6. Create transaction record
  await supabase.from('transactions').insert({
    to_wallet_id: userId,
    to_wallet_type: 'user',
    amount_jvc: jvcAmount,
    amount_usd: jvcAmount,
    transaction_type: 'deposit',
    status: 'completed',
    description: `Deposited ${jvcAmount} JVC`,
    completed_at: now
  });

  // 7. Create ledger entry
  await supabase.from('ledger_entries').insert({
    wallet_id: userId,
    wallet_type: 'user',
    transaction_id: depositId || crypto.randomUUID(),
    entry_type: 'credit',
    amount: jvcAmount,
    balance_before: balanceBefore,
    balance_after: newBalance
  });

  // 8. Update deposit record to completed
  if (depositId) {
    await supabase
      .from('deposit_records')
      .update({ status: 'completed', completed_at: now })
      .eq('id', depositId);
  }

  logStep('Deposit fully processed');
}
