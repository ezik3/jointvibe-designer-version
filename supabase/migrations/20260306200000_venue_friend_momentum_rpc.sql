-- Venue friend momentum RPC foundation
--
-- Provides a safe, aggregate-only count of how many users the viewer follows
-- are at, heading to, or interested in a given venue.
--
-- Privacy rules enforced by this function:
--   1. currently_at_count — only counts PUBLICLY visible check-ins.
--      Private check-ins are never exposed through friend momentum.
--   2. heading_there_count / maybe_going_count — aggregate counts only.
--      No user IDs, handles, or profile data are returned.
--   3. The viewer's own following list is the only social graph used.
--      Mutual-follow / connection status is NOT required (follows are one-way).
--   4. Output is aggregate numbers only — no identity-level data in this RPC.
--      Identity-level previews are a documented future extension (see hook).
--
-- Isolation rules:
--   - This function does NOT touch moderation, bans, caution alerts,
--     incident timelines, operational notifications, or venue operations.
--   - It does NOT modify any presence, intent, or energy state.
--   - It does NOT interact with the venue energy scoring system.

CREATE OR REPLACE FUNCTION public.get_venue_friend_momentum_counts(
  p_venue_id UUID
)
RETURNS TABLE (
  currently_at_count  BIGINT,
  heading_there_count BIGINT,
  maybe_going_count   BIGINT,
  total_friend_count  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_id UUID := auth.uid();
BEGIN
  -- Unauthenticated callers receive all-zero counts (no error).
  IF v_viewer_id IS NULL THEN
    RETURN QUERY
    SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY
  WITH followed_users AS (
    -- Users the viewer actively follows (one-way follow graph).
    SELECT uf.following_id AS user_id
    FROM   public.user_follows uf
    WHERE  uf.follower_id = v_viewer_id
  ),

  public_checkins AS (
    -- Followed users currently checked in with PUBLIC visibility only.
    -- Private check-ins are intentionally excluded: they must never be
    -- surfaced through friend momentum or any social/discovery surface.
    SELECT COUNT(DISTINCT ci.user_id)::BIGINT AS cnt
    FROM   public.check_ins ci
    INNER JOIN followed_users fu ON fu.user_id = ci.user_id
    WHERE  ci.venue_id       = p_venue_id
      AND  ci.checked_out_at IS NULL
      AND  ci.visibility      = 'public'
  ),

  heading_signals AS (
    -- Followed users with an active, non-expired heading_there intent.
    -- Intent signals do not carry a visibility field; they are treated as
    -- semi-public aggregate signals (the count is shown, not the identity).
    SELECT COUNT(DISTINCT vis.user_id)::BIGINT AS cnt
    FROM   public.venue_interest_signals vis
    INNER JOIN followed_users fu ON fu.user_id = vis.user_id
    WHERE  vis.venue_id    = p_venue_id
      AND  vis.signal_type  = 'heading_there'
      AND  vis.active        = true
      AND  vis.expires_at    > now()
  ),

  maybe_signals AS (
    -- Followed users with an active, non-expired maybe_going intent.
    SELECT COUNT(DISTINCT vis.user_id)::BIGINT AS cnt
    FROM   public.venue_interest_signals vis
    INNER JOIN followed_users fu ON fu.user_id = vis.user_id
    WHERE  vis.venue_id    = p_venue_id
      AND  vis.signal_type  = 'maybe_going'
      AND  vis.active        = true
      AND  vis.expires_at    > now()
  )

  SELECT
    COALESCE(pc.cnt, 0)                                             AS currently_at_count,
    COALESCE(hs.cnt, 0)                                             AS heading_there_count,
    COALESCE(ms.cnt, 0)                                             AS maybe_going_count,
    COALESCE(pc.cnt, 0) + COALESCE(hs.cnt, 0) + COALESCE(ms.cnt, 0) AS total_friend_count
  FROM
    public_checkins pc,
    heading_signals hs,
    maybe_signals   ms;
END;
$$;

COMMENT ON FUNCTION public.get_venue_friend_momentum_counts(UUID) IS
  'Returns aggregate friend momentum counts for a venue (currently_at/heading_there/maybe_going).
   Only counts PUBLIC check-ins for currently_at. Intent signals are aggregate-only.
   No user identity is returned. Requires auth.uid() to identify the viewer''s following list.';

REVOKE ALL ON FUNCTION public.get_venue_friend_momentum_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_friend_momentum_counts(UUID) TO authenticated;
