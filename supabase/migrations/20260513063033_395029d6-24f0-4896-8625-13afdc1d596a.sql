-- Phase 4: Bridge.xyz BaaS Integration (scaffolding)
-- Stays inert without API keys; flips on automatically when secrets are configured.

-- =========================================================================
-- 1. Bridge customer mapping (one row per app user that opens KYC)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bridge_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  bridge_customer_id text UNIQUE,            -- assigned by Bridge after creation
  kyc_status text NOT NULL DEFAULT 'none',   -- none|pending|approved|rejected|requires_action
  kyc_link text,                              -- hosted KYC URL (short-lived)
  kyc_link_expires_at timestamptz,
  tos_accepted_at timestamptz,
  rejection_reason text,
  country_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bridge_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bridge customer"
  ON public.bridge_customers FOR SELECT USING (auth.uid() = user_id);

-- =========================================================================
-- 2. External accounts (user bank destinations for off-ramp payouts)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bridge_external_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bridge_external_account_id text UNIQUE,
  rail text NOT NULL,                         -- ach|wire|sepa|swift
  currency text NOT NULL,                     -- USD|EUR|GBP|...
  account_label text,                         -- e.g. "Chase ****4521"
  beneficiary_name text,
  status text NOT NULL DEFAULT 'pending',     -- pending|active|disabled
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_ext_user ON public.bridge_external_accounts(user_id);

ALTER TABLE public.bridge_external_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bridge external accounts"
  ON public.bridge_external_accounts FOR SELECT USING (auth.uid() = user_id);

-- =========================================================================
-- 3. Off-ramp transfers (crypto → fiat bank)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bridge_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bridge_transfer_id text UNIQUE,
  external_account_id uuid REFERENCES public.bridge_external_accounts(id),
  direction text NOT NULL DEFAULT 'offramp',  -- offramp|onramp
  source_asset text NOT NULL,                 -- e.g. 'RLUSD'
  source_amount numeric(20,8) NOT NULL,
  destination_currency text NOT NULL,         -- e.g. 'USD'
  destination_amount numeric(20,4),
  fee_usd numeric(12,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',     -- pending|processing|completed|failed|refunded|canceled
  failure_reason text,
  xrpl_tx_hash text,                          -- inbound leg from our hot wallet
  bank_reference text,                        -- ACH trace / wire ref
  estimated_arrival timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bridge_xfer_user ON public.bridge_transfers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bridge_xfer_status ON public.bridge_transfers(status) WHERE status IN ('pending','processing');

ALTER TABLE public.bridge_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bridge transfers"
  ON public.bridge_transfers FOR SELECT USING (auth.uid() = user_id);

-- =========================================================================
-- 4. Virtual accounts (fiat on-ramp via Bridge — IBAN/USD account that auto-mints RLUSD)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bridge_virtual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bridge_virtual_account_id text UNIQUE,
  currency text NOT NULL,                     -- USD|EUR
  account_number text,
  routing_number text,
  iban text,
  bic text,
  beneficiary_name text,
  destination_asset text NOT NULL DEFAULT 'RLUSD',
  status text NOT NULL DEFAULT 'pending',     -- pending|active|disabled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_va_user ON public.bridge_virtual_accounts(user_id);

ALTER TABLE public.bridge_virtual_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bridge virtual accounts"
  ON public.bridge_virtual_accounts FOR SELECT USING (auth.uid() = user_id);

-- =========================================================================
-- 5. Webhook event log (idempotent)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bridge_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_events_type ON public.bridge_webhook_events(event_type, received_at DESC);

ALTER TABLE public.bridge_webhook_events ENABLE ROW LEVEL SECURITY;
-- service-role only, no user policies

-- =========================================================================
-- 6. RPCs
-- =========================================================================

-- Request an off-ramp: validate KYC, create pending transfer.
-- Crypto debit happens later when broadcaster sends RLUSD to Bridge's deposit address.
CREATE OR REPLACE FUNCTION public.request_bridge_offramp(
  p_user_id uuid,
  p_external_account_id uuid,
  p_source_asset text,
  p_source_amount numeric,
  p_destination_currency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.bridge_customers%ROWTYPE;
  v_account public.bridge_external_accounts%ROWTYPE;
  v_transfer_id uuid;
BEGIN
  SELECT * INTO v_customer FROM public.bridge_customers WHERE user_id = p_user_id;
  IF NOT FOUND OR v_customer.kyc_status <> 'approved' THEN
    RAISE EXCEPTION 'kyc_required';
  END IF;

  SELECT * INTO v_account
  FROM public.bridge_external_accounts
  WHERE id = p_external_account_id AND user_id = p_user_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'external_account_invalid';
  END IF;

  IF p_source_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  INSERT INTO public.bridge_transfers (
    user_id, external_account_id, source_asset, source_amount,
    destination_currency, status, direction
  ) VALUES (
    p_user_id, p_external_account_id, p_source_asset, p_source_amount,
    p_destination_currency, 'pending', 'offramp'
  )
  RETURNING id INTO v_transfer_id;

  RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_bridge_transfer(
  p_transfer_id uuid,
  p_destination_amount numeric,
  p_bank_reference text,
  p_bridge_transfer_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bridge_transfers
     SET status = 'completed',
         destination_amount = p_destination_amount,
         bank_reference = p_bank_reference,
         bridge_transfer_id = COALESCE(bridge_transfer_id, p_bridge_transfer_id),
         completed_at = now()
   WHERE id = p_transfer_id AND status IN ('pending','processing');
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_bridge_transfer(
  p_transfer_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bridge_transfers
     SET status = 'failed',
         failure_reason = p_reason,
         completed_at = now()
   WHERE id = p_transfer_id AND status IN ('pending','processing');
END;
$$;
