-- Staff/security verified entry foundation
-- Adds minimal approval audit table + secure RPC to convert approved patrons to valid checked-in state.

CREATE TABLE IF NOT EXISTS public.venue_entry_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_id UUID REFERENCES public.check_ins(id) ON DELETE SET NULL,
  approval_source TEXT NOT NULL DEFAULT 'staff_manual',
  verification_state TEXT NOT NULL DEFAULT 'approved',
  presence_state_before TEXT,
  presence_state_after TEXT,
  entry_control_policy_snapshot TEXT,
  security_operation_mode_snapshot TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_entry_approvals
  ADD CONSTRAINT venue_entry_approvals_verification_state_valid
  CHECK (verification_state IN ('not_required', 'required', 'pending', 'approved', 'denied', 'manual_override'));

ALTER TABLE public.venue_entry_approvals
  ADD CONSTRAINT venue_entry_approvals_approval_source_valid
  CHECK (approval_source IN ('staff_manual', 'staff_scan', 'manual_override'));

ALTER TABLE public.venue_entry_approvals
  ADD CONSTRAINT venue_entry_approvals_presence_before_valid
  CHECK (
    presence_state_before IS NULL
    OR presence_state_before IN ('near_venue', 'at_venue_unverified', 'checked_in', 'checked_out')
  );

ALTER TABLE public.venue_entry_approvals
  ADD CONSTRAINT venue_entry_approvals_presence_after_valid
  CHECK (
    presence_state_after IS NULL
    OR presence_state_after IN ('near_venue', 'at_venue_unverified', 'checked_in', 'checked_out')
  );

CREATE INDEX IF NOT EXISTS idx_venue_entry_approvals_venue_created
  ON public.venue_entry_approvals (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_entry_approvals_user_created
  ON public.venue_entry_approvals (user_id, created_at DESC);

ALTER TABLE public.venue_entry_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_entry_approvals_select_policy" ON public.venue_entry_approvals;
CREATE POLICY "venue_entry_approvals_select_policy"
ON public.venue_entry_approvals
FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = venue_id
      AND v.owner_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.employee_venue_links evl
    WHERE evl.venue_id = venue_id
      AND evl.user_id = auth.uid()
      AND evl.is_active = true
  )
);

CREATE OR REPLACE FUNCTION public.approve_venue_entry_checkin(
  p_venue_id UUID,
  p_user_id UUID,
  p_visibility TEXT DEFAULT 'private',
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  checkin_id UUID,
  approval_id UUID,
  entry_control_policy TEXT,
  security_operation_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_checkin_id UUID;
  v_approval_id UUID;
  v_policy TEXT;
  v_security_mode TEXT;
  v_is_authorized BOOLEAN := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility value';
  END IF;

  SELECT
    COALESCE(v.entry_control_policy, 'open_entry'),
    COALESCE(v.security_operation_mode, 'always_active')
  INTO v_policy, v_security_mode
  FROM public.venues v
  WHERE v.id = p_venue_id;

  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'Venue not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = p_venue_id
      AND v.owner_user_id = v_actor
  )
  OR EXISTS (
    SELECT 1
    FROM public.employee_venue_links evl
    WHERE evl.venue_id = p_venue_id
      AND evl.user_id = v_actor
      AND evl.is_active = true
      AND (
        COALESCE(evl.role, '') IN ('manager', 'host', 'security')
        OR COALESCE((evl.permissions->>'staff')::boolean, false) = true
      )
  )
  INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to approve venue entry';
  END IF;

  -- Ensure a single active check-in for the user.
  UPDATE public.check_ins
  SET checked_out_at = v_now
  WHERE user_id = p_user_id
    AND checked_out_at IS NULL;

  INSERT INTO public.check_ins (
    user_id,
    venue_id,
    visibility,
    checked_in_at,
    checked_out_at
  )
  VALUES (
    p_user_id,
    p_venue_id,
    p_visibility,
    v_now,
    NULL
  )
  RETURNING id INTO v_checkin_id;

  INSERT INTO public.venue_entry_approvals (
    venue_id,
    user_id,
    approved_by_user_id,
    checkin_id,
    approval_source,
    verification_state,
    presence_state_before,
    presence_state_after,
    entry_control_policy_snapshot,
    security_operation_mode_snapshot,
    notes,
    metadata,
    approved_at,
    created_at
  )
  VALUES (
    p_venue_id,
    p_user_id,
    v_actor,
    v_checkin_id,
    'staff_manual',
    'approved',
    'at_venue_unverified',
    'checked_in',
    v_policy,
    v_security_mode,
    p_notes,
    jsonb_build_object(
      'checkin_source', 'staff_approval',
      'approval_actor', v_actor::text
    ),
    v_now,
    v_now
  )
  RETURNING id INTO v_approval_id;

  RETURN QUERY
  SELECT v_checkin_id, v_approval_id, v_policy, v_security_mode;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT) TO authenticated;

