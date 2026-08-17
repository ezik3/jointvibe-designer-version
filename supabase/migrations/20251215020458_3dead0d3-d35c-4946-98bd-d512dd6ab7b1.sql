
-- Venue wallets (mirrors user_wallets for venues)
CREATE TABLE IF NOT EXISTS public.venue_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  balance_jvc NUMERIC(18, 8) NOT NULL DEFAULT 0,
  balance_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pending_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  is_frozen BOOLEAN NOT NULL DEFAULT false,
  frozen_at TIMESTAMPTZ,
  frozen_by UUID,
  freeze_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id)
);

-- Transactions table (all movements)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'payment', 'refund', 'fee')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed')),
  from_wallet_type TEXT CHECK (from_wallet_type IN ('user', 'venue', 'platform')),
  from_wallet_id UUID,
  to_wallet_type TEXT CHECK (to_wallet_type IN ('user', 'venue', 'platform')),
  to_wallet_id UUID,
  amount_jvc NUMERIC(18, 8) NOT NULL,
  amount_usd NUMERIC(18, 2) NOT NULL,
  amount_local NUMERIC(18, 2),
  local_currency TEXT,
  exchange_rate NUMERIC(18, 8),
  fee_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.10,
  fee_collected BOOLEAN NOT NULL DEFAULT false,
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID
);

-- Ledger entries (double-entry accounting)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('user', 'venue', 'platform', 'fee_reserve')),
  wallet_id UUID,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount NUMERIC(18, 8) NOT NULL,
  balance_before NUMERIC(18, 8) NOT NULL,
  balance_after NUMERIC(18, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mint/Burn audit trail
CREATE TABLE IF NOT EXISTS public.mint_burn_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('mint', 'burn')),
  amount_jvc NUMERIC(18, 8) NOT NULL,
  amount_usd NUMERIC(18, 2) NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('deposit', 'withdrawal', 'manual_admin', 'refund', 'fee_collection')),
  deposit_id UUID,
  withdrawal_id UUID,
  admin_id UUID,
  admin_reason TEXT,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('user', 'venue')),
  wallet_id UUID NOT NULL,
  balance_before NUMERIC(18, 8) NOT NULL,
  balance_after NUMERIC(18, 8) NOT NULL,
  total_supply_before NUMERIC(18, 8) NOT NULL,
  total_supply_after NUMERIC(18, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deposit records
CREATE TABLE IF NOT EXISTS public.deposit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  venue_id UUID REFERENCES public.venues(id),
  deposit_method TEXT NOT NULL CHECK (deposit_method IN ('stripe_card', 'stripe_bank', 'payid', 'crypto_xrp', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  amount_local NUMERIC(18, 2) NOT NULL,
  local_currency TEXT NOT NULL DEFAULT 'USD',
  amount_usd NUMERIC(18, 2) NOT NULL,
  amount_jvc NUMERIC(18, 8) NOT NULL,
  exchange_rate NUMERIC(18, 8) NOT NULL DEFAULT 1,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_fee NUMERIC(18, 2),
  net_amount NUMERIC(18, 2),
  crypto_tx_hash TEXT,
  crypto_from_address TEXT,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Withdrawal records
CREATE TABLE IF NOT EXISTS public.withdrawal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  venue_id UUID REFERENCES public.venues(id),
  withdrawal_method TEXT NOT NULL CHECK (withdrawal_method IN ('bank_transfer', 'payid', 'crypto_xrp')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'completed', 'failed', 'cancelled', 'rejected')),
  amount_jvc NUMERIC(18, 8) NOT NULL,
  amount_usd NUMERIC(18, 2) NOT NULL,
  amount_local NUMERIC(18, 2) NOT NULL,
  local_currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(18, 8) NOT NULL DEFAULT 1,
  fee_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.10,
  net_payout NUMERIC(18, 2) NOT NULL,
  bank_account_last4 TEXT,
  bank_name TEXT,
  stripe_payout_id TEXT,
  crypto_tx_hash TEXT,
  crypto_to_address TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  failure_reason TEXT,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Platform treasury tracking
CREATE TABLE IF NOT EXISTS public.platform_treasury (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_jvc_supply NUMERIC(18, 8) NOT NULL DEFAULT 0,
  total_usd_backing NUMERIC(18, 2) NOT NULL DEFAULT 0,
  stripe_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pending_deposits NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pending_withdrawals NUMERIC(18, 2) NOT NULL DEFAULT 0,
  collected_fees NUMERIC(18, 2) NOT NULL DEFAULT 0,
  last_reconciled_at TIMESTAMPTZ,
  reconciliation_status TEXT DEFAULT 'healthy' CHECK (reconciliation_status IN ('healthy', 'warning', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exchange rates cache
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  target_currency TEXT NOT NULL,
  rate NUMERIC(18, 8) NOT NULL,
  source TEXT NOT NULL DEFAULT 'exchangerate-api',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  UNIQUE(base_currency, target_currency)
);

-- Wallet freezes (admin actions)
CREATE TABLE IF NOT EXISTS public.wallet_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('user', 'venue')),
  wallet_id UUID NOT NULL,
  frozen_by UUID NOT NULL,
  freeze_reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  unfrozen_by UUID,
  unfrozen_at TIMESTAMPTZ,
  unfreeze_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns to user_wallets if not exist
ALTER TABLE public.user_wallets ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_wallets ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
ALTER TABLE public.user_wallets ADD COLUMN IF NOT EXISTS frozen_by UUID;
ALTER TABLE public.user_wallets ADD COLUMN IF NOT EXISTS freeze_reason TEXT;
ALTER TABLE public.user_wallets ADD COLUMN IF NOT EXISTS pending_balance NUMERIC(18, 2) NOT NULL DEFAULT 0;

-- Enable RLS on all new tables
ALTER TABLE public.venue_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mint_burn_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_treasury ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Insert initial treasury record
INSERT INTO public.platform_treasury (total_jvc_supply, total_usd_backing) 
VALUES (0, 0)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_from_wallet ON public.transactions(from_wallet_type, from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_wallet ON public.transactions(to_wallet_type, to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_records_user ON public.deposit_records(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_records_status ON public.deposit_records(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_user ON public.withdrawal_records(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_status ON public.withdrawal_records(status);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet ON public.ledger_entries(wallet_type, wallet_id);
CREATE INDEX IF NOT EXISTS idx_mint_burn_wallet ON public.mint_burn_audit(wallet_type, wallet_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log(created_at DESC);
