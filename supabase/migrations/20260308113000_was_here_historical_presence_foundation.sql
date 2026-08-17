-- Historical "was_here" presence foundation.
-- Separates past venue visits from current presence, intent signals, and moderation systems.

CREATE TABLE IF NOT EXISTS public.venue_presence_was_here_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES public.check_ins(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_started_at TIMESTAMPTZ NOT NULL,
  visit_ended_at TIMESTAMPTZ NOT NULL,
  visit_duration_seconds INTEGER NOT NULL DEFAULT 0,
  visit_visibility TEXT NOT NULL DEFAULT 'private',
  is_public_visit BOOLEAN NOT NULL DEFAULT false,
  verification_state TEXT,
  checkin_entry_source TEXT,
  confidence_score INTEGER,
  confidence_band TEXT,
  primary_evidence TEXT,
  confidence_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_state TEXT NOT NULL DEFAULT 'was_here',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_presence_was_here_visits_unique_checkin UNIQUE (checkin_id),
  CONSTRAINT venue_presence_was_here_visits_visibility_valid
    CHECK (visit_visibility IN ('public', 'private')),
  CONSTRAINT venue_presence_was_here_visits_confidence_band_valid
    CHECK (confidence_band IS NULL OR confidence_band IN ('high', 'medium', 'low', 'very_low')),
  CONSTRAINT venue_presence_was_here_visits_lifecycle_valid
    CHECK (lifecycle_state = 'was_here'),
  CONSTRAINT venue_presence_was_here_visits_time_valid
    CHECK (visit_ended_at >= visit_started_at),
  CONSTRAINT venue_presence_was_here_visits_duration_valid
    CHECK (visit_duration_seconds >= 0),
  CONSTRAINT venue_presence_was_here_visits_confidence_score_valid
    CHECK (
      confidence_score IS NULL
      OR (confidence_score >= 0 AND confidence_score <= 100)
    )
);

COMMENT ON TABLE public.venue_presence_was_here_visits IS
  'Historical confirmed venue visits derived from ended check-ins. Internal lifecycle layer: checked_in -> checked_out -> was_here.';

COMMENT ON COLUMN public.venue_presence_was_here_visits.lifecycle_state IS
  'Always was_here. Distinct from live presence state, moderation status, and intent signals.';

CREATE INDEX IF NOT EXISTS idx_was_here_visits_user_time
  ON public.venue_presence_was_here_visits (user_id, visit_ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_was_here_visits_venue_time
  ON public.venue_presence_was_here_visits (venue_id, visit_ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_was_here_visits_public_venue_time
  ON public.venue_presence_was_here_visits (venue_id, visit_ended_at DESC)
  WHERE is_public_visit = true;

ALTER TABLE public.venue_presence_was_here_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "was_here_visits_select_own" ON public.venue_presence_was_here_visits;
CREATE POLICY "was_here_visits_select_own"
ON public.venue_presence_was_here_visits
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "was_here_visits_select_venue_operational" ON public.venue_presence_was_here_visits;
CREATE POLICY "was_here_visits_select_venue_operational"
ON public.venue_presence_was_here_visits
FOR SELECT
USING (public.has_venue_operational_access(venue_id, auth.uid()));

DROP POLICY IF EXISTS "was_here_visits_select_admin" ON public.venue_presence_was_here_visits;
CREATE POLICY "was_here_visits_select_admin"
ON public.venue_presence_was_here_visits
FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.derive_was_here_visit_confidence(
  p_venue_id UUID,
  p_user_id UUID,
  p_visit_started_at TIMESTAMPTZ,
  p_visit_ended_at TIMESTAMPTZ,
  p_verification_state TEXT,
  p_checkin_entry_source TEXT
)
RETURNS TABLE (
  confidence_score INTEGER,
  confidence_band TEXT,
  primary_evidence TEXT,
  confidence_metadata JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_score INTEGER := 0;
  v_inside_proof_count BIGINT := 0;
  v_strongest_inside_proof_score INTEGER;
  v_strongest_inside_proof_source TEXT;
  v_confidence_band TEXT := 'very_low';
  v_primary_evidence TEXT := 'weak_proximity_only';
  v_metadata JSONB := '{}'::jsonb;
BEGIN
  IF p_verification_state = 'approved' THEN
    v_score := v_score + 58;
  ELSIF p_verification_state = 'not_required' THEN
    v_score := v_score + 44;
  ELSIF p_verification_state = 'fallback_unverified' THEN
    v_score := v_score + 24;
  ELSIF p_verification_state IN ('required', 'pending') THEN
    v_score := v_score + 14;
  ELSE
    v_score := v_score + 20;
  END IF;

  IF p_checkin_entry_source = 'staff_approval' THEN
    v_score := v_score + 20;
  ELSIF p_checkin_entry_source = 'self_checkin_open_entry' THEN
    v_score := v_score + 12;
  ELSIF p_checkin_entry_source = 'hybrid_fallback' THEN
    v_score := v_score + 6;
  END IF;

  SELECT
    COUNT(*)::BIGINT,
    MAX(e.confidence_score),
    (
      SELECT ei.proof_source
      FROM public.venue_inside_proof_events ei
      WHERE ei.venue_id = p_venue_id
        AND ei.user_id = p_user_id
        AND ei.event_at >= (p_visit_started_at - interval '15 minutes')
        AND ei.event_at <= (p_visit_ended_at + interval '15 minutes')
      ORDER BY ei.confidence_score DESC, ei.event_at DESC
      LIMIT 1
    )
  INTO
    v_inside_proof_count,
    v_strongest_inside_proof_score,
    v_strongest_inside_proof_source
  FROM public.venue_inside_proof_events e
  WHERE e.venue_id = p_venue_id
    AND e.user_id = p_user_id
    AND e.event_at >= (p_visit_started_at - interval '15 minutes')
    AND e.event_at <= (p_visit_ended_at + interval '15 minutes');

  IF v_strongest_inside_proof_score IS NOT NULL THEN
    v_score := v_score + LEAST(18, GREATEST(0, ROUND(v_strongest_inside_proof_score * 0.20)::INTEGER));
    IF v_inside_proof_count >= 3 THEN
      v_score := v_score + 6;
    ELSIF v_inside_proof_count = 2 THEN
      v_score := v_score + 3;
    END IF;
  END IF;

  v_score := LEAST(100, GREATEST(0, v_score));

  v_confidence_band := CASE
    WHEN v_score >= 80 THEN 'high'
    WHEN v_score >= 55 THEN 'medium'
    WHEN v_score >= 30 THEN 'low'
    ELSE 'very_low'
  END;

  IF v_strongest_inside_proof_score IS NOT NULL AND v_strongest_inside_proof_score >= 80 THEN
    v_primary_evidence := 'transaction_or_pos_supported_proof';
  ELSIF p_verification_state = 'approved' OR p_checkin_entry_source = 'staff_approval' THEN
    v_primary_evidence := 'staff_approved_entry';
  ELSIF p_verification_state = 'fallback_unverified' OR p_checkin_entry_source = 'hybrid_fallback' THEN
    v_primary_evidence := 'fallback_unverified_presence';
  ELSE
    v_primary_evidence := 'valid_checked_in_state';
  END IF;

  v_metadata := jsonb_build_object(
    'inside_proof_count', COALESCE(v_inside_proof_count, 0),
    'strongest_inside_proof_source', v_strongest_inside_proof_source,
    'strongest_inside_proof_score', v_strongest_inside_proof_score,
    'confidence_source', 'derived_from_presence_and_inside_proof'
  );

  RETURN QUERY SELECT v_score, v_confidence_band, v_primary_evidence, v_metadata;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_was_here_visit_from_checkin(
  p_checkin_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_checkin RECORD;
  v_visit_id UUID;
  v_confidence_score INTEGER;
  v_confidence_band TEXT;
  v_primary_evidence TEXT;
  v_confidence_metadata JSONB;
BEGIN
  SELECT
    ci.id,
    ci.venue_id,
    ci.user_id,
    ci.checked_in_at,
    ci.checked_out_at,
    ci.visibility,
    ci.verification_state,
    ci.checkin_entry_source
  INTO v_checkin
  FROM public.check_ins ci
  WHERE ci.id = p_checkin_id
  LIMIT 1;

  IF v_checkin.id IS NULL OR v_checkin.checked_out_at IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    d.confidence_score,
    d.confidence_band,
    d.primary_evidence,
    d.confidence_metadata
  INTO
    v_confidence_score,
    v_confidence_band,
    v_primary_evidence,
    v_confidence_metadata
  FROM public.derive_was_here_visit_confidence(
    v_checkin.venue_id,
    v_checkin.user_id,
    v_checkin.checked_in_at,
    v_checkin.checked_out_at,
    v_checkin.verification_state,
    v_checkin.checkin_entry_source
  ) d;

  INSERT INTO public.venue_presence_was_here_visits (
    checkin_id,
    venue_id,
    user_id,
    visit_started_at,
    visit_ended_at,
    visit_duration_seconds,
    visit_visibility,
    is_public_visit,
    verification_state,
    checkin_entry_source,
    confidence_score,
    confidence_band,
    primary_evidence,
    confidence_metadata,
    lifecycle_state
  )
  VALUES (
    v_checkin.id,
    v_checkin.venue_id,
    v_checkin.user_id,
    v_checkin.checked_in_at,
    v_checkin.checked_out_at,
    GREATEST(0, EXTRACT(EPOCH FROM (v_checkin.checked_out_at - v_checkin.checked_in_at))::INTEGER),
    COALESCE(v_checkin.visibility, 'private'),
    COALESCE(v_checkin.visibility, 'private') = 'public',
    v_checkin.verification_state,
    v_checkin.checkin_entry_source,
    v_confidence_score,
    v_confidence_band,
    v_primary_evidence,
    COALESCE(v_confidence_metadata, '{}'::jsonb),
    'was_here'
  )
  ON CONFLICT (checkin_id)
  DO NOTHING
  RETURNING id INTO v_visit_id;

  RETURN v_visit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_record_was_here_visit_on_checkout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.checked_out_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.checked_out_at IS NULL)
  THEN
    PERFORM public.record_was_here_visit_from_checkin(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_was_here_visit_on_checkout_update ON public.check_ins;
CREATE TRIGGER trg_record_was_here_visit_on_checkout_update
AFTER UPDATE OF checked_out_at ON public.check_ins
FOR EACH ROW
EXECUTE FUNCTION public.trg_record_was_here_visit_on_checkout();

DROP TRIGGER IF EXISTS trg_record_was_here_visit_on_checkout_insert ON public.check_ins;
CREATE TRIGGER trg_record_was_here_visit_on_checkout_insert
AFTER INSERT ON public.check_ins
FOR EACH ROW
EXECUTE FUNCTION public.trg_record_was_here_visit_on_checkout();

-- Backfill historical records for already-ended check-ins.
INSERT INTO public.venue_presence_was_here_visits (
  checkin_id,
  venue_id,
  user_id,
  visit_started_at,
  visit_ended_at,
  visit_duration_seconds,
  visit_visibility,
  is_public_visit,
  verification_state,
  checkin_entry_source,
  confidence_score,
  confidence_band,
  primary_evidence,
  confidence_metadata,
  lifecycle_state
)
SELECT
  ci.id,
  ci.venue_id,
  ci.user_id,
  ci.checked_in_at,
  ci.checked_out_at,
  GREATEST(0, EXTRACT(EPOCH FROM (ci.checked_out_at - ci.checked_in_at))::INTEGER),
  COALESCE(ci.visibility, 'private'),
  COALESCE(ci.visibility, 'private') = 'public',
  ci.verification_state,
  ci.checkin_entry_source,
  conf.confidence_score,
  conf.confidence_band,
  conf.primary_evidence,
  conf.confidence_metadata,
  'was_here'
FROM public.check_ins ci
CROSS JOIN LATERAL public.derive_was_here_visit_confidence(
  ci.venue_id,
  ci.user_id,
  ci.checked_in_at,
  ci.checked_out_at,
  ci.verification_state,
  ci.checkin_entry_source
) conf
LEFT JOIN public.venue_presence_was_here_visits wh
  ON wh.checkin_id = ci.id
WHERE ci.checked_out_at IS NOT NULL
  AND wh.checkin_id IS NULL
ON CONFLICT (checkin_id)
DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_my_was_here_visits(
  p_limit INTEGER DEFAULT 100,
  p_venue_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  venue_id UUID,
  visit_started_at TIMESTAMPTZ,
  visit_ended_at TIMESTAMPTZ,
  visit_duration_seconds INTEGER,
  visit_visibility TEXT,
  is_public_visit BOOLEAN,
  confidence_score INTEGER,
  confidence_band TEXT,
  primary_evidence TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    wh.id,
    wh.venue_id,
    wh.visit_started_at,
    wh.visit_ended_at,
    wh.visit_duration_seconds,
    wh.visit_visibility,
    wh.is_public_visit,
    wh.confidence_score,
    wh.confidence_band,
    wh.primary_evidence
  FROM public.venue_presence_was_here_visits wh
  WHERE wh.user_id = auth.uid()
    AND (p_venue_id IS NULL OR wh.venue_id = p_venue_id)
  ORDER BY wh.visit_ended_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
END;
$$;

REVOKE ALL ON FUNCTION public.derive_was_here_visit_confidence(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.derive_was_here_visit_confidence(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_was_here_visit_from_checkin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_was_here_visit_from_checkin(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_was_here_visits(INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_was_here_visits(INTEGER, UUID) TO authenticated;
