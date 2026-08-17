/**
 * Hook to calculate the dynamic activity score for the current user's location.
 * 
 * Uses hierarchical fallback: suburb → city → state → country → global.
 * Queries recently active users (last 15 min) and recently published deals (last 60 min).
 * 
 * Caches result for 60 seconds to avoid repeated queries.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculateActivityScore,
  getDelayMode,
  hasSufficientData,
  type DelayMode,
} from '@/utils/activityScore';
import { getMaxDelayForMode } from '@/utils/tierDelays';

interface LocationActivityResult {
  mode: DelayMode;
  activityScore: number;
  maxDelayForLowestTier: number;
  loading: boolean;
}

// Module-level cache
let cachedResult: { mode: DelayMode; score: number; maxDelay: number; ts: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

export function useLocationActivityScore(): LocationActivityResult {
  const { user } = useAuth();
  const [result, setResult] = useState<Omit<LocationActivityResult, 'loading'>>({
    mode: 'low',
    activityScore: 0,
    maxDelayForLowestTier: 60,
  });
  const [loading, setLoading] = useState(true);

  const compute = useCallback(async () => {
    // Check cache first
    if (cachedResult && Date.now() - cachedResult.ts < CACHE_TTL_MS) {
      setResult({
        mode: cachedResult.mode,
        activityScore: cachedResult.score,
        maxDelayForLowestTier: cachedResult.maxDelay,
      });
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Get user's location from profile
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('suburb, city, state, country_code')
        .eq('user_id', user.id)
        .maybeSingle();

      const locationLevels: { field: string; value: string | null }[] = [
        { field: 'suburb', value: profile?.suburb ?? null },
        { field: 'city', value: profile?.city ?? null },
        { field: 'state', value: profile?.state ?? null },
        { field: 'country_code', value: profile?.country_code ?? null },
      ];

      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      let finalScore = 0;
      let found = false;

      for (const level of locationLevels) {
        if (!level.value) continue;

        // Count recently active users at this level
        // NOTE: Currently using `updated_at` as a proxy for activity.
        // When a dedicated activity field is added (e.g. `last_active_at`,
        // `last_seen_at`, or session-based tracking), update the field
        // name in ACTIVITY_TIMESTAMP_FIELD below. No other changes needed.
        const ACTIVITY_TIMESTAMP_FIELD = 'updated_at';
        const { count: activeUsers } = await (supabase as any)
          .from('customer_profiles')
          .select('*', { count: 'exact', head: true })
          .eq(level.field, level.value)
          .gte(ACTIVITY_TIMESTAMP_FIELD, fifteenMinAgo);

        // Count recent deals from venues in this location
        const venueField = level.field === 'country_code' ? 'country_code' : level.field;
        const { data: venueIds } = await (supabase as any)
          .from('venues')
          .select('id')
          .eq(venueField, level.value);

        let activeDeals = 0;
        if (venueIds && venueIds.length > 0) {
          const ids = venueIds.map((v: any) => v.id);
          const { count } = await (supabase as any)
            .from('venue_deals_library')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published')
            .gte('last_used_at', oneHourAgo)
            .in('venue_id', ids);
          activeDeals = count || 0;
        }

        if (hasSufficientData(activeUsers || 0, activeDeals)) {
          finalScore = calculateActivityScore(activeUsers || 0, activeDeals);
          found = true;
          break;
        }
      }

      // If no level has sufficient data, force LOW mode
      if (!found) {
        finalScore = 0;
      }

      const mode = getDelayMode(finalScore);
      const maxDelay = getMaxDelayForMode(mode);

      // Update cache
      cachedResult = { mode, score: finalScore, maxDelay, ts: Date.now() };

      setResult({ mode, activityScore: finalScore, maxDelayForLowestTier: maxDelay });
    } catch (err) {
      console.error('Activity score calculation failed:', err);
      // Default to LOW mode on error (safest for launch)
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { compute(); }, [compute]);

  return { ...result, loading };
}
