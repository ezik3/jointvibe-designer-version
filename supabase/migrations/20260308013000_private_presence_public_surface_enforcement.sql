-- Enforce private-presence separation across public surfaces.
-- Private check-ins remain available to:
-- 1) the patron themselves
-- 2) authorized venue operational roles
-- 3) platform admins
-- Everyone else only sees public check-ins.

DROP POLICY IF EXISTS "Users can view check-ins" ON public.check_ins;
DROP POLICY IF EXISTS "Users can view own check-ins" ON public.check_ins;
DROP POLICY IF EXISTS "Users can view public check-ins" ON public.check_ins;
DROP POLICY IF EXISTS "Venue operational roles can view venue check-ins" ON public.check_ins;
DROP POLICY IF EXISTS "Admins can view all check-ins" ON public.check_ins;

CREATE POLICY "Users can view own check-ins"
  ON public.check_ins
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public check-ins"
  ON public.check_ins
  FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Venue operational roles can view venue check-ins"
  ON public.check_ins
  FOR SELECT
  USING (public.has_venue_operational_access(venue_id, auth.uid()));

CREATE POLICY "Admins can view all check-ins"
  ON public.check_ins
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Query-performance helper for public venue-presence reads.
CREATE INDEX IF NOT EXISTS idx_checkins_active_public_venue_time
  ON public.check_ins (venue_id, checked_in_at DESC)
  WHERE checked_out_at IS NULL AND visibility = 'public';
