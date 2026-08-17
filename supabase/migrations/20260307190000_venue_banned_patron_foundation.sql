-- Venue-specific banned patron foundation.
-- Adds access-control status model and staff-facing checks integrated into approval flow.

CREATE TABLE IF NOT EXISTS public.venue_patron_access_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_status TEXT NOT NULL DEFAULT 'allowed',
  reason TEXT,
  banned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  banned_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_patron_access_controls_status_valid
    CHECK (access_status IN ('allowed', 'banned')),
  CONSTRAINT venue_patron_access_controls_unique_venue_user
    UNIQUE (venue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_patron_access_controls_venue_status
  ON public.venue_patron_access_controls (venue_id, access_status);

CREATE INDEX IF NOT EXISTS idx_venue_patron_access_controls_user
  ON public.venue_patron_access_controls (user_id);

DROP TRIGGER IF EXISTS set_venue_patron_access_controls_updated_at ON public.venue_patron_access_controls;
CREATE TRIGGER set_venue_patron_access_controls_updated_at
BEFORE UPDATE ON public.venue_patron_access_controls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.venue_patron_access_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_patron_access_controls_select_authorized" ON public.venue_patron_access_controls;
CREATE POLICY "venue_patron_access_controls_select_authorized"
ON public.venue_patron_access_controls
FOR SELECT
USING (
  public.has_venue_operational_access(venue_id, auth.uid())
);

DROP POLICY IF EXISTS "venue_patron_access_controls_insert_authorized" ON public.venue_patron_access_controls;
CREATE POLICY "venue_patron_access_controls_insert_authorized"
ON public.venue_patron_access_controls
FOR INSERT
WITH CHECK (
  public.can_approve_venue_entry(venue_id, auth.uid())
);

DROP POLICY IF EXISTS "venue_patron_access_controls_update_authorized" ON public.venue_patron_access_controls;
CREATE POLICY "venue_patron_access_controls_update_authorized"
ON public.venue_patron_access_controls
FOR UPDATE
USING (
  public.can_approve_venue_entry(venue_id, auth.uid())
)
WITH CHECK (
  public.can_approve_venue_entry(venue_id, auth.uid())
);

CREATE OR REPLACE FUNCTION public.get_venue_patron_access_status(
  p_venue_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  access_status TEXT,
  is_banned BOOLEAN,
  reason TEXT,
  banned_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status TEXT := 'allowed';
  v_reason TEXT := NULL;
  v_banned_at TIMESTAMPTZ := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_venue_operational_access(p_venue_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to inspect patron access status';
  END IF;

  SELECT
    vpac.access_status,
    vpac.reason,
    vpac.banned_at
  INTO v_status, v_reason, v_banned_at
  FROM public.venue_patron_access_controls vpac
  WHERE vpac.venue_id = p_venue_id
    AND vpac.user_id = p_user_id
  LIMIT 1;

  IF v_status IS NULL THEN
    v_status := 'allowed';
  END IF;

  RETURN QUERY
  SELECT
    v_status,
    (v_status = 'banned'),
    CASE WHEN v_status = 'banned' THEN v_reason ELSE NULL END,
    CASE WHEN v_status = 'banned' THEN v_banned_at ELSE NULL END;
END;
$$;

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
  v_access_status TEXT := 'allowed';
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

  IF NOT public.can_approve_venue_entry(p_venue_id, v_actor) THEN
    RAISE EXCEPTION 'Not authorized to approve venue entry';
  END IF;

  SELECT vpac.access_status
  INTO v_access_status
  FROM public.venue_patron_access_controls vpac
  WHERE vpac.venue_id = p_venue_id
    AND vpac.user_id = p_user_id
  LIMIT 1;

  IF COALESCE(v_access_status, 'allowed') = 'banned' THEN
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
      NULL,
      'manual_override',
      'denied',
      'at_venue_unverified',
      'at_venue_unverified',
      v_policy,
      v_security_mode,
      COALESCE(p_notes, 'Denied by venue access control'),
      jsonb_build_object(
        'denial_reason', 'venue_banned_status',
        'access_status', 'banned',
        'approval_actor', v_actor::text
      ),
      v_now,
      v_now
    );

    RAISE EXCEPTION 'Patron is banned from this venue';
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

REVOKE ALL ON FUNCTION public.get_venue_patron_access_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_patron_access_status(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT) TO authenticated;
