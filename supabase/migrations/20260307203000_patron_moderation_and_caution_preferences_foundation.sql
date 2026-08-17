-- Patron moderation + caution preference foundation.
-- Extends venue-specific patron controls beyond banned-only status, with staff-only config paths.

-- 1) Extend venue patron access-control statuses and metadata.
ALTER TABLE public.venue_patron_access_controls
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_note TEXT,
  ADD COLUMN IF NOT EXISTS status_set_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS caution_category TEXT,
  ADD COLUMN IF NOT EXISTS last_trigger_type TEXT;

ALTER TABLE public.venue_patron_access_controls
  DROP CONSTRAINT IF EXISTS venue_patron_access_controls_status_valid;

ALTER TABLE public.venue_patron_access_controls
  ADD CONSTRAINT venue_patron_access_controls_status_valid
  CHECK (access_status IN ('allowed', 'deal_suppressed', 'banned', 'kicked_out_tonight'));

ALTER TABLE public.venue_patron_access_controls
  ADD CONSTRAINT venue_patron_access_controls_caution_category_valid
  CHECK (
    caution_category IS NULL
    OR caution_category IN (
      'chargeback_refund_abuse',
      'disruptive_behaviour',
      'abusive_to_staff',
      'harassment',
      'fake_id_entry_fraud',
      'prior_incident',
      'theft_or_damage',
      'other'
    )
  );

ALTER TABLE public.venue_patron_access_controls
  ADD CONSTRAINT venue_patron_access_controls_trigger_valid
  CHECK (
    last_trigger_type IS NULL
    OR last_trigger_type IN (
      'manual',
      'staff_verification',
      'checkin_attempt',
      'heading_there',
      'transaction_event',
      'order_event'
    )
  );

-- 2) Staff/owner moderation + caution permission helpers.
CREATE OR REPLACE FUNCTION public.can_manage_venue_patron_moderation(
  p_venue_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = p_venue_id
        AND v.owner_user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.employee_venue_links evl
      WHERE evl.venue_id = p_venue_id
        AND evl.user_id = p_user_id
        AND evl.is_active = true
        AND (
          COALESCE(evl.role, '') IN ('manager', 'host', 'security')
          OR COALESCE((evl.permissions->>'staff')::boolean, false) = true
          OR COALESCE((evl.permissions->>'approve_entry')::boolean, false) = true
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_venue_caution_preferences(
  p_venue_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = p_venue_id
        AND v.owner_user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.employee_venue_links evl
      WHERE evl.venue_id = p_venue_id
        AND evl.user_id = p_user_id
        AND evl.is_active = true
        AND (
          COALESCE(evl.role, '') IN ('manager', 'security')
          OR COALESCE((evl.permissions->>'staff')::boolean, false) = true
        )
    );
$$;

-- 3) Moderation event audit trail.
CREATE TABLE IF NOT EXISTS public.venue_patron_moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  caution_category TEXT,
  reason_note TEXT,
  internal_note TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status_expires_at TIMESTAMPTZ,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_patron_moderation_events_action_valid
    CHECK (
      action_type IN (
        'set_allowed',
        'set_deal_suppressed',
        'set_banned',
        'set_kicked_out_tonight'
      )
    ),
  CONSTRAINT venue_patron_moderation_events_caution_category_valid
    CHECK (
      caution_category IS NULL
      OR caution_category IN (
        'chargeback_refund_abuse',
        'disruptive_behaviour',
        'abusive_to_staff',
        'harassment',
        'fake_id_entry_fraud',
        'prior_incident',
        'theft_or_damage',
        'other'
      )
    ),
  CONSTRAINT venue_patron_moderation_events_trigger_valid
    CHECK (
      trigger_type IN (
        'manual',
        'staff_verification',
        'checkin_attempt',
        'heading_there',
        'transaction_event',
        'order_event'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_venue_patron_moderation_events_venue_created
  ON public.venue_patron_moderation_events (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_patron_moderation_events_user_created
  ON public.venue_patron_moderation_events (user_id, created_at DESC);

ALTER TABLE public.venue_patron_moderation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_patron_moderation_events_select_authorized" ON public.venue_patron_moderation_events;
CREATE POLICY "venue_patron_moderation_events_select_authorized"
ON public.venue_patron_moderation_events
FOR SELECT
USING (public.has_venue_operational_access(venue_id, auth.uid()));

DROP POLICY IF EXISTS "venue_patron_moderation_events_insert_authorized" ON public.venue_patron_moderation_events;
CREATE POLICY "venue_patron_moderation_events_insert_authorized"
ON public.venue_patron_moderation_events
FOR INSERT
WITH CHECK (public.can_manage_venue_patron_moderation(venue_id, auth.uid()));

-- 4) Venue caution alert preferences.
CREATE TABLE IF NOT EXISTS public.venue_caution_alert_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  caution_category TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  minimum_threshold INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  configured_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_caution_alert_preferences_category_valid
    CHECK (
      caution_category IN (
        'chargeback_refund_abuse',
        'disruptive_behaviour',
        'abusive_to_staff',
        'harassment',
        'fake_id_entry_fraud',
        'prior_incident',
        'theft_or_damage',
        'kicked_out_tonight',
        'banned_tonight',
        'other'
      )
    ),
  CONSTRAINT venue_caution_alert_preferences_trigger_valid
    CHECK (
      trigger_type IN (
        'staff_verification',
        'checkin_attempt',
        'heading_there',
        'transaction_event',
        'order_event'
      )
    ),
  CONSTRAINT venue_caution_alert_preferences_threshold_valid
    CHECK (minimum_threshold >= 1),
  CONSTRAINT venue_caution_alert_preferences_unique
    UNIQUE (venue_id, caution_category, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_venue_caution_alert_preferences_venue
  ON public.venue_caution_alert_preferences (venue_id, enabled);

DROP TRIGGER IF EXISTS set_venue_caution_alert_preferences_updated_at ON public.venue_caution_alert_preferences;
CREATE TRIGGER set_venue_caution_alert_preferences_updated_at
BEFORE UPDATE ON public.venue_caution_alert_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.venue_caution_alert_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_caution_alert_preferences_select_authorized" ON public.venue_caution_alert_preferences;
CREATE POLICY "venue_caution_alert_preferences_select_authorized"
ON public.venue_caution_alert_preferences
FOR SELECT
USING (public.can_manage_venue_caution_preferences(venue_id, auth.uid()));

DROP POLICY IF EXISTS "venue_caution_alert_preferences_insert_authorized" ON public.venue_caution_alert_preferences;
CREATE POLICY "venue_caution_alert_preferences_insert_authorized"
ON public.venue_caution_alert_preferences
FOR INSERT
WITH CHECK (public.can_manage_venue_caution_preferences(venue_id, auth.uid()));

DROP POLICY IF EXISTS "venue_caution_alert_preferences_update_authorized" ON public.venue_caution_alert_preferences;
CREATE POLICY "venue_caution_alert_preferences_update_authorized"
ON public.venue_caution_alert_preferences
FOR UPDATE
USING (public.can_manage_venue_caution_preferences(venue_id, auth.uid()))
WITH CHECK (public.can_manage_venue_caution_preferences(venue_id, auth.uid()));

-- 5) Moderation action RPC.
CREATE OR REPLACE FUNCTION public.apply_venue_patron_moderation_action(
  p_venue_id UUID,
  p_user_id UUID,
  p_action_type TEXT,
  p_caution_category TEXT DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL,
  p_status_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_trigger_type TEXT DEFAULT 'manual'
)
RETURNS TABLE (
  access_status TEXT,
  is_banned BOOLEAN,
  status_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  event_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_target_status TEXT;
  v_event_id UUID;
  v_effective_expires TIMESTAMPTZ := p_status_expires_at;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_manage_venue_patron_moderation(p_venue_id, v_actor) THEN
    RAISE EXCEPTION 'Not authorized to manage venue patron moderation';
  END IF;

  IF p_action_type NOT IN ('set_allowed', 'set_deal_suppressed', 'set_banned', 'set_kicked_out_tonight') THEN
    RAISE EXCEPTION 'Invalid moderation action';
  END IF;

  IF p_action_type <> 'set_allowed' AND p_caution_category IS NULL THEN
    RAISE EXCEPTION 'Caution category is required for moderation actions';
  END IF;

  v_target_status := CASE p_action_type
    WHEN 'set_allowed' THEN 'allowed'
    WHEN 'set_deal_suppressed' THEN 'deal_suppressed'
    WHEN 'set_banned' THEN 'banned'
    WHEN 'set_kicked_out_tonight' THEN 'kicked_out_tonight'
    ELSE 'allowed'
  END;

  IF v_target_status = 'kicked_out_tonight' AND v_effective_expires IS NULL THEN
    v_effective_expires := v_now + interval '12 hours';
  END IF;

  INSERT INTO public.venue_patron_access_controls (
    venue_id,
    user_id,
    access_status,
    reason,
    banned_by_user_id,
    banned_at,
    status_reason,
    status_note,
    status_set_by_user_id,
    status_set_at,
    status_expires_at,
    caution_category,
    last_trigger_type
  )
  VALUES (
    p_venue_id,
    p_user_id,
    v_target_status,
    p_reason_note,
    CASE WHEN v_target_status = 'banned' THEN v_actor ELSE NULL END,
    CASE WHEN v_target_status = 'banned' THEN v_now ELSE NULL END,
    p_reason_note,
    p_internal_note,
    v_actor,
    v_now,
    v_effective_expires,
    p_caution_category,
    p_trigger_type
  )
  ON CONFLICT (venue_id, user_id)
  DO UPDATE
  SET
    access_status = EXCLUDED.access_status,
    reason = EXCLUDED.reason,
    banned_by_user_id = EXCLUDED.banned_by_user_id,
    banned_at = EXCLUDED.banned_at,
    status_reason = EXCLUDED.status_reason,
    status_note = EXCLUDED.status_note,
    status_set_by_user_id = EXCLUDED.status_set_by_user_id,
    status_set_at = EXCLUDED.status_set_at,
    status_expires_at = EXCLUDED.status_expires_at,
    caution_category = EXCLUDED.caution_category,
    last_trigger_type = EXCLUDED.last_trigger_type,
    updated_at = now();

  INSERT INTO public.venue_patron_moderation_events (
    venue_id,
    user_id,
    action_type,
    caution_category,
    reason_note,
    internal_note,
    trigger_type,
    status_expires_at,
    actor_user_id,
    metadata
  )
  VALUES (
    p_venue_id,
    p_user_id,
    p_action_type,
    p_caution_category,
    p_reason_note,
    p_internal_note,
    p_trigger_type,
    v_effective_expires,
    v_actor,
    jsonb_build_object(
      'target_status', v_target_status,
      'actor', v_actor::text
    )
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY
  SELECT
    vpac.access_status,
    (vpac.access_status = 'banned') AS is_banned,
    vpac.status_expires_at,
    vpac.updated_at,
    v_event_id
  FROM public.venue_patron_access_controls vpac
  WHERE vpac.venue_id = p_venue_id
    AND vpac.user_id = p_user_id
  LIMIT 1;
END;
$$;

-- 6) Moderation status read RPC.
CREATE OR REPLACE FUNCTION public.get_venue_patron_moderation_status(
  p_venue_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  access_status TEXT,
  is_banned BOOLEAN,
  caution_category TEXT,
  reason TEXT,
  internal_note TEXT,
  status_set_at TIMESTAMPTZ,
  status_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_manage_venue_patron_moderation(p_venue_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view patron moderation status';
  END IF;

  RETURN QUERY
  SELECT
    vpac.access_status,
    (vpac.access_status = 'banned') AS is_banned,
    vpac.caution_category,
    vpac.status_reason,
    vpac.status_note,
    vpac.status_set_at,
    vpac.status_expires_at
  FROM public.venue_patron_access_controls vpac
  WHERE vpac.venue_id = p_venue_id
    AND vpac.user_id = p_user_id
  LIMIT 1;
END;
$$;

-- 7) Backward-compatible access-status read function.
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
    COALESCE(vpac.status_reason, vpac.reason),
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
    CASE WHEN v_status <> 'allowed' THEN v_reason ELSE NULL END,
    CASE WHEN v_status = 'banned' THEN v_banned_at ELSE NULL END;
END;
$$;

-- 8) Caution preference upsert/list RPCs.
CREATE OR REPLACE FUNCTION public.upsert_venue_caution_alert_preference(
  p_venue_id UUID,
  p_caution_category TEXT,
  p_trigger_type TEXT,
  p_minimum_threshold INTEGER DEFAULT 1,
  p_enabled BOOLEAN DEFAULT true,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  caution_category TEXT,
  trigger_type TEXT,
  minimum_threshold INTEGER,
  enabled BOOLEAN,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_manage_venue_caution_preferences(p_venue_id, v_actor) THEN
    RAISE EXCEPTION 'Not authorized to manage caution preferences';
  END IF;

  INSERT INTO public.venue_caution_alert_preferences (
    venue_id,
    caution_category,
    trigger_type,
    minimum_threshold,
    enabled,
    notes,
    configured_by_user_id
  )
  VALUES (
    p_venue_id,
    p_caution_category,
    p_trigger_type,
    p_minimum_threshold,
    p_enabled,
    p_notes,
    v_actor
  )
  ON CONFLICT (venue_id, caution_category, trigger_type)
  DO UPDATE
  SET
    minimum_threshold = EXCLUDED.minimum_threshold,
    enabled = EXCLUDED.enabled,
    notes = EXCLUDED.notes,
    configured_by_user_id = EXCLUDED.configured_by_user_id,
    updated_at = now();

  RETURN QUERY
  SELECT
    p.id,
    p.caution_category,
    p.trigger_type,
    p.minimum_threshold,
    p.enabled,
    p.updated_at
  FROM public.venue_caution_alert_preferences p
  WHERE p.venue_id = p_venue_id
    AND p.caution_category = p_caution_category
    AND p.trigger_type = p_trigger_type
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_venue_caution_alert_preferences(
  p_venue_id UUID
)
RETURNS TABLE (
  id UUID,
  caution_category TEXT,
  trigger_type TEXT,
  minimum_threshold INTEGER,
  enabled BOOLEAN,
  notes TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_manage_venue_caution_preferences(p_venue_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view caution preferences';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.caution_category,
    p.trigger_type,
    p.minimum_threshold,
    p.enabled,
    p.notes,
    p.updated_at
  FROM public.venue_caution_alert_preferences p
  WHERE p.venue_id = p_venue_id
  ORDER BY p.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_venue_patron_moderation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_venue_caution_preferences(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_venue_patron_moderation_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_venue_patron_moderation_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_venue_patron_moderation_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_patron_moderation_status(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_venue_caution_alert_preference(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_venue_caution_alert_preference(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_venue_caution_alert_preferences(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_caution_alert_preferences(UUID) TO authenticated;
