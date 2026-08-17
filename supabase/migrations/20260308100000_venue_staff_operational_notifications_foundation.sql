-- Internal venue/staff operational notifications foundation.
-- Keeps safety/ops signals internal, permission-gated, and low-noise.

CREATE TABLE IF NOT EXISTS public.venue_staff_operational_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL DEFAULT 'incident',
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_scope TEXT NOT NULL DEFAULT 'security_and_owner_admin',
  source_table TEXT,
  source_record_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  dedupe_window_seconds INTEGER NOT NULL DEFAULT 600,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_staff_operational_notifications_event_type_valid
    CHECK (
      event_type IN (
        'caution_alert_triggered',
        'banned_patron_detected',
        'kicked_out_tonight_event',
        'approval_needed',
        'moderation_action',
        'inside_proof_strong_signal',
        'incident_timeline_update',
        'security_flow_event'
      )
    ),
  CONSTRAINT venue_staff_operational_notifications_event_category_valid
    CHECK (
      event_category IN (
        'safety',
        'moderation',
        'approval',
        'confidence',
        'incident',
        'system'
      )
    ),
  CONSTRAINT venue_staff_operational_notifications_severity_valid
    CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT venue_staff_operational_notifications_delivery_scope_valid
    CHECK (delivery_scope IN ('authorized_staff', 'security_and_owner_admin', 'owner_admin')),
  CONSTRAINT venue_staff_operational_notifications_dedupe_window_valid
    CHECK (dedupe_window_seconds BETWEEN 30 AND 86400)
);

CREATE INDEX IF NOT EXISTS idx_venue_staff_operational_notifications_venue_created
  ON public.venue_staff_operational_notifications (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_staff_operational_notifications_target_created
  ON public.venue_staff_operational_notifications (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_staff_operational_notifications_type_created
  ON public.venue_staff_operational_notifications (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.venue_staff_operational_notification_reads (
  notification_id UUID NOT NULL REFERENCES public.venue_staff_operational_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_staff_operational_notification_reads_user
  ON public.venue_staff_operational_notification_reads (user_id, read_at DESC);

ALTER TABLE public.venue_staff_operational_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_staff_operational_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_venue_operational_notification_role(
  p_venue_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'none';
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN 'owner_admin';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE v.id = p_venue_id
      AND v.owner_user_id = p_user_id
  ) THEN
    RETURN 'owner_admin';
  END IF;

  SELECT evl.role, evl.permissions
  INTO v_staff
  FROM public.employee_venue_links evl
  WHERE evl.venue_id = p_venue_id
    AND evl.user_id = p_user_id
    AND evl.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF COALESCE(v_staff.role, '') = 'manager'
     OR COALESCE((v_staff.permissions->>'staff')::BOOLEAN, false) = true
  THEN
    RETURN 'owner_admin';
  END IF;

  IF COALESCE(v_staff.role, '') = 'security'
     OR COALESCE((v_staff.permissions->>'approve_entry')::BOOLEAN, false) = true
     OR COALESCE((v_staff.permissions->>'security')::BOOLEAN, false) = true
  THEN
    RETURN 'security';
  END IF;

  RETURN 'authorized_staff';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_receive_venue_operational_notification(
  p_venue_id UUID,
  p_delivery_scope TEXT,
  p_target_user_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF p_target_user_id IS NOT NULL AND p_target_user_id <> p_user_id THEN
    RETURN false;
  END IF;

  v_role := public.get_venue_operational_notification_role(p_venue_id, p_user_id);
  IF v_role = 'none' THEN
    RETURN false;
  END IF;

  IF p_delivery_scope = 'authorized_staff' THEN
    RETURN true;
  END IF;

  IF p_delivery_scope = 'security_and_owner_admin' THEN
    RETURN v_role IN ('owner_admin', 'security');
  END IF;

  IF p_delivery_scope = 'owner_admin' THEN
    RETURN v_role = 'owner_admin';
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "venue_staff_operational_notifications_select_authorized" ON public.venue_staff_operational_notifications;
CREATE POLICY "venue_staff_operational_notifications_select_authorized"
ON public.venue_staff_operational_notifications
FOR SELECT
USING (
  public.can_receive_venue_operational_notification(
    venue_id,
    delivery_scope,
    target_user_id,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "venue_staff_operational_notifications_insert_authorized" ON public.venue_staff_operational_notifications;
CREATE POLICY "venue_staff_operational_notifications_insert_authorized"
ON public.venue_staff_operational_notifications
FOR INSERT
WITH CHECK (
  public.has_venue_operational_access(venue_id, auth.uid())
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "venue_staff_operational_notification_reads_select_own" ON public.venue_staff_operational_notification_reads;
CREATE POLICY "venue_staff_operational_notification_reads_select_own"
ON public.venue_staff_operational_notification_reads
FOR SELECT
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.venue_staff_operational_notifications n
    WHERE n.id = notification_id
      AND public.can_receive_venue_operational_notification(
        n.venue_id,
        n.delivery_scope,
        n.target_user_id,
        auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "venue_staff_operational_notification_reads_insert_own" ON public.venue_staff_operational_notification_reads;
CREATE POLICY "venue_staff_operational_notification_reads_insert_own"
ON public.venue_staff_operational_notification_reads
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.venue_staff_operational_notifications n
    WHERE n.id = notification_id
      AND public.can_receive_venue_operational_notification(
        n.venue_id,
        n.delivery_scope,
        n.target_user_id,
        auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "venue_staff_operational_notification_reads_delete_own" ON public.venue_staff_operational_notification_reads;
CREATE POLICY "venue_staff_operational_notification_reads_delete_own"
ON public.venue_staff_operational_notification_reads
FOR DELETE
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_venue_staff_operational_notification(
  p_venue_id UUID,
  p_event_type TEXT,
  p_event_category TEXT DEFAULT 'incident',
  p_severity TEXT DEFAULT 'warning',
  p_title TEXT DEFAULT '',
  p_body TEXT DEFAULT '',
  p_delivery_scope TEXT DEFAULT 'security_and_owner_admin',
  p_target_user_id UUID DEFAULT NULL,
  p_source_table TEXT DEFAULT NULL,
  p_source_record_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_dedupe_key TEXT DEFAULT NULL,
  p_dedupe_window_seconds INTEGER DEFAULT 600,
  p_signal_confidence_score INTEGER DEFAULT NULL,
  p_minimum_confidence_score INTEGER DEFAULT NULL
)
RETURNS TABLE (
  notification_id UUID,
  emit_status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_existing_id UUID;
  v_new_id UUID;
  v_window_seconds INTEGER := GREATEST(30, LEAST(COALESCE(p_dedupe_window_seconds, 600), 86400));
BEGIN
  IF p_event_type NOT IN (
    'caution_alert_triggered',
    'banned_patron_detected',
    'kicked_out_tonight_event',
    'approval_needed',
    'moderation_action',
    'inside_proof_strong_signal',
    'incident_timeline_update',
    'security_flow_event'
  ) THEN
    RAISE EXCEPTION 'Invalid notification event_type';
  END IF;

  IF p_event_category NOT IN ('safety', 'moderation', 'approval', 'confidence', 'incident', 'system') THEN
    RAISE EXCEPTION 'Invalid notification event_category';
  END IF;

  IF p_severity NOT IN ('info', 'warning', 'critical') THEN
    RAISE EXCEPTION 'Invalid notification severity';
  END IF;

  IF p_delivery_scope NOT IN ('authorized_staff', 'security_and_owner_admin', 'owner_admin') THEN
    RAISE EXCEPTION 'Invalid notification delivery_scope';
  END IF;

  IF COALESCE(trim(p_title), '') = '' OR COALESCE(trim(p_body), '') = '' THEN
    RAISE EXCEPTION 'Notification title and body are required';
  END IF;

  IF v_actor IS NOT NULL
     AND NOT public.has_venue_operational_access(p_venue_id, v_actor)
     AND NOT public.is_admin(v_actor)
  THEN
    RAISE EXCEPTION 'Not authorized to create operational notification for this venue';
  END IF;

  IF p_minimum_confidence_score IS NOT NULL
     AND p_signal_confidence_score IS NOT NULL
     AND p_signal_confidence_score < p_minimum_confidence_score
  THEN
    RETURN QUERY
    SELECT NULL::UUID, 'skipped_low_confidence'::TEXT, now();
    RETURN;
  END IF;

  SELECT n.id
  INTO v_existing_id
  FROM public.venue_staff_operational_notifications n
  WHERE n.venue_id = p_venue_id
    AND n.event_type = p_event_type
    AND n.delivery_scope = p_delivery_scope
    AND n.target_user_id IS NOT DISTINCT FROM p_target_user_id
    AND (
      (p_dedupe_key IS NOT NULL AND n.dedupe_key = p_dedupe_key)
      OR (p_dedupe_key IS NULL AND n.title = p_title AND n.body = p_body)
    )
    AND n.created_at >= (now() - make_interval(secs => v_window_seconds))
  ORDER BY n.created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY
    SELECT v_existing_id, 'skipped_duplicate'::TEXT, now();
    RETURN;
  END IF;

  INSERT INTO public.venue_staff_operational_notifications (
    venue_id,
    target_user_id,
    event_type,
    event_category,
    severity,
    title,
    body,
    delivery_scope,
    source_table,
    source_record_id,
    metadata,
    dedupe_key,
    dedupe_window_seconds,
    created_by_user_id
  )
  VALUES (
    p_venue_id,
    p_target_user_id,
    p_event_type,
    p_event_category,
    p_severity,
    p_title,
    p_body,
    p_delivery_scope,
    p_source_table,
    p_source_record_id,
    COALESCE(p_metadata, '{}'::jsonb),
    p_dedupe_key,
    v_window_seconds,
    v_actor
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY
  SELECT v_new_id, 'inserted'::TEXT, now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_venue_staff_operational_notifications(
  p_venue_id UUID,
  p_include_read BOOLEAN DEFAULT true,
  p_limit INTEGER DEFAULT 50,
  p_event_category TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  event_category TEXT,
  severity TEXT,
  title TEXT,
  body TEXT,
  delivery_scope TEXT,
  source_table TEXT,
  source_record_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  is_read BOOLEAN,
  read_at TIMESTAMPTZ
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

  IF NOT public.has_venue_operational_access(p_venue_id, v_actor)
     AND NOT public.is_admin(v_actor)
  THEN
    RAISE EXCEPTION 'Not authorized to view venue operational notifications';
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.event_type,
    n.event_category,
    n.severity,
    n.title,
    n.body,
    n.delivery_scope,
    n.source_table,
    n.source_record_id,
    n.metadata,
    n.created_at,
    (r.notification_id IS NOT NULL) AS is_read,
    r.read_at
  FROM public.venue_staff_operational_notifications n
  LEFT JOIN public.venue_staff_operational_notification_reads r
    ON r.notification_id = n.id
   AND r.user_id = v_actor
  WHERE n.venue_id = p_venue_id
    AND public.can_receive_venue_operational_notification(
      n.venue_id,
      n.delivery_scope,
      n.target_user_id,
      v_actor
    )
    AND (p_event_category IS NULL OR n.event_category = p_event_category)
    AND (p_severity IS NULL OR n.severity = p_severity)
    AND (p_include_read OR r.notification_id IS NULL)
  ORDER BY n.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_venue_staff_operational_notification_read(
  p_notification_id UUID,
  p_read BOOLEAN DEFAULT true
)
RETURNS TABLE (
  notification_id UUID,
  is_read BOOLEAN,
  read_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_notification RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT n.id, n.venue_id, n.delivery_scope, n.target_user_id
  INTO v_notification
  FROM public.venue_staff_operational_notifications n
  WHERE n.id = p_notification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  IF NOT public.can_receive_venue_operational_notification(
    v_notification.venue_id,
    v_notification.delivery_scope,
    v_notification.target_user_id,
    v_actor
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this notification';
  END IF;

  IF p_read THEN
    INSERT INTO public.venue_staff_operational_notification_reads (
      notification_id,
      user_id,
      read_at
    )
    VALUES (p_notification_id, v_actor, now())
    ON CONFLICT (notification_id, user_id)
    DO UPDATE
    SET read_at = EXCLUDED.read_at;
  ELSE
    DELETE FROM public.venue_staff_operational_notification_reads r
    WHERE r.notification_id = p_notification_id
      AND r.user_id = v_actor;
  END IF;

  RETURN QUERY
  SELECT
    p_notification_id,
    EXISTS (
      SELECT 1
      FROM public.venue_staff_operational_notification_reads r
      WHERE r.notification_id = p_notification_id
        AND r.user_id = v_actor
    ),
    (
      SELECT r.read_at
      FROM public.venue_staff_operational_notification_reads r
      WHERE r.notification_id = p_notification_id
        AND r.user_id = v_actor
      LIMIT 1
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_venue_staff_operational_notifications_read(
  p_venue_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_count INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_venue_operational_access(p_venue_id, v_actor)
     AND NOT public.is_admin(v_actor)
  THEN
    RAISE EXCEPTION 'Not authorized to update notifications for this venue';
  END IF;

  INSERT INTO public.venue_staff_operational_notification_reads (
    notification_id,
    user_id,
    read_at
  )
  SELECT
    n.id,
    v_actor,
    now()
  FROM public.venue_staff_operational_notifications n
  LEFT JOIN public.venue_staff_operational_notification_reads r
    ON r.notification_id = n.id
   AND r.user_id = v_actor
  WHERE n.venue_id = p_venue_id
    AND r.notification_id IS NULL
    AND public.can_receive_venue_operational_notification(
      n.venue_id,
      n.delivery_scope,
      n.target_user_id,
      v_actor
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_emit_operational_notification_for_caution_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'new' THEN
    PERFORM public.create_venue_staff_operational_notification(
      NEW.venue_id,
      'caution_alert_triggered',
      'safety',
      'warning',
      'Caution alert triggered',
      'Caution category "' || NEW.caution_category || '" reached threshold on ' || NEW.trigger_type || '.',
      'security_and_owner_admin',
      NULL,
      'venue_caution_alert_events',
      NEW.id::TEXT,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'caution_category', NEW.caution_category,
        'trigger_type', NEW.trigger_type,
        'incident_count', NEW.incident_count,
        'minimum_threshold', NEW.minimum_threshold
      ),
      'caution_alert:' || NEW.id::TEXT,
      900,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_operational_notification_for_caution_alert ON public.venue_caution_alert_events;
CREATE TRIGGER trg_emit_operational_notification_for_caution_alert
AFTER INSERT ON public.venue_caution_alert_events
FOR EACH ROW
EXECUTE FUNCTION public.trg_emit_operational_notification_for_caution_alert();

CREATE OR REPLACE FUNCTION public.trg_emit_operational_notification_for_moderation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_type TEXT := 'moderation_action';
  v_severity TEXT := 'info';
  v_scope TEXT := 'owner_admin';
  v_title TEXT := 'Moderation action recorded';
BEGIN
  IF NEW.action_type = 'set_banned' THEN
    v_event_type := 'banned_patron_detected';
    v_severity := 'critical';
    v_scope := 'security_and_owner_admin';
    v_title := 'Banned patron action applied';
  ELSIF NEW.action_type = 'set_kicked_out_tonight' THEN
    v_event_type := 'kicked_out_tonight_event';
    v_severity := 'warning';
    v_scope := 'security_and_owner_admin';
    v_title := 'Kicked-out-tonight action applied';
  ELSIF NEW.action_type = 'set_deal_suppressed' THEN
    v_event_type := 'moderation_action';
    v_severity := 'warning';
    v_scope := 'owner_admin';
    v_title := 'Deal suppression action applied';
  ELSIF NEW.action_type = 'set_allowed' THEN
    v_event_type := 'moderation_action';
    v_severity := 'info';
    v_scope := 'owner_admin';
    v_title := 'Patron status reset to allowed';
  END IF;

  PERFORM public.create_venue_staff_operational_notification(
    NEW.venue_id,
    v_event_type,
    'moderation',
    v_severity,
    v_title,
    'Moderation action "' || NEW.action_type || '" recorded for venue patron.',
    v_scope,
    NULL,
    'venue_patron_moderation_events',
    NEW.id::TEXT,
    jsonb_build_object(
      'user_id', NEW.user_id,
      'action_type', NEW.action_type,
      'caution_category', NEW.caution_category,
      'trigger_type', NEW.trigger_type
    ),
    'moderation:' || NEW.id::TEXT,
    600,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_operational_notification_for_moderation_event ON public.venue_patron_moderation_events;
CREATE TRIGGER trg_emit_operational_notification_for_moderation_event
AFTER INSERT ON public.venue_patron_moderation_events
FOR EACH ROW
EXECUTE FUNCTION public.trg_emit_operational_notification_for_moderation_event();

CREATE OR REPLACE FUNCTION public.trg_emit_operational_notification_for_inside_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.proof_source IN ('pos_order', 'payment_request', 'venue_transaction', 'service_order')
     AND COALESCE(NEW.confidence_score, 0) >= 85
  THEN
    PERFORM public.create_venue_staff_operational_notification(
      NEW.venue_id,
      'inside_proof_strong_signal',
      'confidence',
      'info',
      'Strong inside-proof signal recorded',
      'High-confidence inside-proof event recorded for operational review.',
      'security_and_owner_admin',
      NULL,
      'venue_inside_proof_events',
      NEW.id::TEXT,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'proof_source', NEW.proof_source,
        'confidence_level', NEW.confidence_level,
        'confidence_score', NEW.confidence_score
      ),
      'inside_proof:' || NEW.venue_id::TEXT || ':' || NEW.user_id::TEXT || ':' || NEW.proof_source,
      1800,
      NEW.confidence_score,
      85
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_operational_notification_for_inside_proof ON public.venue_inside_proof_events;
CREATE TRIGGER trg_emit_operational_notification_for_inside_proof
AFTER INSERT ON public.venue_inside_proof_events
FOR EACH ROW
EXECUTE FUNCTION public.trg_emit_operational_notification_for_inside_proof();

CREATE OR REPLACE FUNCTION public.trg_emit_operational_notification_for_checkin_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.verification_state IN ('required', 'pending')
     AND NEW.checked_out_at IS NULL
  THEN
    PERFORM public.create_venue_staff_operational_notification(
      NEW.venue_id,
      'approval_needed',
      'approval',
      'warning',
      'Approval needed for entry flow',
      'A venue entry flow is waiting on staff/security review.',
      'security_and_owner_admin',
      NULL,
      'check_ins',
      NEW.id::TEXT,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'verification_state', NEW.verification_state,
        'checkin_entry_source', NEW.checkin_entry_source
      ),
      'approval_needed:' || NEW.venue_id::TEXT || ':' || NEW.user_id::TEXT,
      600,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_operational_notification_for_checkin_pending ON public.check_ins;
CREATE TRIGGER trg_emit_operational_notification_for_checkin_pending
AFTER INSERT ON public.check_ins
FOR EACH ROW
EXECUTE FUNCTION public.trg_emit_operational_notification_for_checkin_pending();

CREATE OR REPLACE FUNCTION public.trg_emit_operational_notification_for_security_denial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.action_type = 'approve_entry_denied'
     AND COALESCE(NEW.metadata->>'reason', '') = 'venue_banned_status'
  THEN
    PERFORM public.create_venue_staff_operational_notification(
      NEW.venue_id,
      'banned_patron_detected',
      'safety',
      'critical',
      'Banned patron detected in staff flow',
      'Entry approval was denied because the patron is currently banned at this venue.',
      'security_and_owner_admin',
      NULL,
      'venue_operational_action_logs',
      NEW.id::TEXT,
      NEW.metadata,
      'security_denial:' || NEW.venue_id::TEXT || ':' || NEW.target_user_id::TEXT,
      900,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_operational_notification_for_security_denial ON public.venue_operational_action_logs;
CREATE TRIGGER trg_emit_operational_notification_for_security_denial
AFTER INSERT ON public.venue_operational_action_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_emit_operational_notification_for_security_denial();

REVOKE ALL ON FUNCTION public.get_venue_operational_notification_role(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_operational_notification_role(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_receive_venue_operational_notification(UUID, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_receive_venue_operational_notification(UUID, TEXT, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_venue_staff_operational_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_venue_staff_operational_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.get_venue_staff_operational_notifications(UUID, BOOLEAN, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_staff_operational_notifications(UUID, BOOLEAN, INTEGER, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_venue_staff_operational_notification_read(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_venue_staff_operational_notification_read(UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_venue_staff_operational_notifications_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_venue_staff_operational_notifications_read(UUID) TO authenticated;
