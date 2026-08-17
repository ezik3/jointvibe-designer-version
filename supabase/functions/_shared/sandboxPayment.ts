/**
 * Shared sandbox/test-mode payment enforcement for edge functions.
 * When a venue is in 'testing' mode, payments debit test_wallet_balances
 * instead of real wallets and are recorded as test transactions.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface SandboxResult {
  is_sandbox: boolean;
  success?: boolean;
  error?: string;
  status?: number;
  response_body?: Record<string, unknown>;
}

/**
 * Check if venue is in testing mode and handle sandbox payment if so.
 * Returns { is_sandbox: false } if venue is live (caller should proceed with real payment).
 * Returns { is_sandbox: true, success: true/false, ... } if venue is testing.
 */
export async function handleSandboxPayment(
  adminClient: SupabaseClient,
  opts: {
    venue_id: string;
    customer_id: string;
    amount: number;
    order_id?: string | null;
    payment_method: string;
    description?: string;
  }
): Promise<SandboxResult> {
  // 1. Check venue status
  const { data: venueInfo } = await adminClient
    .from('venues')
    .select('venue_status, name')
    .eq('id', opts.venue_id)
    .single();

  if (!venueInfo || venueInfo.venue_status !== 'testing') {
    return { is_sandbox: false };
  }

  const venueName = venueInfo.name || 'venue';
  console.log(`[sandbox] Venue "${venueName}" is in testing mode. Enforcing sandbox payment.`);

  // 2. Check accepted test invite
  const { data: invite } = await adminClient
    .from('venue_test_invites')
    .select('id, status')
    .eq('venue_id', opts.venue_id)
    .eq('invited_user_id', opts.customer_id)
    .eq('status', 'accepted')
    .maybeSingle();

  if (!invite) {
    console.log(`[sandbox] No accepted test invite for user ${opts.customer_id} at venue ${opts.venue_id}`);
    return {
      is_sandbox: true,
      success: false,
      status: 403,
      error: 'no_test_invite',
      response_body: {
        success: false,
        error: 'no_test_invite',
        detail: 'You must be an accepted tester for this venue to make test payments.',
      },
    };
  }

  // 3. Check test wallet balance for this specific venue
  const { data: testWallet } = await adminClient
    .from('test_wallet_balances')
    .select('id, balance_cents, is_active')
    .eq('user_id', opts.customer_id)
    .eq('venue_id', opts.venue_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!testWallet) {
    return {
      is_sandbox: true,
      success: false,
      status: 400,
      error: 'no_test_balance',
      response_body: {
        success: false,
        error: 'no_test_balance',
        detail: 'No active sandbox balance found for this venue.',
      },
    };
  }

  // Amount in cents for comparison (amount comes in as dollars/JVC)
  const amountCents = Math.round(opts.amount * 100);

  if (testWallet.balance_cents < amountCents) {
    return {
      is_sandbox: true,
      success: false,
      status: 400,
      error: 'insufficient_test_balance',
      response_body: {
        success: false,
        error: 'insufficient_test_balance',
        detail: `Insufficient sandbox balance. Required: $${(amountCents / 100).toFixed(2)}, Available: $${(testWallet.balance_cents / 100).toFixed(2)}`,
        required: amountCents / 100,
        available: testWallet.balance_cents / 100,
      },
    };
  }

  // 4. Debit the test wallet
  const newBalanceCents = testWallet.balance_cents - amountCents;
  const { error: debitErr } = await adminClient
    .from('test_wallet_balances')
    .update({ balance_cents: newBalanceCents, updated_at: new Date().toISOString() })
    .eq('id', testWallet.id)
    .eq('is_active', true);

  if (debitErr) {
    console.error('[sandbox] Failed to debit test wallet:', debitErr);
    return {
      is_sandbox: true,
      success: false,
      status: 500,
      error: 'debit_failed',
      response_body: { success: false, error: 'Failed to debit sandbox balance' },
    };
  }

  console.log(`[sandbox] Debited ${amountCents} cents from test wallet. New balance: ${newBalanceCents}`);

  // 5. Mark order as test order
  if (opts.order_id) {
    await adminClient
      .from('orders')
      .update({ is_test_order: true, status: 'pending' })
      .eq('id', opts.order_id);
  }

  // 6. Record a test transaction (clearly marked)
  await adminClient.from('transactions').insert({
    transaction_type: 'test_payment',
    amount_jvc: opts.amount,
    amount_usd: opts.amount,
    fee_amount: 0,
    fee_collected: false,
    from_wallet_id: opts.customer_id,
    from_wallet_type: 'user',
    to_wallet_id: opts.venue_id,
    to_wallet_type: 'venue',
    status: 'completed',
    completed_at: new Date().toISOString(),
    description: `[SANDBOX] ${opts.description || opts.payment_method + ' payment'} to ${venueName}`,
    reference_type: opts.order_id ? 'order' : 'test',
    reference_id: opts.order_id || null,
    created_by: opts.customer_id,
    metadata: {
      is_test: true,
      test_wallet_id: testWallet.id,
      venue_id: opts.venue_id,
      balance_before_cents: testWallet.balance_cents,
      balance_after_cents: newBalanceCents,
    },
  });

  return {
    is_sandbox: true,
    success: true,
    response_body: {
      success: true,
      test_mode: true,
      amount: opts.amount,
      sandbox_balance_remaining: newBalanceCents / 100,
      venue_name: venueName,
    },
  };
}
