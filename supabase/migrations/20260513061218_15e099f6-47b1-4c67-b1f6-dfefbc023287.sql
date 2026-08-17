
-- Phase 2: XRPL Crypto Withdrawals + KYC Gate

CREATE TABLE public.crypto_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('xrpl-testnet','xrpl-mainnet')),
  destination_address TEXT NOT NULL,
  destination_tag BIGINT,
  asset TEXT NOT NULL DEFAULT 'XRP' CHECK (asset IN ('XRP','RLUSD')),
  amount_jvc NUMERIC(12, 2) NOT NULL CHECK (amount_jvc > 0),
  amount_asset NUMERIC(24, 8),
  fee_usd NUMERIC(8, 2) NOT NULL DEFAULT 0,
  fx_rate NUMERIC(18, 8),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review','approved','broadcasting','submitted','confirmed','failed','cancelled','rejected'
  )),
  tx_hash TEXT,
  ledger_index BIGINT,
  failure_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  requires_manual_review BOOLEAN NOT NULL DEFAULT false,
  pin_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  broadcast_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_crypto_wd_user ON public.crypto_withdrawals(user_id, created_at DESC);
CREATE INDEX idx_crypto_wd_status ON public.crypto_withdrawals(status) WHERE status IN ('pending_review','approved','broadcasting');

ALTER TABLE public.crypto_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own crypto withdrawals"
  ON public.crypto_withdrawals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all crypto withdrawals"
  ON public.crypto_withdrawals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update crypto withdrawals"
  ON public.crypto_withdrawals FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Available (non-locked) crypto-sourced JVC for a user, considering 7-day holds
CREATE OR REPLACE FUNCTION public.crypto_available_balance(_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_balance NUMERIC := 0;
  locked NUMERIC := 0;
BEGIN
  SELECT COALESCE(jvc_balance, 0) INTO total_balance
    FROM public.user_wallets WHERE user_id = _user_id;

  SELECT COALESCE(SUM(amount_locked), 0) INTO locked
    FROM public.crypto_withdrawal_holds
    WHERE user_id = _user_id AND NOT released AND hold_until > now();

  RETURN GREATEST(total_balance - locked, 0);
END;
$$;

-- Atomic request: validates KYC, holds, and inserts the withdrawal row
CREATE OR REPLACE FUNCTION public.request_crypto_withdrawal(
  _user_id UUID,
  _network TEXT,
  _destination_address TEXT,
  _destination_tag BIGINT,
  _asset TEXT,
  _amount_jvc NUMERIC,
  _fee_usd NUMERIC,
  _pin_verified BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kyc_ok BOOLEAN := false;
  v_avail NUMERIC := 0;
  v_id UUID;
  v_needs_review BOOLEAN := false;
BEGIN
  IF NOT _pin_verified THEN
    RAISE EXCEPTION 'PIN/biometric verification required';
  END IF;

  -- KYC: identity verified profile required
  SELECT (verification_status = 'verified' OR identity_verified = true)
    INTO v_kyc_ok
    FROM public.profiles
    WHERE user_id = _user_id;

  IF NOT COALESCE(v_kyc_ok, false) THEN
    RAISE EXCEPTION 'Identity verification required for crypto withdrawals';
  END IF;

  v_avail := public.crypto_available_balance(_user_id);
  IF _amount_jvc + _fee_usd > v_avail THEN
    RAISE EXCEPTION 'Insufficient available balance (locked under 7-day hold)';
  END IF;

  -- Manual review for large amounts
  IF _amount_jvc >= 1000 THEN
    v_needs_review := true;
  END IF;

  -- Debit wallet immediately (escrow)
  UPDATE public.user_wallets
    SET jvc_balance = jvc_balance - (_amount_jvc + _fee_usd)
    WHERE user_id = _user_id;

  INSERT INTO public.crypto_withdrawals(
    user_id, network, destination_address, destination_tag,
    asset, amount_jvc, fee_usd, status, requires_manual_review, pin_verified
  ) VALUES (
    _user_id, _network, _destination_address, _destination_tag,
    _asset, _amount_jvc, _fee_usd,
    CASE WHEN v_needs_review THEN 'pending_review' ELSE 'approved' END,
    v_needs_review, _pin_verified
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Refund on failure/rejection
CREATE OR REPLACE FUNCTION public.refund_crypto_withdrawal(_withdrawal_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w RECORD;
BEGIN
  SELECT * INTO w FROM public.crypto_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF w.status IN ('confirmed','failed','cancelled','rejected') THEN
    RETURN;
  END IF;

  UPDATE public.user_wallets
    SET jvc_balance = jvc_balance + (w.amount_jvc + w.fee_usd)
    WHERE user_id = w.user_id;

  UPDATE public.crypto_withdrawals
    SET status = 'failed', failure_reason = _reason
    WHERE id = _withdrawal_id;
END;
$$;
