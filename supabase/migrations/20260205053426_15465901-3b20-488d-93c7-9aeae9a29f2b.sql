-- =====================================================
-- Dual-Rail Payment System: Database Extensions
-- Extends existing tables for gateway deposits + subsidies
-- =====================================================

-- 1. Extend user_wallets with subsidy tracking
ALTER TABLE user_wallets
ADD COLUMN IF NOT EXISTS subsidy_balance DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_balance DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subsidy_lifetime_total DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS subsidized_deposit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_deposit_bonus_claimed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Add comments for clarity
COMMENT ON COLUMN user_wallets.subsidy_balance IS 'Non-withdrawable balance from fee reimbursements (spend only at venues)';
COMMENT ON COLUMN user_wallets.pending_balance IS 'Balance held for chargeback protection (72h hold)';
COMMENT ON COLUMN user_wallets.pending_until IS 'When pending_balance becomes fully spendable';
COMMENT ON COLUMN user_wallets.subsidy_lifetime_total IS 'Total subsidy received (for cap enforcement)';
COMMENT ON COLUMN user_wallets.subsidized_deposit_count IS 'Number of deposits that received subsidy';
COMMENT ON COLUMN user_wallets.first_deposit_bonus_claimed IS 'Whether 10% first deposit bonus was claimed';

-- 2. Extend deposit_records with gateway tracking
ALTER TABLE deposit_records
ADD COLUMN IF NOT EXISTS payment_rail TEXT DEFAULT 'stripe' CHECK (payment_rail IN ('stripe', 'gateway')),
ADD COLUMN IF NOT EXISTS gateway_session_id TEXT,
ADD COLUMN IF NOT EXISTS gateway_tx_hash TEXT,
ADD COLUMN IF NOT EXISTS intended_amount DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS provider_fee DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS subsidy_credited DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_deposit_bonus DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS pending_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_first_deposit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kyc_status_at_deposit TEXT,
ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Add comments
COMMENT ON COLUMN deposit_records.payment_rail IS 'Which provider processed this deposit (stripe or gateway)';
COMMENT ON COLUMN deposit_records.intended_amount IS 'Amount user intended to deposit before fees';
COMMENT ON COLUMN deposit_records.provider_fee IS 'Fee charged by the payment provider';
COMMENT ON COLUMN deposit_records.subsidy_credited IS 'Amount JV subsidized (credited as non-withdrawable)';
COMMENT ON COLUMN deposit_records.pending_until IS 'When this deposit becomes fully spendable (chargeback protection)';

-- 3. Create country subsidy tracking table (for per-country caps)
CREATE TABLE IF NOT EXISTS country_subsidy_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_subsidy_total DECIMAL(12, 2) DEFAULT 0,
  daily_deposit_count INTEGER DEFAULT 0,
  monthly_subsidy_total DECIMAL(12, 2) DEFAULT 0,
  monthly_deposit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_country_subsidy_usage_country_date 
ON country_subsidy_usage(country_code, date);

-- RLS: Only backend can read/write
ALTER TABLE country_subsidy_usage ENABLE ROW LEVEL SECURITY;

-- 4. Create deposit_records indexes for gateway queries
CREATE INDEX IF NOT EXISTS idx_deposit_records_payment_rail 
ON deposit_records(payment_rail);

CREATE INDEX IF NOT EXISTS idx_deposit_records_gateway_session 
ON deposit_records(gateway_session_id) WHERE gateway_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_records_country 
ON deposit_records(country_code) WHERE country_code IS NOT NULL;

-- 5. Create user_wallets indexes for subsidy queries
CREATE INDEX IF NOT EXISTS idx_user_wallets_country 
ON user_wallets(country_code) WHERE country_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_wallets_pending 
ON user_wallets(user_id) WHERE pending_balance > 0;