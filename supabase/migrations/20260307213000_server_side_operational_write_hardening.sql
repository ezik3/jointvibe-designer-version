-- Server-side operational write hardening foundation.
-- Centralizes sensitive venue-operation writes behind secured RPCs with cooldown + audit logging.

CREATE TABLE IF NOT EXISTS public.venue_operational_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_source TEXT NOT NULL DEFAULT 'rpc',
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_operational_action_logs_venue_action_time
  ON public.venue_operational_action_logs (venue_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_operational_action_logs_target_action_time
  ON public.venue_operational_action_logs (target_user_id, action_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_operational_action_logs_idempotency
  ON public.venue_operational_action_logs (action_type, venue_id, target_user_id, actor_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.venue_operational_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_operational_action_logs_select_policy" ON public.venue_operational_action_logs;
CREATE POLICY "venue_operational_action_logs_select_policy"
ON public.venue_operational_action_logs
FOR SELECT
USING (
  public.has_venue_operational_access(venue_id, auth.uid())
  OR public.is_admin(auth.uid())
);

CREATE OR REPLACE FUNCTION public.has_recent_venue_operational_action(
  p_action_type TEXT,
  p_venue_id UUID,
  p_target_user_id UUID,
  p_actor_user_id UUID,
  p_cooldown_seconds INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_operational_action_logs l
    WHERE l.action_type = p_action_type
      AND l.venue_id IS NOT DISTINCT FROM p_venue_id
      AND l.target_user_id IS NOT DISTINCT FROM p_target_user_id
      AND l.actor_user_id IS NOT DISTINCT FROM p_actor_user_id
      AND l.created_at >= (now() - make_interval(secs => GREATEST(p_cooldown_seconds, 0)))
  );
$$;

CREATE OR REPLACE FUNCTION public.log_venue_operational_action(
  p_action_type TEXT,
  p_venue_id UUID,
  p_target_user_id UUID,
  p_actor_user_id UUID,
  p_action_source TEXT DEFAULT 'rpc',
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows_inserted INTEGER := 0;
BEGIN
  INSERT INTO public.venue_operational_action_logs (
    action_type,
    venue_id,
    target_user_id,
    actor_user_id,
    action_source,
    idempotency_key,
    metadata
  )
  VALUES (
    p_action_type,
    p_venue_id,
    p_target_user_id,
    p_actor_user_id,
    COALESCE(p_action_source, 'rpc'),
    p_idempotency_key,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (action_type, venue_id, target_user_id, actor_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  RETURN v_rows_inserted > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_venue_operational_idempotency_key(
  p_action_type TEXT,
  p_venue_id UUID,
  p_target_user_id UUID,
  p_actor_user_id UUID,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_operational_action_logs l
    WHERE l.action_type = p_action_type
      AND l.venue_id IS NOT DISTINCT FROM p_venue_id
      AND l.target_user_id IS NOT DISTINCT FROM p_target_user_id
      AND l.actor_user_id IS NOT DISTINCT FROM p_actor_user_id
      AND l.idempotency_key = p_idempotency_key
  );
$$;

CREATE OR REPLACE FUNCTION public.create_venue_checkin_for_user(
  p_venue_id UUID,
  p_visibility TEXT DEFAULT 'private',
  p_verification_state TEXT DEFAULT 'not_required',
  p_checkin_entry_source TEXT DEFAULT 'self_checkin_open_entry',
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  checkin_id UUID,
  checked_in_at TIMESTAMPTZ,
  visibility TEXT,
  visibility_selection_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_checkin_id UUID;
  v_policy TEXT;
  v_is_idempotent_replay BOOLEAN := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility value';
  END IF;

  IF p_visibility <> 'private' THEN
    RAISE EXCEPTION 'Initial check-in visibility must be private';
  END IF;

  IF p_verification_state NOT IN ('not_required', 'required', 'pending', 'approved', 'denied', 'manual_override', 'fallback_unverified', 'legacy_unknown') THEN
    RAISE EXCEPTION 'Invalid verification state';
  END IF;

  IF p_checkin_entry_source NOT IN ('self_checkin_open_entry', 'staff_approval', 'hybrid_fallback', 'legacy') THEN
    RAISE EXCEPTION 'Invalid check-in entry source';
  END IF;

  SELECT COALESCE(v.entry_control_policy, 'open_entry')
  INTO v_policy
  FROM public.venues v
  WHERE v.id = p_venue_id;

  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'Venue not found';
  END IF;

  IF p_checkin_entry_source = 'staff_approval' OR p_verification_state = 'approved' THEN
    RAISE EXCEPTION 'Staff-approved check-in must use staff approval RPC';
  END IF;

  IF v_policy = 'open_entry' THEN
    IF p_checkin_entry_source <> 'self_checkin_open_entry' OR p_verification_state <> 'not_required' THEN
      RAISE EXCEPTION 'Open-entry check-in requires self_checkin_open_entry/not_required';
    END IF;
  ELSIF v_policy = 'security_required' THEN
    RAISE EXCEPTION 'Security-required venues need staff approval for check-in';
  ELSIF v_policy = 'hybrid_entry' THEN
    IF p_checkin_entry_source <> 'hybrid_fallback' OR p_verification_state <> 'fallback_unverified' THEN
      RAISE EXCEPTION 'Hybrid-entry self check-in requires hybrid_fallback/fallback_unverified';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_is_idempotent_replay := public.has_venue_operational_idempotency_key(
      'create_checkin',
      p_venue_id,
      v_actor,
      v_actor,
      p_idempotency_key
    );
  END IF;

  IF v_is_idempotent_replay THEN
    RETURN QUERY
    SELECT ci.id, ci.checked_in_at, ci.visibility, ci.visibility_selection_status
    FROM public.check_ins ci
    WHERE ci.user_id = v_actor
      AND ci.venue_id = p_venue_id
      AND ci.checked_out_at IS NULL
    ORDER BY ci.checked_in_at DESC
    LIMIT 1;
    RETURN;
  END IF;

  IF public.has_recent_venue_operational_action(
    'create_checkin',
    p_venue_id,
    v_actor,
    v_actor,
    5
  ) THEN
    SELECT ci.id, ci.checked_in_at, ci.visibility, ci.visibility_selection_status
    INTO v_checkin_id, checked_in_at, visibility, visibility_selection_status
    FROM public.check_ins ci
    WHERE ci.user_id = v_actor
      AND ci.venue_id = p_venue_id
      AND ci.checked_out_at IS NULL
    ORDER BY ci.checked_in_at DESC
    LIMIT 1;

    IF v_checkin_id IS NOT NULL THEN
      RETURN QUERY SELECT v_checkin_id, checked_in_at, visibility, visibility_selection_status;
      RETURN;
    END IF;
  END IF;

  UPDATE public.check_ins
  SET checked_out_at = v_now
  WHERE user_id = v_actor
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
    checked_in_at
  )
  VALUES (
    v_actor,
    p_venue_id,
    p_verification_state,
    p_checkin_entry_source,
    p_visibility,
    'pending',
    (v_now + interval '30 seconds'),
    NULL,
    p_checkin_entry_source,
    v_now
  )
  RETURNING id INTO v_checkin_id;

  PERFORM public.log_venue_operational_action(
    'create_checkin',
    p_venue_id,
    v_actor,
    v_actor,
    'rpc',
    p_idempotency_key,
    jsonb_build_object(
      'verification_state', p_verification_state,
      'entry_source', p_checkin_entry_source,
      'policy_snapshot', v_policy
    ) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN QUERY
  SELECT ci.id, ci.checked_in_at, ci.visibility, ci.visibility_selection_status
  FROM public.check_ins ci
  WHERE ci.id = v_checkin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_current_venue_checkin(
  p_venue_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  checked_out_count INTEGER,
  checked_out_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_count INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND public.has_venue_operational_idempotency_key(
       'checkout_checkin',
       p_venue_id,
       v_actor,
       v_actor,
       p_idempotency_key
     )
  THEN
    RETURN QUERY SELECT 0, v_now;
    RETURN;
  END IF;

  UPDATE public.check_ins
  SET checked_out_at = v_now
  WHERE user_id = v_actor
    AND checked_out_at IS NULL
    AND (p_venue_id IS NULL OR venue_id = p_venue_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM public.log_venue_operational_action(
      'checkout_checkin',
      p_venue_id,
      v_actor,
      v_actor,
      'rpc',
      p_idempotency_key,
      COALESCE(p_metadata, '{}'::jsonb)
    );
  END IF;

  RETURN QUERY SELECT v_count, v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_checkin_visibility_selection(
  p_checkin_id UUID,
  p_visibility TEXT,
  p_visibility_source TEXT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  checkin_id UUID,
  visibility TEXT,
  visibility_selection_status TEXT,
  visibility_selected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_venue_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Invalid visibility value';
  END IF;

  IF p_visibility_source NOT IN ('user_prompt', 'timeout_default', 'manual_override') THEN
    RAISE EXCEPTION 'Invalid visibility source';
  END IF;

  SELECT ci.venue_id
  INTO v_venue_id
  FROM public.check_ins ci
  WHERE ci.id = p_checkin_id
    AND ci.user_id = v_actor
    AND ci.checked_out_at IS NULL
  LIMIT 1;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Active check-in not found';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND public.has_venue_operational_idempotency_key(
       'update_checkin_visibility',
       v_venue_id,
       v_actor,
       v_actor,
       p_idempotency_key
     )
  THEN
    RETURN QUERY
    SELECT
      ci.id,
      ci.visibility,
      ci.visibility_selection_status,
      ci.visibility_selected_at
    FROM public.check_ins ci
    WHERE ci.id = p_checkin_id
      AND ci.user_id = v_actor
      AND ci.checked_out_at IS NULL;
    RETURN;
  END IF;

  UPDATE public.check_ins
  SET
    visibility = p_visibility,
    visibility_selection_status = CASE
      WHEN p_visibility_source = 'timeout_default' THEN 'defaulted_private'
      ELSE 'selected'
    END,
    visibility_selected_at = v_now,
    visibility_selection_source = p_visibility_source
  WHERE id = p_checkin_id
    AND user_id = v_actor
    AND checked_out_at IS NULL
  RETURNING venue_id INTO v_venue_id;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Active check-in not found';
  END IF;

  PERFORM public.log_venue_operational_action(
    'update_checkin_visibility',
    v_venue_id,
    v_actor,
    v_actor,
    'rpc',
    p_idempotency_key,
    jsonb_build_object('visibility', p_visibility, 'source', p_visibility_source) || COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN QUERY
  SELECT
    ci.id,
    ci.visibility,
    ci.visibility_selection_status,
    ci.visibility_selected_at
  FROM public.check_ins ci
  WHERE ci.id = p_checkin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_venue_intent_signal(
  p_venue_id UUID,
  p_signal_type TEXT,
  p_source TEXT DEFAULT 'manual',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  result_status TEXT,
  signal_id UUID,
  signal_type TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_signal_id UUID;
  v_existing_id UUID;
  v_existing_type TEXT;
  v_existing_expires TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_signal_type NOT IN ('heading_there', 'maybe_going') THEN
    RAISE EXCEPTION 'Invalid signal type';
  END IF;

  IF p_source NOT IN ('manual', 'post', 'system') THEN
    RAISE EXCEPTION 'Invalid signal source';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND public.has_venue_operational_idempotency_key(
       'set_venue_intent_signal',
       p_venue_id,
       v_actor,
       v_actor,
       p_idempotency_key
     )
  THEN
    RETURN QUERY
    SELECT
      'unchanged',
      vis.id,
      vis.signal_type,
      vis.expires_at
    FROM public.venue_interest_signals vis
    WHERE vis.user_id = v_actor
      AND vis.venue_id = p_venue_id
      AND vis.active = true
      AND vis.expires_at > v_now
    ORDER BY vis.set_at DESC
    LIMIT 1;
    RETURN;
  END IF;

  IF public.has_recent_venue_operational_action(
    'set_venue_intent_signal',
    p_venue_id,
    v_actor,
    v_actor,
    2
  ) THEN
    RETURN QUERY SELECT 'skipped_cooldown', NULL::UUID, p_signal_type, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT vis.id, vis.signal_type, vis.expires_at
  INTO v_existing_id, v_existing_type, v_existing_expires
  FROM public.venue_interest_signals vis
  WHERE vis.user_id = v_actor
    AND vis.venue_id = p_venue_id
    AND vis.active = true
    AND vis.expires_at > v_now
  ORDER BY vis.set_at DESC
  LIMIT 1;

  v_expires_at := CASE
    WHEN p_signal_type = 'heading_there' THEN (v_now + interval '180 minutes')
    ELSE (v_now + interval '12 hours')
  END;

  IF v_existing_id IS NOT NULL AND v_existing_type = p_signal_type AND v_existing_expires > (v_now + interval '1 minute') THEN
    RETURN QUERY SELECT 'unchanged', v_existing_id, v_existing_type, v_existing_expires;
    RETURN;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.venue_interest_signals
    SET
      signal_type = p_signal_type,
      source = p_source,
      active = true,
      set_at = v_now,
      expires_at = v_expires_at
    WHERE id = v_existing_id;

    v_signal_id := v_existing_id;
  ELSE
    INSERT INTO public.venue_interest_signals (
      user_id,
      venue_id,
      signal_type,
      source,
      active,
      set_at,
      expires_at
    )
    VALUES (
      v_actor,
      p_venue_id,
      p_signal_type,
      p_source,
      true,
      v_now,
      v_expires_at
    )
    RETURNING id INTO v_signal_id;
  END IF;

  PERFORM public.log_venue_operational_action(
    'set_venue_intent_signal',
    p_venue_id,
    v_actor,
    v_actor,
    'rpc',
    p_idempotency_key,
    jsonb_build_object('signal_type', p_signal_type, 'source', p_source)
  );

  RETURN QUERY SELECT
    CASE WHEN v_existing_id IS NULL THEN 'inserted' ELSE 'updated' END,
    v_signal_id,
    p_signal_type,
    v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_venue_inside_proof_event(
  p_venue_id UUID,
  p_user_id UUID,
  p_proof_source TEXT,
  p_confidence_level TEXT DEFAULT 'strong',
  p_confidence_score INTEGER DEFAULT 80,
  p_source_table TEXT DEFAULT NULL,
  p_source_record_id TEXT DEFAULT NULL,
  p_event_at TIMESTAMPTZ DEFAULT now(),
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  inside_proof_event_id UUID,
  strongest_recent_source TEXT,
  strongest_recent_confidence_score INTEGER,
  strongest_recent_event_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_event_id UUID;
  v_strongest_source TEXT;
  v_strongest_score INTEGER;
  v_strongest_event_at TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_venue_operational_access(p_venue_id, v_actor) THEN
    RAISE EXCEPTION 'Not authorized to record inside-proof events';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND public.has_venue_operational_idempotency_key(
       'record_inside_proof',
       p_venue_id,
       p_user_id,
       v_actor,
       p_idempotency_key
     )
  THEN
    SELECT
      e.proof_source,
      e.confidence_score,
      e.event_at
    INTO v_strongest_source, v_strongest_score, v_strongest_event_at
    FROM public.venue_inside_proof_events e
    WHERE e.venue_id = p_venue_id
      AND e.user_id = p_user_id
      AND e.event_at >= (now() - interval '12 hours')
    ORDER BY e.confidence_score DESC, e.event_at DESC
    LIMIT 1;

    RETURN QUERY
    SELECT
      NULL::UUID,
      v_strongest_source,
      v_strongest_score,
      v_strongest_event_at;
    RETURN;
  END IF;

  IF public.has_recent_venue_operational_action(
    'record_inside_proof',
    p_venue_id,
    p_user_id,
    v_actor,
    1
  ) THEN
    RETURN QUERY
    SELECT
      NULL::UUID,
      NULL::TEXT,
      NULL::INTEGER,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO public.venue_inside_proof_events (
    venue_id,
    user_id,
    proof_source,
    confidence_level,
    confidence_score,
    source_table,
    source_record_id,
    event_at,
    created_by_user_id,
    metadata
  )
  VALUES (
    p_venue_id,
    p_user_id,
    p_proof_source,
    p_confidence_level,
    p_confidence_score,
    p_source_table,
    p_source_record_id,
    p_event_at,
    v_actor,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (venue_id, proof_source, source_table, source_record_id)
  WHERE source_table IS NOT NULL AND source_record_id IS NOT NULL
  DO UPDATE
  SET
    confidence_level = EXCLUDED.confidence_level,
    confidence_score = EXCLUDED.confidence_score,
    event_at = EXCLUDED.event_at,
    created_by_user_id = EXCLUDED.created_by_user_id,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_event_id;

  PERFORM public.log_venue_operational_action(
    'record_inside_proof',
    p_venue_id,
    p_user_id,
    v_actor,
    'rpc',
    p_idempotency_key,
    jsonb_build_object('proof_source', p_proof_source, 'confidence_score', p_confidence_score)
  );

  SELECT
    e.proof_source,
    e.confidence_score,
    e.event_at
  INTO v_strongest_source, v_strongest_score, v_strongest_event_at
  FROM public.venue_inside_proof_events e
  WHERE e.venue_id = p_venue_id
    AND e.user_id = p_user_id
    AND e.event_at >= (now() - interval '12 hours')
  ORDER BY e.confidence_score DESC, e.event_at DESC
  LIMIT 1;

  RETURN QUERY
  SELECT v_event_id, v_strongest_source, v_strongest_score, v_strongest_event_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_venue_entry_checkin(
  p_venue_id UUID,
  p_user_id UUID,
  p_visibility TEXT DEFAULT 'private',
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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

  IF p_visibility <> 'private' THEN
    RAISE EXCEPTION 'Initial approved check-in visibility must be private';
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

  IF p_idempotency_key IS NOT NULL
     AND public.has_venue_operational_idempotency_key(
       'approve_entry',
       p_venue_id,
       p_user_id,
       v_actor,
       p_idempotency_key
     )
  THEN
    RETURN QUERY
    SELECT ci.id, vea.id, v_policy, v_security_mode
    FROM public.check_ins ci
    LEFT JOIN public.venue_entry_approvals vea
      ON vea.checkin_id = ci.id
    WHERE ci.user_id = p_user_id
      AND ci.venue_id = p_venue_id
      AND ci.checked_out_at IS NULL
    ORDER BY ci.checked_in_at DESC
    LIMIT 1;
    RETURN;
  END IF;

  IF public.has_recent_venue_operational_action(
    'approve_entry',
    p_venue_id,
    p_user_id,
    v_actor,
    2
  ) THEN
    RETURN QUERY
    SELECT ci.id, vea.id, v_policy, v_security_mode
    FROM public.check_ins ci
    LEFT JOIN public.venue_entry_approvals vea
      ON vea.checkin_id = ci.id
    WHERE ci.user_id = p_user_id
      AND ci.venue_id = p_venue_id
      AND ci.checked_out_at IS NULL
    ORDER BY ci.checked_in_at DESC
    LIMIT 1;
    RETURN;
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

    PERFORM public.log_venue_operational_action(
      'approve_entry_denied',
      p_venue_id,
      p_user_id,
      v_actor,
      'rpc',
      p_idempotency_key,
      jsonb_build_object('reason', 'venue_banned_status')
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

  PERFORM public.log_venue_operational_action(
    'approve_entry',
    p_venue_id,
    p_user_id,
    v_actor,
    'rpc',
    p_idempotency_key,
    jsonb_build_object('checkin_id', v_checkin_id, 'approval_id', v_approval_id)
  );

  RETURN QUERY
  SELECT v_checkin_id, v_approval_id, v_policy, v_security_mode;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_venue_patron_moderation_action(
  p_venue_id UUID,
  p_user_id UUID,
  p_action_type TEXT,
  p_caution_category TEXT DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL,
  p_internal_note TEXT DEFAULT NULL,
  p_status_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_trigger_type TEXT DEFAULT 'manual',
  p_idempotency_key TEXT DEFAULT NULL
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

  IF p_idempotency_key IS NOT NULL
     AND public.has_venue_operational_idempotency_key(
       'apply_patron_moderation',
       p_venue_id,
       p_user_id,
       v_actor,
       p_idempotency_key
     )
  THEN
    RETURN QUERY
    SELECT
      vpac.access_status,
      (vpac.access_status = 'banned') AS is_banned,
      vpac.status_expires_at,
      vpac.updated_at,
      NULL::UUID
    FROM public.venue_patron_access_controls vpac
    WHERE vpac.venue_id = p_venue_id
      AND vpac.user_id = p_user_id
    LIMIT 1;
    RETURN;
  END IF;

  IF public.has_recent_venue_operational_action(
    'apply_patron_moderation',
    p_venue_id,
    p_user_id,
    v_actor,
    2
  ) THEN
    RETURN QUERY
    SELECT
      vpac.access_status,
      (vpac.access_status = 'banned') AS is_banned,
      vpac.status_expires_at,
      vpac.updated_at,
      NULL::UUID
    FROM public.venue_patron_access_controls vpac
    WHERE vpac.venue_id = p_venue_id
      AND vpac.user_id = p_user_id
    LIMIT 1;
    RETURN;
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

  PERFORM public.log_venue_operational_action(
    'apply_patron_moderation',
    p_venue_id,
    p_user_id,
    v_actor,
    'rpc',
    p_idempotency_key,
    jsonb_build_object('action_type', p_action_type, 'target_status', v_target_status)
  );

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

CREATE OR REPLACE FUNCTION public.upsert_venue_caution_alert_preference(
  p_venue_id UUID,
  p_caution_category TEXT,
  p_trigger_type TEXT,
  p_minimum_threshold INTEGER DEFAULT 1,
  p_enabled BOOLEAN DEFAULT true,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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

  IF p_idempotency_key IS NOT NULL
     AND public.has_venue_operational_idempotency_key(
       'upsert_caution_preference',
       p_venue_id,
       NULL,
       v_actor,
       p_idempotency_key
     )
  THEN
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
    RETURN;
  END IF;

  IF public.has_recent_venue_operational_action(
    'upsert_caution_preference',
    p_venue_id,
    NULL,
    v_actor,
    1
  ) THEN
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
    RETURN;
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

  PERFORM public.log_venue_operational_action(
    'upsert_caution_preference',
    p_venue_id,
    NULL,
    v_actor,
    'rpc',
    p_idempotency_key,
    jsonb_build_object(
      'category', p_caution_category,
      'trigger', p_trigger_type,
      'threshold', p_minimum_threshold,
      'enabled', p_enabled
    )
  );

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

GRANT EXECUTE ON FUNCTION public.has_recent_venue_operational_action(TEXT, UUID, UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_venue_operational_idempotency_key(TEXT, UUID, UUID, UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.log_venue_operational_action(TEXT, UUID, UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_venue_checkin_for_user(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_venue_checkin_for_user(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.checkout_current_venue_checkin(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_current_venue_checkin(UUID, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.update_checkin_visibility_selection(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_checkin_visibility_selection(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.set_user_venue_intent_signal(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_venue_intent_signal(UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_venue_inside_proof_event(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_venue_inside_proof_event(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_venue_patron_moderation_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_venue_patron_moderation_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_venue_caution_alert_preference(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_venue_caution_alert_preference(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, TEXT) TO authenticated;

-- Backward-compatible wrappers so existing client calls resolve to hardened logic.
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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.approve_venue_entry_checkin(
    p_venue_id,
    p_user_id,
    p_visibility,
    p_notes,
    NULL
  );
$$;

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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.apply_venue_patron_moderation_action(
    p_venue_id,
    p_user_id,
    p_action_type,
    p_caution_category,
    p_reason_note,
    p_internal_note,
    p_status_expires_at,
    p_trigger_type,
    NULL
  );
$$;

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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.upsert_venue_caution_alert_preference(
    p_venue_id,
    p_caution_category,
    p_trigger_type,
    p_minimum_threshold,
    p_enabled,
    p_notes,
    NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.record_venue_inside_proof_event(
  p_venue_id UUID,
  p_user_id UUID,
  p_proof_source TEXT,
  p_confidence_level TEXT DEFAULT 'strong',
  p_confidence_score INTEGER DEFAULT 80,
  p_source_table TEXT DEFAULT NULL,
  p_source_record_id TEXT DEFAULT NULL,
  p_event_at TIMESTAMPTZ DEFAULT now(),
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  inside_proof_event_id UUID,
  strongest_recent_source TEXT,
  strongest_recent_confidence_score INTEGER,
  strongest_recent_event_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.record_venue_inside_proof_event(
    p_venue_id,
    p_user_id,
    p_proof_source,
    p_confidence_level,
    p_confidence_score,
    p_source_table,
    p_source_record_id,
    p_event_at,
    p_metadata,
    NULL
  );
$$;

REVOKE ALL ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_venue_entry_checkin(UUID, UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_venue_patron_moderation_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_venue_patron_moderation_action(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_venue_caution_alert_preference(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_venue_caution_alert_preference(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_venue_inside_proof_event(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_venue_inside_proof_event(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;
