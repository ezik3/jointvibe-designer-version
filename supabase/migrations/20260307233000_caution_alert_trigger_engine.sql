-- Venue caution alert trigger engine.
-- Evaluates venue-configured caution thresholds on meaningful operational events only.

CREATE TABLE IF NOT EXISTS public.venue_caution_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caution_category TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  incident_count INTEGER NOT NULL,
  minimum_threshold INTEGER NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'rule_engine',
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  idempotency_key TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledgement_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_caution_alert_events_category_valid
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
  CONSTRAINT venue_caution_alert_events_trigger_valid
    CHECK (
      trigger_type IN (
        'staff_verification',
        'checkin_attempt',
        'heading_there',
        'transaction_event',
        'order_event'
      )
    ),
  CONSTRAINT venue_caution_alert_events_status_valid
    CHECK (status IN ('new', 'acknowledged', 'resolved')),
  CONSTRAINT venue_caution_alert_events_threshold_valid
    CHECK (incident_count >= 0 AND minimum_threshold >= 1)
);

CREATE INDEX IF NOT EXISTS idx_venue_caution_alert_events_venue_status_time
  ON public.venue_caution_alert_events (venue_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_caution_alert_events_user_time
  ON public.venue_caution_alert_events (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_caution_alert_events_idempotency
  ON public.venue_caution_alert_events (venue_id, user_id, caution_category, trigger_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.venue_caution_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_caution_alert_events_select_authorized" ON public.venue_caution_alert_events;
CREATE POLICY "venue_caution_alert_events_select_authorized"
ON public.venue_caution_alert_events
FOR SELECT
USING (
  public.has_venue_operational_access(venue_id, auth.uid())
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "venue_caution_alert_events_update_authorized" ON public.venue_caution_alert_events;
CREATE POLICY "venue_caution_alert_events_update_authorized"
ON public.venue_caution_alert_events
FOR UPDATE
USING (public.can_manage_venue_patron_moderation(venue_id, auth.uid()))
WITH CHECK (public.can_manage_venue_patron_moderation(venue_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.get_venue_caution_incident_count(
  p_venue_id UUID,
  p_user_id UUID,
  p_caution_category TEXT,
  p_as_of TIMESTAMPTZ DEFAULT now()
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now TIMESTAMPTZ := COALESCE(p_as_of, now());
  v_history_count INTEGER := 0;
  v_active_count INTEGER := 0;
BEGIN
  IF p_caution_category = 'banned_tonight' THEN
    SELECT COUNT(*)
    INTO v_history_count
    FROM public.venue_patron_moderation_events e
    WHERE e.venue_id = p_venue_id
      AND e.user_id = p_user_id
      AND e.action_type = 'set_banned'
      AND e.created_at >= (v_now - interval '18 hours');

    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.venue_patron_access_controls vpac
        WHERE vpac.venue_id = p_venue_id
          AND vpac.user_id = p_user_id
          AND vpac.access_status = 'banned'
          AND (vpac.status_expires_at IS NULL OR vpac.status_expires_at > v_now)
      ) THEN 1
      ELSE 0
    END
    INTO v_active_count;

    RETURN v_history_count + v_active_count;
  END IF;

  IF p_caution_category = 'kicked_out_tonight' THEN
    SELECT COUNT(*)
    INTO v_history_count
    FROM public.venue_patron_moderation_events e
    WHERE e.venue_id = p_venue_id
      AND e.user_id = p_user_id
      AND e.action_type = 'set_kicked_out_tonight'
      AND e.created_at >= (v_now - interval '18 hours');

    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.venue_patron_access_controls vpac
        WHERE vpac.venue_id = p_venue_id
          AND vpac.user_id = p_user_id
          AND vpac.access_status = 'kicked_out_tonight'
          AND (vpac.status_expires_at IS NULL OR vpac.status_expires_at > v_now)
      ) THEN 1
      ELSE 0
    END
    INTO v_active_count;

    RETURN v_history_count + v_active_count;
  END IF;

  SELECT COUNT(*)
  INTO v_history_count
  FROM public.venue_patron_moderation_events e
  WHERE e.venue_id = p_venue_id
    AND e.user_id = p_user_id
    AND e.caution_category = p_caution_category
    AND e.action_type IN ('set_deal_suppressed', 'set_banned', 'set_kicked_out_tonight')
    AND e.created_at >= (v_now - interval '90 days');

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.venue_patron_access_controls vpac
      WHERE vpac.venue_id = p_venue_id
        AND vpac.user_id = p_user_id
        AND vpac.caution_category = p_caution_category
        AND vpac.access_status IN ('deal_suppressed', 'banned', 'kicked_out_tonight')
        AND (vpac.status_expires_at IS NULL OR vpac.status_expires_at > v_now)
    ) THEN 1
    ELSE 0
  END
  INTO v_active_count;

  RETURN v_history_count + v_active_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_venue_caution_alert_rules(
  p_venue_id UUID,
  p_user_id UUID,
  p_trigger_type TEXT,
  p_event_source TEXT DEFAULT 'operational_event',
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  alert_id UUID,
  caution_category TEXT,
  incident_count INTEGER,
  minimum_threshold INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pref RECORD;
  v_actor UUID := auth.uid();
  v_incident_count INTEGER;
  v_alert_id UUID;
BEGIN
  IF p_trigger_type NOT IN ('staff_verification', 'checkin_attempt', 'heading_there', 'transaction_event', 'order_event') THEN
    RAISE EXCEPTION 'Invalid caution trigger type';
  END IF;

  IF v_actor IS NOT NULL
     AND v_actor <> p_user_id
     AND NOT public.has_venue_operational_access(p_venue_id, v_actor)
     AND NOT public.is_admin(v_actor)
  THEN
    RAISE EXCEPTION 'Not authorized to evaluate caution rules for this user';
  END IF;

  FOR v_pref IN
    SELECT
      p.caution_category,
      p.minimum_threshold
    FROM public.venue_caution_alert_preferences p
    WHERE p.venue_id = p_venue_id
      AND p.enabled = true
      AND p.trigger_type = p_trigger_type
  LOOP
    v_incident_count := public.get_venue_caution_incident_count(
      p_venue_id,
      p_user_id,
      v_pref.caution_category,
      now()
    );

    IF v_incident_count < v_pref.minimum_threshold THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.venue_caution_alert_events e
      WHERE e.venue_id = p_venue_id
        AND e.user_id = p_user_id
        AND e.caution_category = v_pref.caution_category
        AND e.trigger_type = p_trigger_type
        AND e.status IN ('new', 'acknowledged')
        AND e.created_at >= (now() - interval '15 minutes')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.venue_caution_alert_events (
      venue_id,
      user_id,
      caution_category,
      trigger_type,
      incident_count,
      minimum_threshold,
      event_source,
      event_metadata,
      idempotency_key,
      created_by_user_id
    )
    VALUES (
      p_venue_id,
      p_user_id,
      v_pref.caution_category,
      p_trigger_type,
      v_incident_count,
      v_pref.minimum_threshold,
      COALESCE(p_event_source, 'operational_event'),
      COALESCE(p_metadata, '{}'::jsonb),
      p_idempotency_key,
      v_actor
    )
    ON CONFLICT (venue_id, user_id, caution_category, trigger_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_alert_id;

    IF v_alert_id IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM public.log_venue_operational_action(
      'emit_caution_alert',
      p_venue_id,
      p_user_id,
      v_actor,
      'rule_engine',
      p_idempotency_key,
      jsonb_build_object(
        'trigger_type', p_trigger_type,
        'caution_category', v_pref.caution_category,
        'incident_count', v_incident_count,
        'minimum_threshold', v_pref.minimum_threshold
      ) || COALESCE(p_metadata, '{}'::jsonb)
    );

    RETURN QUERY
    SELECT
      e.id,
      e.caution_category,
      e.incident_count,
      e.minimum_threshold,
      e.status,
      e.created_at
    FROM public.venue_caution_alert_events e
    WHERE e.id = v_alert_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_venue_caution_alert_events(
  p_venue_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  caution_category TEXT,
  trigger_type TEXT,
  incident_count INTEGER,
  minimum_threshold INTEGER,
  status TEXT,
  event_source TEXT,
  event_metadata JSONB,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_venue_operational_access(p_venue_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view caution alerts';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.user_id,
    cp.display_name,
    cp.avatar_url,
    e.caution_category,
    e.trigger_type,
    e.incident_count,
    e.minimum_threshold,
    e.status,
    e.event_source,
    e.event_metadata,
    e.acknowledged_at,
    e.created_at
  FROM public.venue_caution_alert_events e
  LEFT JOIN public.customer_profiles cp
    ON cp.user_id = e.user_id
  WHERE e.venue_id = p_venue_id
    AND (p_status IS NULL OR e.status = p_status)
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_venue_caution_alert_event(
  p_alert_id UUID,
  p_acknowledgement_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  status TEXT,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_venue_id UUID;
  v_target_user_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.venue_id, e.user_id
  INTO v_venue_id, v_target_user_id
  FROM public.venue_caution_alert_events e
  WHERE e.id = p_alert_id;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Alert event not found';
  END IF;

  IF NOT public.can_manage_venue_patron_moderation(v_venue_id, v_actor) THEN
    RAISE EXCEPTION 'Not authorized to acknowledge caution alerts';
  END IF;

  UPDATE public.venue_caution_alert_events
  SET
    status = 'acknowledged',
    acknowledged_at = now(),
    acknowledged_by_user_id = v_actor,
    acknowledgement_note = p_acknowledgement_note
  WHERE id = p_alert_id
    AND status = 'new';

  PERFORM public.log_venue_operational_action(
    'acknowledge_caution_alert',
    v_venue_id,
    v_target_user_id,
    v_actor,
    'rule_engine',
    p_alert_id::text,
    jsonb_build_object('note', p_acknowledgement_note)
  );

  RETURN QUERY
  SELECT
    e.id,
    e.status,
    e.acknowledged_at,
    e.acknowledged_by_user_id
  FROM public.venue_caution_alert_events e
  WHERE e.id = p_alert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_evaluate_caution_on_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.venue_id IS NOT NULL
     AND NEW.user_id IS NOT NULL
     AND NEW.checked_out_at IS NULL
  THEN
    PERFORM public.evaluate_venue_caution_alert_rules(
      NEW.venue_id,
      NEW.user_id,
      'checkin_attempt',
      'checkin_write',
      'checkin:' || NEW.id::text,
      jsonb_build_object(
        'checkin_id', NEW.id,
        'entry_source', NEW.checkin_entry_source,
        'verification_state', NEW.verification_state
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_caution_on_checkin ON public.check_ins;
CREATE TRIGGER trg_evaluate_caution_on_checkin
AFTER INSERT ON public.check_ins
FOR EACH ROW
EXECUTE FUNCTION public.trg_evaluate_caution_on_checkin();

CREATE OR REPLACE FUNCTION public.trg_evaluate_caution_on_heading_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_idempotency_key TEXT;
BEGIN
  IF NEW.signal_type = 'heading_there'
     AND NEW.active = true
     AND NEW.expires_at > now()
  THEN
    v_idempotency_key := 'heading:' || NEW.id::text || ':' || EXTRACT(EPOCH FROM NEW.set_at)::BIGINT::text;

    PERFORM public.evaluate_venue_caution_alert_rules(
      NEW.venue_id,
      NEW.user_id,
      'heading_there',
      'intent_signal',
      v_idempotency_key,
      jsonb_build_object(
        'signal_id', NEW.id,
        'signal_type', NEW.signal_type,
        'source', NEW.source,
        'expires_at', NEW.expires_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_caution_on_heading_signal ON public.venue_interest_signals;
CREATE TRIGGER trg_evaluate_caution_on_heading_signal
AFTER INSERT OR UPDATE OF signal_type, active, expires_at, set_at ON public.venue_interest_signals
FOR EACH ROW
EXECUTE FUNCTION public.trg_evaluate_caution_on_heading_signal();

CREATE OR REPLACE FUNCTION public.trg_evaluate_caution_on_staff_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.venue_id IS NOT NULL
     AND NEW.user_id IS NOT NULL
  THEN
    PERFORM public.evaluate_venue_caution_alert_rules(
      NEW.venue_id,
      NEW.user_id,
      'staff_verification',
      'entry_approval',
      'staff_verification:' || NEW.id::text,
      jsonb_build_object(
        'approval_id', NEW.id,
        'verification_state', NEW.verification_state,
        'approval_source', NEW.approval_source
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_caution_on_staff_verification ON public.venue_entry_approvals;
CREATE TRIGGER trg_evaluate_caution_on_staff_verification
AFTER INSERT ON public.venue_entry_approvals
FOR EACH ROW
EXECUTE FUNCTION public.trg_evaluate_caution_on_staff_verification();

CREATE OR REPLACE FUNCTION public.trg_evaluate_caution_on_inside_proof()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.proof_source IN ('pos_order', 'payment_request', 'venue_transaction', 'service_order')
     AND NEW.venue_id IS NOT NULL
     AND NEW.user_id IS NOT NULL
  THEN
    PERFORM public.evaluate_venue_caution_alert_rules(
      NEW.venue_id,
      NEW.user_id,
      'transaction_event',
      'inside_proof',
      'inside_proof:' || NEW.id::text,
      jsonb_build_object(
        'inside_proof_event_id', NEW.id,
        'proof_source', NEW.proof_source,
        'confidence_level', NEW.confidence_level,
        'confidence_score', NEW.confidence_score
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_caution_on_inside_proof ON public.venue_inside_proof_events;
CREATE TRIGGER trg_evaluate_caution_on_inside_proof
AFTER INSERT OR UPDATE OF proof_source, confidence_level, confidence_score, event_at ON public.venue_inside_proof_events
FOR EACH ROW
EXECUTE FUNCTION public.trg_evaluate_caution_on_inside_proof();

REVOKE ALL ON FUNCTION public.get_venue_caution_incident_count(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_caution_incident_count(UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.evaluate_venue_caution_alert_rules(UUID, UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_venue_caution_alert_rules(UUID, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.get_venue_caution_alert_events(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_caution_alert_events(UUID, INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.acknowledge_venue_caution_alert_event(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_venue_caution_alert_event(UUID, TEXT) TO authenticated;
