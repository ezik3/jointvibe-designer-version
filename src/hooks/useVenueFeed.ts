/**
 * Venue Feed — Data Layer
 *
 * Provides a reusable service function and React hook for fetching
 * recent public venue-linked activity for a specific venue.
 *
 * This is the data foundation for the "Live from this venue" section
 * on venue pages. It does NOT create a new feed system — it filters
 * the existing posts table to venue-scoped public activity.
 *
 * ── What is included ────────────────────────────────────────────────
 * - Public posts explicitly tagged with the venue (posts.venue_id)
 * - Author display name and avatar (from customer_profiles)
 * - Post media, engagement counts, and timestamps
 *
 * ── What is strictly excluded ────────────────────────────────────────
 * - Non-public posts (visibility ≠ 'public')
 * - Private presence or private check-in data
 * - Private visit history (was_here, checked_out)
 * - Moderation actions, bans, caution alerts
 * - Staff operational data, incident timelines
 * - Operational notifications
 *
 * ── Privacy invariants ───────────────────────────────────────────────
 * - Posts query enforces `visibility = 'public'` at the DB layer.
 *   RLS on the posts table also enforces this independently.
 * - Author profiles expose only display_name and avatar_url — no
 *   location, age, or presence data.
 * - No check_ins table is queried.
 *
 * ── Isolation rules ──────────────────────────────────────────────────
 * - Does NOT interact with venue energy scoring.
 * - Does NOT interact with friend momentum.
 * - Does NOT interact with presence, moderation, or operational systems.
 * - Does NOT write to any table or state.
 *
 * ── Reusability ──────────────────────────────────────────────────────
 * - `fetchVenueFeed()` is a plain async function with no React
 *   dependency — safe to call from prefetch pipelines, server-side
 *   helpers, or any non-React context.
 * - `useVenueFeed()` is the React wrapper for component use.
 * - Both accept the same `VenueFeedOptions` for extensibility.
 *
 * ── Future extension points ──────────────────────────────────────────
 * - Pagination: pass `beforeTimestamp` option to implement infinite
 *   scroll (the cursor field is already wired).
 * - Richer ranking: post-process the result with `scoreFeedItems()`
 *   from `src/utils/feedScoring.ts` for recency/engagement weighting.
 * - Blending with energy score: caller can combine this feed result
 *   with the venue's energy state from `useVenueEnergy()`.
 * - Live streams: extend the result union type to include
 *   `live_streams` rows tagged to the venue.
 * - Media previews: image_url / video_url are already included.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single public post in the venue feed.
 * Contains only safe-for-display fields — no presence, moderation, or
 * operational data.
 */
export interface VenueFeedPost {
  id: string;
  user_id: string;
  venue_id: string;
  content: string;
  image_url: string | null;
  video_url: string | null;
  post_type: string;
  pounds_count: number;
  comments_count: number;
  view_count: number;
  is_live: boolean;
  created_at: string;
  /** Author public profile. Only display_name and avatar_url — no location or presence. */
  author: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface VenueFeedOptions {
  /**
   * Maximum number of posts to return.
   * @default 20
   */
  limit?: number;
  /**
   * ISO timestamp cursor for pagination.
   * Returns only posts created before this timestamp.
   * Use the `created_at` of the last item to load the next page.
   */
  beforeTimestamp?: string;
}

export interface UseVenueFeedReturn {
  posts: VenueFeedPost[];
  loading: boolean;
  error: Error | null;
  /** Re-fetch the feed from scratch (ignores cursor). */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Column selection — kept lean to avoid query timeouts
// ---------------------------------------------------------------------------

const VENUE_FEED_SELECT =
  "id, user_id, venue_id, content, image_url, video_url, post_type, " +
  "pounds_count, comments_count, view_count, is_live, created_at";

const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Service function (no React dependency — safe for prefetch / non-React use)
// ---------------------------------------------------------------------------

/**
 * Fetch recent public posts tagged with a specific venue.
 *
 * Privacy guarantees:
 * - Queries only `visibility = 'public'` rows (enforced at DB level by RLS
 *   and explicitly in the query filter for defence-in-depth).
 * - No check_ins, moderation, caution, incident, or operational tables are touched.
 * - Author profile data is limited to display_name and avatar_url.
 *
 * @param venueId  The venue UUID to scope the feed to.
 * @param options  Optional limit and pagination cursor.
 * @returns        Array of feed posts, newest first.
 */
export async function fetchVenueFeed(
  venueId: string,
  options: VenueFeedOptions = {},
): Promise<VenueFeedPost[]> {
  const { limit = DEFAULT_LIMIT, beforeTimestamp } = options;

  // -----------------------------------------------------------------------
  // Step 1: Fetch venue-scoped public posts
  // -----------------------------------------------------------------------
  let query = supabase
    .from("posts")
    .select(VENUE_FEED_SELECT)
    .eq("venue_id", venueId)
    // Defence-in-depth: explicitly filter public even though RLS enforces it.
    // This prevents accidental leakage if RLS is ever misconfigured.
    .eq("visibility", "public")
    // 24-hour post lifecycle (public surfaces only)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (beforeTimestamp) {
    // Strict less-than for stable cursor pagination (no duplicates at boundary)
    query = query.lt("created_at", beforeTimestamp);
  }

  const { data: posts, error: postsError } = await query;

  if (postsError) throw postsError;
  if (!posts || posts.length === 0) return [];

  // -----------------------------------------------------------------------
  // Step 2: Attach author profiles (display_name + avatar_url only)
  // No location, no presence, no tier — just display identity.
  // -----------------------------------------------------------------------
  const userIds = [...new Set(posts.map((p: any) => p.user_id as string))];

  const { data: profiles } = await supabase
    .from("customer_profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", userIds);

  const profileMap = new Map(profiles?.map((p: any) => [p.user_id as string, p]) ?? []);

  // -----------------------------------------------------------------------
  // Step 3: Assemble result
  // -----------------------------------------------------------------------
  return posts.map((post: any) => {
    const profile = profileMap.get(post.user_id as string);
    return {
      id:             post.id as string,
      user_id:        post.user_id as string,
      venue_id:       post.venue_id as string,
      content:        post.content as string,
      image_url:      (post.image_url as string | null) ?? null,
      video_url:      (post.video_url as string | null) ?? null,
      post_type:      (post.post_type as string | null) ?? "status",
      pounds_count:   Number(post.pounds_count  ?? 0),
      comments_count: Number(post.comments_count ?? 0),
      view_count:     Number(post.view_count     ?? 0),
      is_live:        Boolean(post.is_live),
      created_at:     post.created_at as string,
      author: {
        display_name: (profile?.display_name as string | null) ?? null,
        avatar_url:   (profile?.avatar_url   as string | null) ?? null,
      },
    } satisfies VenueFeedPost;
  });
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * React hook for the venue feed.
 *
 * Usage:
 *   const { posts, loading, error, refresh } = useVenueFeed(venueId);
 *
 * The hook re-fetches when venueId changes or when refresh() is called.
 * Options (limit, beforeTimestamp) are read once on mount; to change them
 * call refresh() after updating the parent component's option state.
 *
 * @param venueId  The venue UUID to scope the feed to. Null/undefined skips fetching.
 * @param options  Optional fetch options (limit, beforeTimestamp).
 */
export function useVenueFeed(
  venueId: string | null | undefined,
  options: VenueFeedOptions = {},
): UseVenueFeedReturn {
  const [posts, setPosts] = useState<VenueFeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!venueId) {
      setPosts([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchVenueFeed(venueId, options)
      .then((result) => {
        if (!cancelled) setPosts(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setPosts([]); // degrade to empty feed, not broken UI
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // options intentionally excluded: callers should use refresh() to re-fetch
    // with new options rather than risk an infinite render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, tick]);

  return { posts, loading, error, refresh };
}
