/**
 * useVenueEnergy — Venue Energy Data Fetching Hook
 *
 * Fetches aggregate presence and intent signals for a venue and computes
 * its energy score + state using the pure `calculateVenueEnergy` utility.
 *
 * Privacy rules enforced here:
 * - Uses `get_venue_interest_signal_counts` (SECURITY DEFINER RPC) to count
 *   ALL check-ins including private ones — without exposing user identity.
 * - Arrival velocity is a head-count query only (no row data returned).
 * - No user IDs, handles, or profile data ever flow through this hook.
 * - The energy result contains only aggregate numbers and a state label.
 *
 * Isolation rules:
 * - This hook does NOT interact with moderation, bans, caution alerts,
 *   incident timelines, or operational notifications.
 * - It does NOT modify any presence or intent state.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateVenueEnergy,
  VenueEnergyResult,
  VenueEnergySignals,
} from "@/utils/venueEnergyScoring";

export interface UseVenueEnergyOptions {
  /** The venue to score. Pass null/undefined to skip fetching. */
  venueId: string | null | undefined;
  /** Set false to pause fetching without unmounting. Defaults to true. */
  enabled?: boolean;
}

export interface UseVenueEnergyReturn {
  /** Computed energy result, or null if not yet loaded. */
  energy: VenueEnergyResult | null;
  loading: boolean;
  error: Error | null;
  /** Manually re-fetch the energy signals. */
  refresh: () => void;
}

/** How far back to look for arrival velocity (milliseconds). */
const RECENT_ARRIVAL_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

export function useVenueEnergy({
  venueId,
  enabled = true,
}: UseVenueEnergyOptions): UseVenueEnergyReturn {
  const [energy, setEnergy] = useState<VenueEnergyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!venueId || !enabled) {
      setEnergy(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchEnergy() {
      setLoading(true);
      setError(null);

      try {
        // ----------------------------------------------------------------
        // 1. Aggregate signal counts — single SECURITY DEFINER RPC call.
        //    Counts ALL check-ins (public + private) and active intent
        //    signals. No user identity returned.
        // ----------------------------------------------------------------
        const { data: signalData, error: signalError } = await (supabase as any).rpc(
          "get_venue_interest_signal_counts",
          { p_venue_id: venueId },
        );

        if (signalError) throw signalError;

        const row = Array.isArray(signalData) ? signalData[0] : signalData;

        // ----------------------------------------------------------------
        // 2. Arrival velocity — count of check-ins created in the last
        //    60 minutes. This is a HEAD count query (no row data).
        //    RLS applies here; counts public arrivals as a velocity proxy.
        //    Private check-in totals are already captured in checkedInCount
        //    above via the SECURITY DEFINER RPC.
        // ----------------------------------------------------------------
        const windowStart = new Date(Date.now() - RECENT_ARRIVAL_WINDOW_MS).toISOString();

        const { count: recentArrivalCount, error: arrivalError } = await supabase
          .from("check_ins")
          .select("id", { count: "exact", head: true })
          .eq("venue_id", venueId)
          .gte("created_at", windowStart)
          .is("checked_out_at", null);

        if (arrivalError) throw arrivalError;

        // ----------------------------------------------------------------
        // 3. Assemble signals and compute energy.
        //    insideProofEventCount starts at 0 in this foundation.
        //    Future: add a server-side SECURITY DEFINER aggregate RPC that
        //    counts venue_inside_proof_events in a time window without
        //    exposing user identity — then wire it here.
        // ----------------------------------------------------------------
        const signals: VenueEnergySignals = {
          checkedInCount:      Number(row?.currently_at_count   ?? 0),
          headingThereCount:   Number(row?.heading_there_count  ?? 0),
          maybeGoingCount:     Number(row?.maybe_going_count    ?? 0),
          recentArrivalCount:  recentArrivalCount ?? 0,
          insideProofEventCount: 0,
        };

        if (!cancelled) {
          setEnergy(calculateVenueEnergy(signals));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEnergy();

    return () => {
      cancelled = true;
    };
  }, [venueId, enabled, tick]);

  return { energy, loading, error, refresh };
}
