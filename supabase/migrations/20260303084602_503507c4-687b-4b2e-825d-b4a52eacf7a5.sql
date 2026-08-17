
-- Fix 3: Atomic wallet balance functions to prevent race conditions

-- Atomic debit: returns new balance or raises exception
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE user_wallets
  SET balance_jv_token = balance_jv_token - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance_jv_token >= p_amount
  RETURNING balance_jv_token INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Atomic credit: returns new balance
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE user_wallets
  SET balance_jv_token = balance_jv_token + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance_jv_token INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Atomic venue credit: returns new balance
CREATE OR REPLACE FUNCTION public.credit_venue_wallet(
  p_venue_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE venue_wallets
  SET balance_jvc = balance_jvc + p_amount,
      updated_at = now()
  WHERE venue_id = p_venue_id
  RETURNING balance_jvc INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venue wallet not found';
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Atomic full payment: debit user + credit venue + platform fee in one transaction
CREATE OR REPLACE FUNCTION public.process_payment_atomic(
  p_user_id UUID,
  p_venue_id UUID,
  p_total_amount NUMERIC,
  p_platform_fee NUMERIC DEFAULT 0.10
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_new_balance NUMERIC;
  v_venue_new_balance NUMERIC;
  v_venue_credit NUMERIC;
BEGIN
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_venue_credit := p_total_amount - p_platform_fee;

  -- Debit customer (atomic: only succeeds if balance sufficient)
  UPDATE user_wallets
  SET balance_jv_token = balance_jv_token - p_total_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance_jv_token >= p_total_amount
  RETURNING balance_jv_token INTO v_user_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Credit venue (minus platform fee)
  UPDATE venue_wallets
  SET balance_jvc = balance_jvc + v_venue_credit,
      updated_at = now()
  WHERE venue_id = p_venue_id
  RETURNING balance_jvc INTO v_venue_new_balance;

  IF NOT FOUND THEN
    -- Rollback: re-credit the user since venue wallet doesn't exist
    UPDATE user_wallets
    SET balance_jv_token = balance_jv_token + p_total_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    RAISE EXCEPTION 'Venue wallet not found';
  END IF;

  -- Credit platform treasury
  UPDATE platform_treasury
  SET collected_fees = collected_fees + p_platform_fee,
      updated_at = now();

  RETURN json_build_object(
    'user_new_balance', v_user_new_balance,
    'venue_new_balance', v_venue_new_balance,
    'amount_charged', p_total_amount,
    'platform_fee', p_platform_fee,
    'venue_received', v_venue_credit
  );
END;
$$;
