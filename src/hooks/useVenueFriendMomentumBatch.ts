/**
 * useVenueFriendMomentumBatch — Batch Friend Momentum Hook
 *
 * Fetches aggregate friend momentum signals for multiple venues in parallel.
 * Intended for discovery surfaces (venue cards, hot venue lists) where you need
 * momentum data for a small set of venues at once.
 *
 * ── Capacity cap ─────────────────────────────────────────────────────────────
 * Capped at MAX_BATCH_SIZE (12) venues per fetch to limit concurrent RPC calls.
 * Pass the first N venue IDs you care about; extras are silently dropped.
 *
 * ── Privacy rules ────────────────────────────────────────────────────────────
 * Each call delegates to `get_venue_friend_momentum_counts` (SECURITY DEFINER):
 *   - viewer identity resolved server-side via auth.uid()
 *   - currently_at counts PUBLIC check-ins only
 *   - heading/maybe counts are aggregate-only — no user identities
 *   - unauthenticated callers receive all-zero results (no error)
 *
 * ── Error handling ───────────────────────────────────────────────────────────
 * Individual venue failures return a zero-activity result, not null.
 * The overall hook error reflects only unexpected top-level failures.
 *
 * ── Isolation rules ──────────────────────────────────────────────────────────
 * - Does NOT interact with venue energy scoring.
 * - Does NOT interact with presence, moderation, or operational systems.
 * - Does NOT write to any table or state.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateFriendMomentum,
  emptyFriendMomentumSignals,
  VenueFriendMomentumResult,
  VenueFriendMomentumSignals,
} from "@/utils/venueFriendMomentum";

/** Maximum number of venues to fetch in one batch. */
const MAX_BATCH_SIZE = 12;

export interface UseVenueFriendMomentumBatchReturn {
  /**
   * Map of venueId → VenueFriendMomentumResult.
   * Missing entries mean the venue was not in the request batch.
   * Entries always exist for requested venues (zero-activity on error).
   */
  momentumMap: Map<string, VenueFriendMomentumResult>;
  loading: boolean;
  error: Error | null;
  /** Manually re-fetch all venues in the current batch. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Per-venue fetch helper (no React dependency — safe to call outside hooks)
// ---------------------------------------------------------------------------

async function fetchOneMomentum(
  venueId: string,
): Promise<[string, VenueFriendMomentumResult]> {
  try {
    const { data, error } = await (supabase as any).rpc(
      "get_venue_friend_momentum_counts",
      { p_venue_id: venueId },
    );

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const signals: VenueFriendMomentumSignals = row
      ? {
          currentlyAtCount:  Number(row.currently_at_count  ?? 0),
          headingThereCount: Number(row.heading_there_count ?? 0),
          maybeGoingCount:   Number(row.maybe_going_count   ?? 0),
          totalFriendCount:  Number(row.total_friend_count  ?? 0),
        }
      : emptyFriendMomentumSignals();

    return [venueId, calculateFriendMomentum(signals)];
  } catch {
    // Degrade gracefully — surface zero-activity rather than an error
    return [venueId, calculateFriendMomentum(emptyFriendMomentumSignals())];
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Fetch friend momentum for multiple venues in parallel.
 *
 * Usage:
 *   const { momentumMap } = useVenueFriendMomentumBatch(venueIds);
 *   const momentum = momentumMap.get(venueId);
 *   if (momentum?.hasFriendActivity) { ... }
 *
 * @param venueIds  Array of venue UUIDs. Capped at MAX_BATCH_SIZE (12).
 */
export function useVenueFriendMomentumBatch(
  venueIds: string[],
): UseVenueFriendMomentumBatchReturn {
  const [momentumMap, setMomentumMap] = useState<Map<string, VenueFriendMomentumResult>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Stable dependency key derived from the capped venue list
  const ids = venueIds.slice(0, MAX_BATCH_SIZE);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!ids.length) {
      setMomentumMap(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(ids.map(fetchOneMomentum))
      .then((entries) => {
        if (!cancelled) setMomentumMap(new Map(entries));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // idsKey encodes the capped id list; tick forces manual re-fetches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, tick]);

  return { momentumMap, loading, error, refresh };
}
