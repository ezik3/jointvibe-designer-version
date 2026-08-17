
-- ============ Crypto Sandbox Balances ============
CREATE TABLE public.crypto_sandbox_balances (
  user_id UUID PRIMARY KEY,
  balance_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  total_granted_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  total_spent_usd NUMERIC(20,6) NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crypto_sandbox_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own sandbox balance"
  ON public.crypto_sandbox_balances FOR SELECT
  USING (auth.uid() = user_id);

-- ============ Sandbox Grant Ledger ============
CREATE TABLE public.crypto_sandbox_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID,
  granted_by UUID,
  amount_usd NUMERIC(20,6) NOT NULL,
  kind TEXT NOT NULL DEFAULT 'venue_grant', -- venue_grant | self_simulated
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crypto_sandbox_grants_user ON public.crypto_sandbox_grants(user_id, created_at DESC);
CREATE INDEX idx_crypto_sandbox_grants_venue ON public.crypto_sandbox_grants(venue_id);

ALTER TABLE public.crypto_sandbox_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own grants"
  ON public.crypto_sandbox_grants FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = granted_by);

-- ============ Helper: active test invite check ============
CREATE OR REPLACE FUNCTION public.user_has_active_test_invite(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_test_invites vti
    JOIN public.venues v ON v.id = vti.venue_id
    WHERE vti.invited_user_id = _user_id
      AND vti.status = 'accepted'
      AND COALESCE(v.venue_status, 'testing') = 'testing'
  );
$$;

-- ============ Grant Function (venue side) ============
CREATE OR REPLACE FUNCTION public.grant_crypto_sandbox_funds(
  _target_user UUID,
  _venue_id UUID,
  _amount_usd NUMERIC,
  _note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_owner BOOLEAN;
  v_locked BOOLEAN;
  v_new_balance NUMERIC;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;
  IF _amount_usd <= 0 OR _amount_usd > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  -- Caller must own the venue
  SELECT EXISTS(
    SELECT 1 FROM public.venues WHERE id = _venue_id AND owner_id = v_caller
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_venue_owner');
  END IF;

  -- Target must be an accepted tester for this venue
  IF NOT EXISTS (
    SELECT 1 FROM public.venue_test_invites
    WHERE venue_id = _venue_id
      AND invited_user_id = _target_user
      AND status = 'accepted'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_accepted_tester');
  END IF;

  -- Upsert balance row
  INSERT INTO public.crypto_sandbox_balances (user_id, balance_usd, total_granted_usd)
  VALUES (_target_user, _amount_usd, _amount_usd)
  ON CONFLICT (user_id) DO UPDATE
  SET balance_usd = crypto_sandbox_balances.balance_usd + EXCLUDED.balance_usd,
      total_granted_usd = crypto_sandbox_balances.total_granted_usd + EXCLUDED.total_granted_usd,
      updated_at = now()
  WHERE crypto_sandbox_balances.is_locked = false
  RETURNING balance_usd INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    SELECT is_locked INTO v_locked FROM public.crypto_sandbox_balances WHERE user_id = _target_user;
    IF v_locked THEN
      RETURN jsonb_build_object('success', false, 'error', 'sandbox_locked_real_deposit_made');
    END IF;
  END IF;

  INSERT INTO public.crypto_sandbox_grants (user_id, venue_id, granted_by, amount_usd, kind, note)
  VALUES (_target_user, _venue_id, v_caller, _amount_usd, 'venue_grant', _note);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- ============ Self-Simulated Deposit (tester) ============
CREATE OR REPLACE FUNCTION public.simulate_crypto_sandbox_deposit(
  _amount_usd NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_locked BOOLEAN;
  v_new_balance NUMERIC;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;
  IF _amount_usd <= 0 OR _amount_usd > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  IF NOT public.user_has_active_test_invite(v_user) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_an_active_tester');
  END IF;

  SELECT is_locked INTO v_locked FROM public.crypto_sandbox_balances WHERE user_id = v_user;
  IF v_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'sandbox_locked_real_deposit_made');
  END IF;

  INSERT INTO public.crypto_sandbox_balances (user_id, balance_usd, total_granted_usd)
  VALUES (v_user, _amount_usd, _amount_usd)
  ON CONFLICT (user_id) DO UPDATE
  SET balance_usd = crypto_sandbox_balances.balance_usd + EXCLUDED.balance_usd,
      total_granted_usd = crypto_sandbox_balances.total_granted_usd + EXCLUDED.total_granted_usd,
      updated_at = now()
  RETURNING balance_usd INTO v_new_balance;

  INSERT INTO public.crypto_sandbox_grants (user_id, granted_by, amount_usd, kind, note)
  VALUES (v_user, v_user, _amount_usd, 'self_simulated', 'tester self-deposit');

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- ============ Spend Function ============
CREATE OR REPLACE FUNCTION public.spend_crypto_sandbox_funds(
  _user_id UUID,
  _amount_usd NUMERIC,
  _ref TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_locked BOOLEAN;
BEGIN
  SELECT balance_usd, is_locked INTO v_balance, v_locked
  FROM public.crypto_sandbox_balances WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND OR v_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_sandbox_balance');
  END IF;
  IF v_balance < _amount_usd THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_sandbox_balance');
  END IF;

  UPDATE public.crypto_sandbox_balances
  SET balance_usd = balance_usd - _amount_usd,
      total_spent_usd = total_spent_usd + _amount_usd,
      updated_at = now()
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_balance - _amount_usd);
END;
$$;

-- ============ Lock Trigger on Real Crypto Deposit ============
CREATE OR REPLACE FUNCTION public.lock_crypto_sandbox_on_real_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.crypto_sandbox_balances
  SET is_locked = true,
      balance_usd = 0,
      locked_at = now(),
      locked_reason = 'real_crypto_deposit_received',
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND is_locked = false;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_sandbox_on_real_deposit
AFTER INSERT ON public.crypto_deposits
FOR EACH ROW EXECUTE FUNCTION public.lock_crypto_sandbox_on_real_deposit();

-- ============ Updated_at trigger ============
CREATE TRIGGER trg_crypto_sandbox_balances_updated
BEFORE UPDATE ON public.crypto_sandbox_balances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
