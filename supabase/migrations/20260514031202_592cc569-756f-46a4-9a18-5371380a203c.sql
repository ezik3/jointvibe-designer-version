-- Extend crypto sandbox to Tier C/D end-users (no venue invite required) until first real on-chain deposit.
-- Removes the $1000 amount cap (parity with fiat which has no per-deposit cap).
-- Adds wipe_user_crypto_sandbox() called by the XRPL monitor on the user's first real credited deposit.

CREATE OR REPLACE FUNCTION public.simulate_crypto_sandbox_deposit(_amount_usd NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_locked BOOLEAN;
  v_new_balance NUMERIC;
  v_has_invite BOOLEAN;
  v_has_real_deposit BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;
  IF _amount_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  -- Eligibility: active venue tester OR end-user who has not yet made a real crypto deposit.
  v_has_invite := public.user_has_active_test_invite(v_user);
  SELECT EXISTS (
    SELECT 1 FROM public.crypto_deposits
    WHERE user_id = v_user AND status IN ('credited','pending')
  ) INTO v_has_real_deposit;

  IF NOT v_has_invite AND v_has_real_deposit THEN
    RETURN jsonb_build_object('success', false, 'error', 'real_deposit_exists');
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
  VALUES (v_user, v_user, _amount_usd, 'self_simulated',
          CASE WHEN v_has_invite THEN 'tester self-deposit' ELSE 'enduser sandbox self-deposit' END);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- Wipe + lock a user's sandbox after their first real credited crypto deposit.
CREATE OR REPLACE FUNCTION public.wipe_user_crypto_sandbox(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prior NUMERIC;
BEGIN
  SELECT balance_usd INTO v_prior FROM public.crypto_sandbox_balances WHERE user_id = _user_id;
  IF v_prior IS NULL THEN RETURN; END IF;

  UPDATE public.crypto_sandbox_balances
  SET balance_usd = 0,
      is_locked = TRUE,
      locked_at = COALESCE(locked_at, now()),
      locked_reason = COALESCE(locked_reason, 'real_crypto_deposit_received'),
      updated_at = now()
  WHERE user_id = _user_id;

  IF v_prior > 0 THEN
    INSERT INTO public.crypto_sandbox_grants (user_id, granted_by, amount_usd, kind, note)
    VALUES (_user_id, _user_id, -v_prior, 'self_simulated', 'wiped on first real crypto deposit');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wipe_user_crypto_sandbox(UUID) TO service_role;