/**
 * useVenueFriendMomentum — Friend Momentum Data Fetching Hook
 *
 * Fetches aggregate friend momentum signals for a venue and computes a
 * user-facing result using the pure `calculateFriendMomentum` utility.
 *
 * "Friend momentum" answers:
 *   - How many people I follow are there now (public only)?
 *   - How many people I follow are heading there?
 *   - How many people I follow are maybe going?
 *   - Is momentum building among my social graph around this venue?
 *
 * Privacy rules enforced here:
 * - Uses `get_venue_friend_momentum_counts` (SECURITY DEFINER RPC) which:
 *     • counts currently_at only for PUBLIC check-ins
 *     • counts heading/maybe signals as aggregate only (no identities)
 *     • derives the following list from auth.uid() server-side
 * - No user IDs, handles, avatars, or profile data are fetched or returned.
 * - Private check-ins are NEVER surfaced through this hook.
 * - Moderation, ban, caution, incident, and operational systems do not
 *   interact with this hook in any direction.
 *
 * Isolation rules:
 * - Does NOT call or modify venue energy scoring.
 * - Does NOT interact with presence, moderation, or operational systems.
 * - Does NOT write to any table or state.
 *
 * Extension point (identity-level previews):
 * - To show avatars of the first N followed users who are publicly checked
 *   in, add a separate `useVenueFriendPreviews` hook that calls a new RPC
 *   returning public profile data for the currently_at subset only.
 * - Intent-signal identities (heading/maybe) must remain aggregate-only.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateFriendMomentum,
  emptyFriendMomentumSignals,
  VenueFriendMomentumResult,
  VenueFriendMomentumSignals,
} from "@/utils/venueFriendMomentum";

export interface UseVenueFriendMomentumOptions {
  /** The venue to query. Pass null/undefined to skip fetching. */
  venueId: string | null | undefined;
  /** Set false to pause fetching without unmounting. Defaults to true. */
  enabled?: boolean;
}

export interface UseVenueFriendMomentumReturn {
  /** Computed friend momentum result, or null if not yet loaded. */
  momentum: VenueFriendMomentumResult | null;
  loading: boolean;
  error: Error | null;
  /** Manually re-fetch the friend momentum signals. */
  refresh: () => void;
}

export function useVenueFriendMomentum({
  venueId,
  enabled = true,
}: UseVenueFriendMomentumOptions): UseVenueFriendMomentumReturn {
  const [momentum, setMomentum] = useState<VenueFriendMomentumResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!venueId || !enabled) {
      setMomentum(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchMomentum() {
      setLoading(true);
      setError(null);

      try {
        // ----------------------------------------------------------------
        // Call the SECURITY DEFINER RPC.
        //
        // The function:
        //   1. Reads auth.uid() server-side → no viewer ID passed from client.
        //   2. Resolves the viewer's following list from user_follows.
        //   3. Counts PUBLIC check-ins only for currently_at.
        //   4. Counts aggregate heading_there / maybe_going intent signals.
        //   5. Returns four BIGINT counts — no user identity data.
        //
        // If the viewer is unauthenticated, the RPC returns all zeros.
        // ----------------------------------------------------------------
        const { data, error: rpcError } = await (supabase as any).rpc(
          "get_venue_friend_momentum_counts",
          { p_venue_id: venueId },
        );

        if (rpcError) throw rpcError;

        const row = Array.isArray(data) ? data[0] : data;

        // Normalise — RPC may return null row if no follows exist
        const signals: VenueFriendMomentumSignals = row
          ? {
              currentlyAtCount:  Number(row.currently_at_count  ?? 0),
              headingThereCount: Number(row.heading_there_count ?? 0),
              maybeGoingCount:   Number(row.maybe_going_count   ?? 0),
              totalFriendCount:  Number(row.total_friend_count  ?? 0),
            }
          : emptyFriendMomentumSignals();

        if (!cancelled) {
          setMomentum(calculateFriendMomentum(signals));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          // On error, surface a zero-activity result so callers degrade gracefully
          setMomentum(calculateFriendMomentum(emptyFriendMomentumSignals()));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMomentum();

    return () => {
      cancelled = true;
    };
  }, [venueId, enabled, tick]);

  return { momentum, loading, error, refresh };
}
