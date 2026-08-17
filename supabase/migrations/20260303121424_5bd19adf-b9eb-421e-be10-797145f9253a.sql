
-- Part 1a: Add Stripe Connect columns to venues
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_onboarding_url TEXT,
ADD COLUMN IF NOT EXISTS stripe_onboarding_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_country TEXT;

-- Part 1b: Add Stripe Connect + customer ID columns to customer_profiles
ALTER TABLE customer_profiles
ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Part 1c: Platform treasury enhancement
ALTER TABLE platform_treasury
ADD COLUMN IF NOT EXISTS total_deposits_received NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_venue_payouts NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_user_payouts NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS owner_withdrawn NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reconciliation_at TIMESTAMPTZ;

-- Part 1d: Payout tracking table
CREATE TABLE IF NOT EXISTS stripe_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_transfer_id TEXT,
  stripe_payout_id TEXT,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('venue', 'user', 'platform')),
  recipient_id UUID NOT NULL,
  venue_id UUID,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'reversed')),
  failure_reason TEXT,
  stripe_account_id TEXT,
  withdrawal_record_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stripe_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue owners can view own payouts"
  ON stripe_payouts FOR SELECT
  USING (
    recipient_type = 'venue' AND venue_id IN (
      SELECT id FROM venues WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own payouts"
  ON stripe_payouts FOR SELECT
  USING (
    recipient_type = 'user' AND recipient_id = auth.uid()
  );

CREATE POLICY "Admins can view all payouts"
  ON stripe_payouts FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert payouts"
  ON stripe_payouts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update payouts"
  ON stripe_payouts FOR UPDATE
  USING (true);

-- Part 1e: Helper function to increment venue payouts
CREATE OR REPLACE FUNCTION public.increment_venue_payouts(p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE platform_treasury
  SET total_venue_payouts = COALESCE(total_venue_payouts, 0) + p_amount,
      updated_at = now();
END;
$$;

-- Helper function to increment user payouts
CREATE OR REPLACE FUNCTION public.increment_user_payouts(p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE platform_treasury
  SET total_user_payouts = COALESCE(total_user_payouts, 0) + p_amount,
      updated_at = now();
END;
$$;
