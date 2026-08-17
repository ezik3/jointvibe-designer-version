-- Venue interest signals foundation (MVP-safe backend slice)
-- Notes:
-- - `currently_at` remains derived from `check_ins` (NOT stored here)
-- - this table only stores `heading_there` and `maybe_going`

CREATE TABLE IF NOT EXISTS public.venue_interest_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('heading_there', 'maybe_going')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('post', 'manual', 'system')),
  active BOOLEAN NOT NULL DEFAULT true,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venue_interest_signals IS
  'Stores non-check-in venue interest intent signals (heading_there/maybe_going).';

COMMENT ON COLUMN public.venue_interest_signals.signal_type IS
  'Allowed values: heading_there, maybe_going. currently_at is derived from check_ins.';

-- Enforce one active signal row per user per venue.
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_interest_signals_one_active_per_user_venue
  ON public.venue_interest_signals(user_id, venue_id)
  WHERE active = true;

-- Aggregation-oriented indexes.
CREATE INDEX IF NOT EXISTS idx_venue_interest_signals_venue_active_exp
  ON public.venue_interest_signals(venue_id, active, expires_at);

CREATE INDEX IF NOT EXISTS idx_venue_interest_signals_signal_active_exp
  ON public.venue_interest_signals(signal_type, active, expires_at);

CREATE INDEX IF NOT EXISTS idx_venue_interest_signals_user_venue
  ON public.venue_interest_signals(user_id, venue_id);

-- Keep timestamps and default TTL behavior in one place.
CREATE OR REPLACE FUNCTION public.apply_venue_interest_signal_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.set_at IS NULL THEN
    NEW.set_at := now();
  END IF;

  IF NEW.expires_at IS NULL THEN
    IF NEW.signal_type = 'heading_there' THEN
      NEW.expires_at := NEW.set_at + interval '180 minutes';
    ELSIF NEW.signal_type = 'maybe_going' THEN
      NEW.expires_at := NEW.set_at + interval '12 hours';
    END IF;
  END IF;

  NEW.active := COALESCE(NEW.active, true) AND NEW.expires_at > now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_venue_interest_signal_defaults ON public.venue_interest_signals;
CREATE TRIGGER trg_apply_venue_interest_signal_defaults
BEFORE INSERT OR UPDATE ON public.venue_interest_signals
FOR EACH ROW
EXECUTE FUNCTION public.apply_venue_interest_signal_defaults();

-- Optional maintenance helper for background jobs.
CREATE OR REPLACE FUNCTION public.expire_venue_interest_signals()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.venue_interest_signals
  SET active = false, updated_at = now()
  WHERE active = true
    AND expires_at <= now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Aggregation RPC:
-- Returns venue_id + three counters:
-- - currently_at_count from active check_ins
-- - heading_there_count / maybe_going_count from active non-expired intent rows
CREATE OR REPLACE FUNCTION public.get_venue_interest_signal_counts(p_venue_id UUID DEFAULT NULL)
RETURNS TABLE (
  venue_id UUID,
  currently_at_count BIGINT,
  heading_there_count BIGINT,
  maybe_going_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_checkins AS (
    SELECT ci.venue_id, COUNT(*)::BIGINT AS currently_at_count
    FROM public.check_ins ci
    WHERE ci.checked_out_at IS NULL
      AND (p_venue_id IS NULL OR ci.venue_id = p_venue_id)
    GROUP BY ci.venue_id
  ),
  active_signals AS (
    SELECT
      vis.venue_id,
      COUNT(*) FILTER (WHERE vis.signal_type = 'heading_there')::BIGINT AS heading_there_count,
      COUNT(*) FILTER (WHERE vis.signal_type = 'maybe_going')::BIGINT AS maybe_going_count
    FROM public.venue_interest_signals vis
    WHERE vis.active = true
      AND vis.expires_at > now()
      AND (p_venue_id IS NULL OR vis.venue_id = p_venue_id)
    GROUP BY vis.venue_id
  ),
  unioned_venues AS (
    SELECT venue_id FROM active_checkins
    UNION
    SELECT venue_id FROM active_signals
  )
  SELECT
    uv.venue_id,
    COALESCE(ac.currently_at_count, 0) AS currently_at_count,
    COALESCE(asg.heading_there_count, 0) AS heading_there_count,
    COALESCE(asg.maybe_going_count, 0) AS maybe_going_count
  FROM unioned_venues uv
  LEFT JOIN active_checkins ac ON ac.venue_id = uv.venue_id
  LEFT JOIN active_signals asg ON asg.venue_id = uv.venue_id
  ORDER BY uv.venue_id;
$$;

REVOKE ALL ON FUNCTION public.get_venue_interest_signal_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_interest_signal_counts(UUID) TO anon, authenticated, service_role;

ALTER TABLE public.venue_interest_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own venue interest signals" ON public.venue_interest_signals;
CREATE POLICY "Users can read own venue interest signals"
  ON public.venue_interest_signals
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own venue interest signals" ON public.venue_interest_signals;
CREATE POLICY "Users can insert own venue interest signals"
  ON public.venue_interest_signals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own venue interest signals" ON public.venue_interest_signals;
CREATE POLICY "Users can update own venue interest signals"
  ON public.venue_interest_signals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own venue interest signals" ON public.venue_interest_signals;
CREATE POLICY "Users can delete own venue interest signals"
  ON public.venue_interest_signals
  FOR DELETE
  USING (auth.uid() = user_id);
