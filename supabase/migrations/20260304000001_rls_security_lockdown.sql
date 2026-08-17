-- =============================================================================
-- RLS SECURITY LOCKDOWN (CRIT-007 / CRIT-008)
-- Remove all "USING (true)" / "WITH CHECK (true)" write policies on financial
-- tables. Edge functions run as service_role which bypasses RLS entirely, so
-- these restrictions only affect direct client-side Supabase queries.
-- =============================================================================

-- ============ TRANSACTIONS ============
-- ANY authenticated user could previously INSERT fake transactions or UPDATE
-- existing ones (e.g. change amount, flip status to 'completed').
DROP POLICY IF EXISTS "System can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "System can update transactions" ON public.transactions;
-- Venue owners need to see their venue's transactions too
CREATE POLICY "Venue owners can view venue transactions" ON public.transactions
  FOR SELECT USING (
    (to_wallet_type = 'venue' AND to_wallet_id IN (
      SELECT id FROM public.venues WHERE owner_user_id = auth.uid()
    )) OR
    (from_wallet_type = 'venue' AND from_wallet_id IN (
      SELECT id FROM public.venues WHERE owner_user_id = auth.uid()
    ))
  );

-- ============ VENUE WALLETS ============
-- ANY authenticated user could previously INSERT a venue_wallets row.
DROP POLICY IF EXISTS "System can insert venue wallets" ON public.venue_wallets;
-- Venue owners were not covered by the existing employee_venue_links SELECT policy.
CREATE POLICY "Venue owners can view own wallet" ON public.venue_wallets
  FOR SELECT USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

-- ============ USER WALLETS ============
-- "Users can update own wallet" let any user write balance_jv_token directly.
DROP POLICY IF EXISTS "Users can update own wallet" ON public.user_wallets;

-- ============ LEDGER ENTRIES ============
DROP POLICY IF EXISTS "System can insert ledger entries" ON public.ledger_entries;

-- ============ MINT BURN AUDIT ============
DROP POLICY IF EXISTS "System can insert mint burn audit" ON public.mint_burn_audit;

-- ============ DEPOSIT RECORDS ============
-- ANY authenticated user could UPDATE any deposit (e.g. flip status to 'completed').
DROP POLICY IF EXISTS "System can update deposits" ON public.deposit_records;

-- ============ WITHDRAWAL RECORDS ============
-- ANY authenticated user could UPDATE any withdrawal.
DROP POLICY IF EXISTS "System can update withdrawals" ON public.withdrawal_records;

-- ============ PLATFORM TREASURY ============
DROP POLICY IF EXISTS "System can update treasury" ON public.platform_treasury;

-- ============ EXCHANGE RATES ============
-- "System can manage exchange rates" FOR ALL USING (true) — any user could
-- manipulate exchange rates to inflate their local balance.
DROP POLICY IF EXISTS "System can manage exchange rates" ON public.exchange_rates;

-- ============ PAYMENT REQUESTS ============
-- "Service role can update payment requests" USING (true) — any user could
-- mark any payment request as completed.
DROP POLICY IF EXISTS "Service role can update payment requests" ON public.payment_requests;

-- ============ VENUES ============
-- Only "Admins can update venues" existed — venue owners had no UPDATE policy,
-- so they couldn't save settings from the client.
CREATE POLICY "Venue owners can update own venue" ON public.venues
  FOR UPDATE USING (owner_user_id = auth.uid());

-- Venue owners can INSERT (needed during onboarding)
CREATE POLICY "Venue owners can insert venue" ON public.venues
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());
