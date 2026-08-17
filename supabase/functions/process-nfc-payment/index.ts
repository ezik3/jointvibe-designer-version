import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      customer_id,
      customer_session_token,
      order_id,
      venue_id,
      employee_id,
      verification_token
    } = await req.json();

    // INPUT VALIDATION: UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Validate required fields
    if (!customer_id || !venue_id || !employee_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // INPUT VALIDATION: UUID format checks
    if (!uuidRegex.test(customer_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid customer_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!uuidRegex.test(venue_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid venue_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!uuidRegex.test(employee_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid employee_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (order_id && !uuidRegex.test(order_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid order_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fix 6: Load authoritative amount from database
    let amount: number;
    if (order_id) {
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('total, status')
        .eq('id', order_id)
        .single();
      if (orderErr || !order) {
        return new Response(
          JSON.stringify({ error: 'Order not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (order.status === 'paid') {
        return new Response(
          JSON.stringify({ error: 'Order already paid' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      amount = order.total;
    } else {
      return new Response(
        JSON.stringify({ error: 'order_id is required for NFC payments' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (amount <= 0 || amount > 1000000) {
      return new Response(
        JSON.stringify({ error: 'Invalid order amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY FIX: Validate customer_session_token to ensure customer authorized this payment
    if (!customer_session_token) {
      return new Response(
        JSON.stringify({ error: 'Customer authentication token required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify customer token is valid and matches the customer_id
    const customerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${customer_session_token}`
        }
      }
    });

    const { data: customerAuthData, error: customerAuthError } = await customerClient.auth.getUser();
    
    if (customerAuthError || !customerAuthData?.user) {
      console.error('Customer authentication failed:', customerAuthError);
      return new Response(
        JSON.stringify({ error: 'Invalid customer authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Verify the authenticated customer matches the customer_id in the request
    if (customerAuthData.user.id !== customer_id) {
      console.error('Customer ID mismatch - potential fraud attempt', {
        authenticated_user: customerAuthData.user.id,
        requested_customer: customer_id
      });
      return new Response(
        JSON.stringify({ error: 'Customer authentication mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Payment Verification Gate ──
    const { data: secSettings } = await supabase
      .from('payment_security_settings')
      .select('payment_pin_hash')
      .eq('user_id', customer_id)
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

    console.log('Processing NFC payment:', { customer_id, amount, venue_id, employee_id, order_id });

    // Check if venue is in testing mode
    const { data: venueInfo } = await supabase
      .from('venues')
      .select('venue_status')
      .eq('id', venue_id)
      .single();

    if (venueInfo?.venue_status === 'testing') {
      console.log('[process-nfc-payment] Venue in testing mode - enforcing sandbox payment');
      const { handleSandboxPayment } = await import('../_shared/sandboxPayment.ts');
      const sandboxResult = await handleSandboxPayment(supabase, {
        venue_id,
        customer_id: customer_id,
        amount,
        order_id,
        payment_method: 'nfc',
        description: 'NFC payment',
      });

      if (sandboxResult.is_sandbox) {
        return new Response(JSON.stringify(sandboxResult.response_body), {
          status: sandboxResult.status || 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Step 1: Verify employee is authorized for this venue
    const { data: employeeLink, error: employeeError } = await supabase
      .from('employee_venue_links')
      .select('*')
      .eq('user_id', employee_id)
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .single();

    if (employeeError || !employeeLink) {
      console.error('Employee not authorized:', employeeError);
      return new Response(
        JSON.stringify({ error: 'Employee not authorized to accept payments for this venue' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check employee permissions
    const permissions = employeeLink.permissions as any || {};
    if (permissions.accept_payments === false) {
      return new Response(
        JSON.stringify({ error: 'Employee does not have payment acceptance permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dynamic platform fee based on payer country
    const { data: payerProfile } = await supabase
      .from('customer_profiles')
      .select('country_code')
      .eq('user_id', customer_id)
      .single();
    const payerCountry = payerProfile?.country_code || 'US';

    const { calculatePlatformFee } = await import('../_shared/platformFees.ts');
    const platformFee = calculatePlatformFee(amount, payerCountry);
    const totalAmount = amount + platformFee;

    console.log('Processing NFC payment atomically:', { customer_id, amount, venue_id, totalAmount });

    const { data: paymentResult, error: atomicError } = await supabase.rpc('process_payment_atomic', {
      p_user_id: customer_id,
      p_venue_id: venue_id,
      p_total_amount: totalAmount,
      p_platform_fee: platformFee
    });

    if (atomicError) {
      console.error('Atomic NFC payment failed:', atomicError.message);
      return new Response(
        JSON.stringify({ error: atomicError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const customerBalanceAfter = paymentResult?.user_new_balance;

    // Record transaction with audit trail
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        transaction_type: 'nfc_payment',
        from_wallet_id: customer_id,
        from_wallet_type: 'user',
        to_wallet_id: venue_id,
        to_wallet_type: 'venue',
        amount_jvc: amount,
        amount_usd: amount,
        fee_amount: platformFee,
        fee_collected: true,
        status: 'completed',
        completed_at: new Date().toISOString(),
        description: `NFC payment to venue`,
        reference_type: order_id ? 'order' : null,
        reference_id: order_id || null,
        created_by: employee_id,
        metadata: {
          payment_method: 'nfc_tap',
          employee_id,
          customer_id,
          customer_authenticated: true,
          authentication_verified_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (txError) {
      console.error('Failed to record transaction:', txError);
    }

    // Step 7: Create ledger entries
    await supabase.from('ledger_entries').insert([
      {
        transaction_id: transaction?.id,
        wallet_id: customer_id,
        wallet_type: 'user',
        entry_type: 'debit',
        amount: totalAmount,
        balance_before: customerBalanceBefore,
        balance_after: customerBalanceAfter
      },
      {
        transaction_id: transaction?.id,
        wallet_id: venue_id,
        wallet_type: 'venue',
        entry_type: 'credit',
        amount: amount,
        balance_before: venueBalanceBefore,
        balance_after: venueBalanceAfter
      }
    ]);

    // Step 8: Update order if provided
    if (order_id) {
      await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', order_id);

      await supabase
        .from('payments')
        .insert({
          order_id,
          amount,
          payment_method: 'nfc',
          status: 'completed',
          transaction_id: transaction?.id
        });
    }

    console.log('NFC payment completed successfully with customer authentication verified');

    return new Response(
      JSON.stringify({
        success: true,
        transaction_id: transaction?.id,
        amount,
        fee: platformFee,
        total: totalAmount,
        customer_balance_after: customerBalanceAfter
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('NFC payment error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
