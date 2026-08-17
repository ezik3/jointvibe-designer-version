-- Transaction/POS inside-proof foundation.
-- Adds a reusable evidence model for stronger in-venue confidence signals.

CREATE TABLE IF NOT EXISTS public.venue_inside_proof_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proof_source TEXT NOT NULL,
  confidence_level TEXT NOT NULL DEFAULT 'strong',
  confidence_score INTEGER NOT NULL DEFAULT 80,
  source_table TEXT,
  source_record_id TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_inside_proof_events_source_valid
    CHECK (
      proof_source IN (
        'pos_order',
        'payment_request',
        'venue_transaction',
        'service_order',
        'manual_ops'
      )
    ),
  CONSTRAINT venue_inside_proof_events_confidence_level_valid
    CHECK (confidence_level IN ('supporting', 'strong')),
  CONSTRAINT venue_inside_proof_events_confidence_score_range
    CHECK (confidence_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_venue_inside_proof_events_venue_user_event
  ON public.venue_inside_proof_events (venue_id, user_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_inside_proof_events_venue_event
  ON public.venue_inside_proof_events (venue_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_inside_proof_events_source
  ON public.venue_inside_proof_events (proof_source, event_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_inside_proof_events_source_record
  ON public.venue_inside_proof_events (venue_id, proof_source, source_table, source_record_id)
  WHERE source_table IS NOT NULL AND source_record_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_venue_inside_proof_events_updated_at ON public.venue_inside_proof_events;
CREATE TRIGGER set_venue_inside_proof_events_updated_at
BEFORE UPDATE ON public.venue_inside_proof_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.venue_inside_proof_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_inside_proof_events_select_authorized" ON public.venue_inside_proof_events;
CREATE POLICY "venue_inside_proof_events_select_authorized"
ON public.venue_inside_proof_events
FOR SELECT
USING (public.has_venue_operational_access(venue_id, auth.uid()));

DROP POLICY IF EXISTS "venue_inside_proof_events_insert_authorized" ON public.venue_inside_proof_events;
CREATE POLICY "venue_inside_proof_events_insert_authorized"
ON public.venue_inside_proof_events
FOR INSERT
WITH CHECK (public.has_venue_operational_access(venue_id, auth.uid()));

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

CREATE OR REPLACE FUNCTION public.get_venue_patron_inside_proof_summary(
  p_venue_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  strongest_recent_source TEXT,
  strongest_recent_confidence_level TEXT,
  strongest_recent_confidence_score INTEGER,
  strongest_recent_event_at TIMESTAMPTZ,
  recent_proof_event_count BIGINT
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
    RAISE EXCEPTION 'Not authorized to view inside-proof summary';
  END IF;

  RETURN QUERY
  WITH recent AS (
    SELECT
      e.proof_source,
      e.confidence_level,
      e.confidence_score,
      e.event_at
    FROM public.venue_inside_proof_events e
    WHERE e.venue_id = p_venue_id
      AND e.user_id = p_user_id
      AND e.event_at >= (now() - interval '24 hours')
  ),
  strongest AS (
    SELECT
      r.proof_source,
      r.confidence_level,
      r.confidence_score,
      r.event_at
    FROM recent r
    ORDER BY r.confidence_score DESC, r.event_at DESC
    LIMIT 1
  )
  SELECT
    s.proof_source,
    s.confidence_level,
    s.confidence_score,
    s.event_at,
    (SELECT COUNT(*) FROM recent)
  FROM strongest s;
END;
$$;

REVOKE ALL ON FUNCTION public.record_venue_inside_proof_event(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_venue_inside_proof_event(UUID, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.get_venue_patron_inside_proof_summary(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_patron_inside_proof_summary(UUID, UUID) TO authenticated;
