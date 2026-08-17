-- Venue staff tools and permissions foundation
-- Adds explicit, reusable role checks for venue operational actions.

CREATE OR REPLACE FUNCTION public.has_venue_operational_access(
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
    );
$$;

CREATE OR REPLACE FUNCTION public.can_approve_venue_entry(
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

CREATE OR REPLACE FUNCTION public.can_view_venue_internal_patrons(
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
          OR COALESCE((evl.permissions->>'tables')::boolean, false) = true
          OR COALESCE((evl.permissions->>'orders')::boolean, false) = true
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_venue_internal_patron_presence(
  p_venue_id UUID
)
RETURNS TABLE (
  checkin_id UUID,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  table_number TEXT,
  checked_in_at TIMESTAMPTZ,
  visibility TEXT,
  verification_state TEXT,
  checkin_entry_source TEXT,
  current_tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.can_view_venue_internal_patrons(p_venue_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view internal patron presence';
  END IF;

  RETURN QUERY
  SELECT
    ci.id AS checkin_id,
    ci.user_id,
    cp.display_name,
    cp.avatar_url,
    ci.table_number,
    ci.checked_in_at,
    ci.visibility,
    ci.verification_state,
    ci.checkin_entry_source,
    ut.current_tier
  FROM public.check_ins ci
  LEFT JOIN public.customer_profiles cp
    ON cp.user_id = ci.user_id
  LEFT JOIN public.user_tiers ut
    ON ut.user_id = ci.user_id
  WHERE ci.venue_id = p_venue_id
    AND ci.checked_out_at IS NULL
  ORDER BY ci.checked_in_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_venue_operational_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_venue_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_venue_internal_patrons(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_venue_internal_patron_presence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_internal_patron_presence(UUID) TO authenticated;
