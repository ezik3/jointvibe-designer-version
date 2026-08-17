-- Update staff approval RPC to set explicit verification/source fields
-- after hybrid fallback schema foundation exists.

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

  UPDATE public.check_ins
  SET checked_out_at = v_now
  WHERE user_id = p_user_id
    AND checked_out_at IS NULL;

  INSERT INTO public.check_ins (
    user_id,
    venue_id,
    verification_state,
    checkin_entry_source,
    visibility,
    visibility_selection_status,
    visibility_selection_deadline,
    visibility_selected_at,
    visibility_selection_source,
    checked_in_at,
    checked_out_at
  )
  VALUES (
    p_user_id,
    p_venue_id,
    'approved',
    'staff_approval',
    'private',
    'pending',
    (v_now + interval '30 seconds'),
    NULL,
    'staff_approval',
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
