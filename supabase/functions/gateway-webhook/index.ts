 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gateway-signature',
 };
 
 // Subsidy config (should match frontend config)
 const SUBSIDY_PERCENTAGE = 1.0;
 const FIRST_DEPOSIT_BONUS_PERCENT = 0.10;
 const MAX_SUBSIDY_PER_USER_USD = 2.00;
 const MAX_SUBSIDIZED_DEPOSITS_PER_USER = 10;
 const PENDING_BALANCE_HOLD_HOURS = 72;
 
 serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
    try {
      // === TEMPORARY DEBUG LOGGING (remove before production) ===
      const bodyText = await req.text();
      console.log("🔥 CROSSMINT WEBHOOK RECEIVED");
      console.log("Headers:", JSON.stringify(Object.fromEntries(req.headers.entries())));
      console.log("Raw Body:", bodyText);
      // === END DEBUG LOGGING ===

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

     // SECURITY: Webhook signature verification is MANDATORY (Svix-style)
      const svixId = req.headers.get('svix-id');
      const svixTimestamp = req.headers.get('svix-timestamp');
      const svixSignature = req.headers.get('svix-signature');

      // Temporary debug logging for Svix headers
      console.log('🔐 Svix headers:', { svixId, svixTimestamp, svixSignature });

      const webhookSecret = Deno.env.get('GATEWAY_WEBHOOK_SECRET');
      
      if (!webhookSecret) {
        console.error('FATAL: GATEWAY_WEBHOOK_SECRET not configured');
        return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.error('Missing Svix signature headers');
        return new Response(JSON.stringify({ error: 'Missing svix signature headers' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Verify Svix HMAC-SHA256 signature
      // Secret format is "whsec_<base64>" — strip prefix and base64-decode
      const secretStr = webhookSecret.startsWith('whsec_') ? webhookSecret.slice(6) : webhookSecret;
      let secretBytes: Uint8Array;
      try {
        secretBytes = Uint8Array.from(atob(secretStr), c => c.charCodeAt(0));
      } catch {
        // If secret isn't base64-encoded, use it as raw UTF-8
        secretBytes = new TextEncoder().encode(secretStr);
      }

      const encoder = new TextEncoder();
      const signedContent = `${svixId}.${svixTimestamp}.${bodyText}`;
      const key = await crypto.subtle.importKey(
        'raw', secretBytes,
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
      const expectedSig = `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

      // Svix-signature header can contain multiple signatures separated by spaces
      const passedSignatures = svixSignature.split(' ');
      const verified = passedSignatures.some(s => s === expectedSig);

      if (!verified) {
        console.error('Svix signature mismatch. Expected:', expectedSig, 'Got:', svixSignature);
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

    const payload = JSON.parse(bodyText);
    console.log('Gateway webhook received (verified):', JSON.stringify(payload));
    console.log('📦 FULL PAYLOAD:', payload);

    const deliveryStatus =
      payload?.data?.delivery?.status ||
      payload?.data?.status ||
      payload?.status;
    console.log('💰 Payment status:', deliveryStatus);

    if (!deliveryStatus) {
      console.log('⚠️ No payment status found — skipping');
      return new Response('OK', { status: 200 });
    }

    if (deliveryStatus === 'completed' || deliveryStatus === 'awaiting-payment') {
      if (deliveryStatus === 'awaiting-payment') {
        console.log('⚡ Simulated payment completion');
      } else {
        console.log('✅ Processing completed payment');
        console.log('💵 CREDIT USER:', {
          amount: payload.data.quote.totalPrice.amount,
          currency: payload.data.quote.totalPrice.currency,
          user: payload.data.delivery.recipient.email
        });
      }
      return await handlePaymentCompleted(supabase, payload);
    } else if (deliveryStatus === 'failed') {
      return await handlePaymentFailed(supabase, payload);
    }

    console.log('ℹ️ Ignoring non-completed delivery status:', deliveryStatus);

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
 
   } catch (error) {
     console.error('Gateway webhook error:', error);
     return new Response(JSON.stringify({ error: (error as Error).message }), {
       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       status: 500
     });
   }
 });
 
 async function handlePaymentCompleted(supabase: any, payload: any) {
   // Extract data from webhook (structure depends on gateway provider)
   // This is a generic structure - adjust for your specific provider
   const {
     sessionId,
     userId,
     intendedAmount,
     netReceived,
     cryptoAmount,
     cryptoCurrency,
     txHash,
     countryCode,
     metadata,
   } = extractPaymentData(payload);
 
    console.log('✅ Processing completed payment');
    console.log('Processing completed payment:', { sessionId, userId, intendedAmount, netReceived });
 
   // Find the pending deposit record
   const { data: deposit, error: depositError } = await supabase
     .from('deposit_records')
     .select('*')
     .eq('gateway_session_id', sessionId)
     .single();
 
   if (depositError || !deposit) {
     console.error('Deposit record not found:', sessionId);
     return new Response(JSON.stringify({ error: 'Deposit not found' }), {
       headers: { 'Content-Type': 'application/json' },
       status: 404
     });
   }
 
   // Get user's wallet and check subsidy eligibility
   const { data: wallet } = await supabase
     .from('user_wallets')
     .select('*')
     .eq('user_id', userId)
     .single();
 
   const lifetimeSubsidy = wallet?.subsidy_lifetime_total || 0;
   const depositCount = wallet?.subsidized_deposit_count || 0;
   const firstBonusClaimed = wallet?.first_deposit_bonus_claimed || false;
 
   // Calculate subsidy amounts
   const providerFee = intendedAmount - netReceived;
   let feeReimbursement = 0;
   let firstDepositBonus = 0;
 
   // Check if eligible for subsidy
   const subsidyEligible = 
     lifetimeSubsidy < MAX_SUBSIDY_PER_USER_USD &&
     depositCount < MAX_SUBSIDIZED_DEPOSITS_PER_USER;
 
   if (subsidyEligible) {
     // Apply subsidy percentage (soft ramp-down)
     feeReimbursement = Math.min(
       providerFee * SUBSIDY_PERCENTAGE,
       MAX_SUBSIDY_PER_USER_USD - lifetimeSubsidy
     );
   }
 
   // Check for first deposit bonus
   const isFirstDeposit = !firstBonusClaimed;
   if (isFirstDeposit && subsidyEligible) {
     firstDepositBonus = netReceived * FIRST_DEPOSIT_BONUS_PERCENT;
   }
 
   const totalSubsidy = feeReimbursement + firstDepositBonus;
   const pendingUntil = new Date(Date.now() + PENDING_BALANCE_HOLD_HOURS * 60 * 60 * 1000);
 
   // Update deposit record
   await supabase
     .from('deposit_records')
     .update({
       status: 'completed',
       completed_at: new Date().toISOString(),
       crypto_tx_hash: txHash,
       net_amount: netReceived,
       provider_fee: providerFee,
       subsidy_credited: feeReimbursement,
       first_deposit_bonus: firstDepositBonus,
       is_first_deposit: isFirstDeposit,
       pending_until: pendingUntil.toISOString(),
     })
     .eq('id', deposit.id);
 
   // Update user's wallet
   // Net received goes to pending_balance first (chargeback protection)
   // Subsidy goes directly to subsidy_balance (non-withdrawable)
   const newBalance = (wallet?.balance_jv_token || 0); // Regular balance unchanged initially
   const newPendingBalance = (wallet?.pending_balance || 0) + netReceived;
   const newSubsidyBalance = (wallet?.subsidy_balance || 0) + totalSubsidy;
   const newLifetimeSubsidy = lifetimeSubsidy + feeReimbursement; // Only fee reimbursement counts toward cap
   const newDepositCount = depositCount + (subsidyEligible ? 1 : 0);
 
   await supabase
     .from('user_wallets')
     .update({
       balance_jv_token: newBalance,
       pending_balance: newPendingBalance,
       pending_until: pendingUntil.toISOString(),
       subsidy_balance: newSubsidyBalance,
       subsidy_lifetime_total: newLifetimeSubsidy,
       subsidized_deposit_count: newDepositCount,
       first_deposit_bonus_claimed: isFirstDeposit ? true : firstBonusClaimed,
       last_deposit_at: new Date().toISOString(),
     })
     .eq('user_id', userId);
 
   // Update country subsidy usage (for per-country caps)
   if (feeReimbursement > 0) {
     await updateCountrySubsidyUsage(supabase, countryCode, feeReimbursement);
   }
 
   // Create mint/burn audit record
   await supabase
     .from('mint_burn_audit')
     .insert({
       operation_type: 'mint',
       wallet_type: 'user',
       wallet_id: wallet?.id,
       amount_usd: netReceived + totalSubsidy,
       amount_jvc: netReceived + totalSubsidy,
       balance_before: wallet?.balance_jv_token || 0,
       balance_after: newBalance,
       total_supply_before: 0, // Would need to fetch actual value
       total_supply_after: 0,
       triggered_by: 'gateway_deposit',
       deposit_id: deposit.id,
     });
 
   console.log('Deposit processed successfully:', {
     userId,
     netReceived,
     feeReimbursement,
     firstDepositBonus,
     totalSubsidy,
   });
 
   return new Response(JSON.stringify({ 
     success: true,
     message: 'Payment processed',
     credited: netReceived + totalSubsidy,
   }), {
     headers: { 'Content-Type': 'application/json' },
     status: 200
   });
 }
 
 async function handlePaymentFailed(supabase: any, payload: any) {
   const sessionId = payload.sessionId || payload.metadata?.sessionId;
   
   await supabase
     .from('deposit_records')
     .update({
       status: 'failed',
       failure_reason: payload.error || 'Payment failed',
     })
     .eq('gateway_session_id', sessionId);
 
   return new Response(JSON.stringify({ received: true }), {
     headers: { 'Content-Type': 'application/json' },
     status: 200
   });
 }
 
 async function updateCountrySubsidyUsage(supabase: any, countryCode: string, subsidyAmount: number) {
   const today = new Date().toISOString().split('T')[0];
   
   // Try to update existing record
   const { data: existing } = await supabase
     .from('country_subsidy_usage')
     .select('*')
     .eq('country_code', countryCode)
     .eq('date', today)
     .single();
 
   if (existing) {
     await supabase
       .from('country_subsidy_usage')
       .update({
         daily_subsidy_total: existing.daily_subsidy_total + subsidyAmount,
         daily_deposit_count: existing.daily_deposit_count + 1,
         monthly_subsidy_total: existing.monthly_subsidy_total + subsidyAmount,
         monthly_deposit_count: existing.monthly_deposit_count + 1,
         updated_at: new Date().toISOString(),
       })
       .eq('id', existing.id);
   } else {
     await supabase
       .from('country_subsidy_usage')
       .insert({
         country_code: countryCode,
         date: today,
         daily_subsidy_total: subsidyAmount,
         daily_deposit_count: 1,
         monthly_subsidy_total: subsidyAmount,
         monthly_deposit_count: 1,
       });
   }
 }
 
 function extractPaymentData(payload: any) {
   // This structure should be adjusted based on your actual gateway provider
   // (Crossmint, MoonPay, Transak, etc.)
   return {
     sessionId: payload.sessionId || payload.id || payload.metadata?.sessionId,
     userId: payload.userId || payload.metadata?.userId,
     intendedAmount: parseFloat(payload.intendedAmount || payload.amount || payload.metadata?.intendedAmount || 0),
     netReceived: parseFloat(payload.netReceived || payload.settledAmount || payload.amount || 0),
     cryptoAmount: parseFloat(payload.cryptoAmount || 0),
     cryptoCurrency: payload.cryptoCurrency || payload.currency || 'XRP',
     txHash: payload.txHash || payload.transactionHash || payload.blockchain?.txHash,
     countryCode: payload.countryCode || payload.metadata?.countryCode || 'US',
     metadata: payload.metadata || {},
   };
 }