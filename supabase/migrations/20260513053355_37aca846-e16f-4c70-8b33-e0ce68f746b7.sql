
CREATE TABLE public.crypto_deposit_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('xrpl-testnet', 'xrpl-mainnet', 'solana-mainnet')),
  hot_wallet_address TEXT NOT NULL,
  destination_tag BIGINT NOT NULL,
  preferred_asset TEXT NOT NULL DEFAULT 'XRP',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(network, destination_tag),
  UNIQUE(user_id, network)
);

CREATE INDEX idx_crypto_addr_user ON public.crypto_deposit_addresses(user_id);
CREATE INDEX idx_crypto_addr_tag ON public.crypto_deposit_addresses(network, destination_tag);

ALTER TABLE public.crypto_deposit_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own deposit addresses" ON public.crypto_deposit_addresses FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.crypto_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  network TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  destination_tag BIGINT,
  asset_received TEXT NOT NULL,
  amount_received NUMERIC(24, 8) NOT NULL,
  usd_value_at_receipt NUMERIC(12, 2) NOT NULL,
  rlusd_swapped NUMERIC(18, 6),
  jvc_credited NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','confirming','confirmed','credited','failed','flagged')),
  pending_until TIMESTAMPTZ,
  ledger_index BIGINT,
  raw_tx JSONB,
  failure_reason TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  credited_at TIMESTAMPTZ,
  UNIQUE(network, tx_hash)
);

CREATE INDEX idx_crypto_dep_user ON public.crypto_deposits(user_id, detected_at DESC);
CREATE INDEX idx_crypto_dep_status ON public.crypto_deposits(status) WHERE status IN ('detected','confirming');
CREATE INDEX idx_crypto_dep_pending ON public.crypto_deposits(user_id, pending_until) WHERE status = 'credited';

ALTER TABLE public.crypto_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own crypto deposits" ON public.crypto_deposits FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.crypto_reserve_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_rlusd_reserve NUMERIC(18, 6) NOT NULL DEFAULT 0,
  total_jvc_minted_from_crypto NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_xrp_held NUMERIC(18, 6) NOT NULL DEFAULT 0,
  last_reconciled_at TIMESTAMPTZ,
  reserve_health_ratio NUMERIC(6, 4) GENERATED ALWAYS AS (
    CASE WHEN total_jvc_minted_from_crypto > 0
      THEN total_rlusd_reserve / total_jvc_minted_from_crypto
      ELSE 1
    END
  ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.crypto_reserve_state (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.crypto_reserve_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crypto_withdrawal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deposit_id UUID REFERENCES public.crypto_deposits(id) ON DELETE CASCADE,
  amount_locked NUMERIC(12, 2) NOT NULL,
  hold_until TIMESTAMPTZ NOT NULL,
  released BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crypto_holds_user ON public.crypto_withdrawal_holds(user_id) WHERE NOT released;

ALTER TABLE public.crypto_withdrawal_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own crypto holds" ON public.crypto_withdrawal_holds FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS crypto_lifetime_deposit_usd NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crypto_pending_balance NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_crypto_deposit_at TIMESTAMPTZ;

CREATE SEQUENCE IF NOT EXISTS public.crypto_destination_tag_seq START WITH 100001 INCREMENT BY 1 MAXVALUE 4294967295;
