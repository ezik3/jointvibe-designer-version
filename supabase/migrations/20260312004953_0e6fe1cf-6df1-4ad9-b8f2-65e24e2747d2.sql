
-- ============================================================
-- Fix: Deploy missing check-in RPC functions
-- The check_ins table has: id, user_id, venue_id, table_number, visibility, checked_in_at, checked_out_at
-- Ghost columns (visibility_selection_status, verification_state, checkin_entry_source) do NOT exist
-- so these functions only write to real columns.
-- ============================================================

-- 1. Idempotency key tracking table
CREATE TABLE IF NOT EXISTS public.operational_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  operation_type text NOT NULL DEFAULT 'checkin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, idempotency_key)
);

ALTER TABLE public.operational_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own idempotency keys"
  ON public.operational_idempotency_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own idempotency keys"
  ON public.operational_idempotency_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2. has_venue_operational_idempotency_key
CREATE OR REPLACE FUNCTION public.has_venue_operational_idempotency_key(
  p_idempotency_key text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operational_idempotency_keys
    WHERE user_id = auth.uid()
      AND idempotency_key = p_idempotency_key
  );
$$;

-- 3. has_recent_venue_operational_action
CREATE OR REPLACE FUNCTION public.has_recent_venue_operational_action(
  p_venue_id uuid,
  p_operation_type text DEFAULT 'checkin',
  p_window_seconds integer DEFAULT 10
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operational_idempotency_keys
    WHERE user_id = auth.uid()
      AND operation_type = p_operation_type
      AND created_at > now() - (p_window_seconds || ' seconds')::interval
  );
$$;

-- 4. checkout_current_venue_checkin
CREATE OR REPLACE FUNCTION public.checkout_current_venue_checkin(
  p_venue_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.operational_idempotency_keys
      WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key
    ) THEN
      RETURN json_build_object('status', 'already_processed', 'idempotency_key', p_idempotency_key);
    END IF;
  END IF;

  -- Checkout: set checked_out_at on active check-in at this venue
  UPDATE public.check_ins
  SET checked_out_at = now()
  WHERE user_id = v_user_id
    AND venue_id = p_venue_id
    AND checked_out_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Record idempotency key
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.operational_idempotency_keys (user_id, idempotency_key, operation_type)
    VALUES (v_user_id, p_idempotency_key, 'checkout')
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  END IF;

  RETURN json_build_object(
    'status', CASE WHEN v_updated_count > 0 THEN 'checked_out' ELSE 'no_active_checkin' END,
    'rows_updated', v_updated_count
  );
END;
$$;

-- 5. create_venue_checkin_for_user (the main RPC)
CREATE OR REPLACE FUNCTION public.create_venue_checkin_for_user(
  p_venue_id uuid,
  p_visibility text DEFAULT 'private',
  p_verification_state text DEFAULT 'not_required',
  p_checkin_entry_source text DEFAULT 'self_checkin_open_entry',
  p_idempotency_key text DEFAULT NULL,
  p_metadata json DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_checkin_id uuid;
  v_new_checkin_id uuid;
  v_venue_exists boolean;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.operational_idempotency_keys
      WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key
    ) THEN
      RETURN json_build_object('status', 'already_processed', 'idempotency_key', p_idempotency_key);
    END IF;
  END IF;

  -- Venue existence check
  SELECT EXISTS (
    SELECT 1 FROM public.venues WHERE id = p_venue_id
  ) INTO v_venue_exists;

  IF NOT v_venue_exists THEN
    RAISE EXCEPTION 'Venue not found';
  END IF;

  -- Check for existing active check-in at ANY venue
  SELECT id INTO v_existing_checkin_id
  FROM public.check_ins
  WHERE user_id = v_user_id
    AND checked_out_at IS NULL
  LIMIT 1;

  -- Auto-checkout from previous venue if checked in elsewhere
  IF v_existing_checkin_id IS NOT NULL THEN
    UPDATE public.check_ins
    SET checked_out_at = now()
    WHERE user_id = v_user_id
      AND checked_out_at IS NULL;
  END IF;

  -- Insert new check-in (only using real columns)
  INSERT INTO public.check_ins (user_id, venue_id, visibility, checked_in_at)
  VALUES (v_user_id, p_venue_id, COALESCE(p_visibility, 'private'), now())
  RETURNING id INTO v_new_checkin_id;

  -- Record idempotency key
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.operational_idempotency_keys (user_id, idempotency_key, operation_type)
    VALUES (v_user_id, p_idempotency_key, 'checkin')
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  END IF;

  RETURN json_build_object(
    'status', 'checked_in',
    'check_in_id', v_new_checkin_id,
    'venue_id', p_venue_id,
    'auto_checkout_previous', v_existing_checkin_id IS NOT NULL
  );
END;
$$;
