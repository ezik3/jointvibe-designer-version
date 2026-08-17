import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VibeCreditRow {
  id: string;
  venue_id: string;
  credit_type: string; // 'free_weekly' | 'purchased'
  reach_tier: string;
  credits_remaining: number;
  last_weekly_refresh_at: string | null;
}

export function useVenueVibeCredits(venueId: string | null) {
  const [credits, setCredits] = useState<VibeCreditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!venueId) return;
    try {
      const { data, error } = await supabase
        .from('venue_vibe_credits')
        .select('*')
        .eq('venue_id', venueId);

      if (error) throw error;
      setCredits(data || []);
    } catch (err) {
      console.error('Error fetching vibe credits:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  // Weekly refresh logic for free_weekly local vibes
  const refreshFreeWeeklyVibes = useCallback(async () => {
    if (!venueId) return;

    const freeRow = credits.find(c => c.credit_type === 'free_weekly' && c.reach_tier === 'local');

    if (!freeRow) {
      // Create the free weekly row if it doesn't exist
      const { error } = await supabase
        .from('venue_vibe_credits')
        .insert({
          venue_id: venueId,
          credit_type: 'free_weekly',
          reach_tier: 'local',
          credits_remaining: 5,
          last_weekly_refresh_at: new Date().toISOString(),
        });
      if (!error) await fetchCredits();
      return;
    }

    // Check if 7 days have passed since last refresh
    const lastRefresh = freeRow.last_weekly_refresh_at
      ? new Date(freeRow.last_weekly_refresh_at).getTime()
      : 0;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (Date.now() - lastRefresh >= sevenDaysMs) {
      // Reset to 5, not stack
      const { error } = await supabase
        .from('venue_vibe_credits')
        .update({
          credits_remaining: 5,
          last_weekly_refresh_at: new Date().toISOString(),
        })
        .eq('id', freeRow.id);
      if (!error) await fetchCredits();
    }
  }, [venueId, credits, fetchCredits]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Run refresh check after credits are loaded
  useEffect(() => {
    if (!loading && venueId && credits.length >= 0) {
      refreshFreeWeeklyVibes();
    }
    // Only run when loading transitions to false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, venueId]);

  // Spend a vibe credit: free first (for local), then paid
  const spendVibeCredit = useCallback(async (reachTier: string): Promise<boolean> => {
    if (!venueId) return false;

    // For local reach: try free_weekly first
    if (reachTier === 'local') {
      const freeRow = credits.find(
        c => c.credit_type === 'free_weekly' && c.reach_tier === 'local' && c.credits_remaining > 0
      );
      if (freeRow) {
        const { error } = await supabase
          .from('venue_vibe_credits')
          .update({ credits_remaining: freeRow.credits_remaining - 1 })
          .eq('id', freeRow.id);
        if (!error) {
          await fetchCredits();
          return true;
        }
      }
    }

    // Fall back to purchased credits for the requested tier
    const paidRow = credits.find(
      c => c.credit_type === 'purchased' && c.reach_tier === reachTier && c.credits_remaining > 0
    );
    if (paidRow) {
      const { error } = await supabase
        .from('venue_vibe_credits')
        .update({ credits_remaining: paidRow.credits_remaining - 1 })
        .eq('id', paidRow.id);
      if (!error) {
        await fetchCredits();
        return true;
      }
    }

    return false; // No credits available
  }, [venueId, credits, fetchCredits]);

  // Aggregated totals
  const freeLocalCredits = credits
    .filter(c => c.credit_type === 'free_weekly' && c.reach_tier === 'local')
    .reduce((sum, c) => sum + c.credits_remaining, 0);

  const paidCreditsByTier = (tier: string) =>
    credits
      .filter(c => c.credit_type === 'purchased' && c.reach_tier === tier)
      .reduce((sum, c) => sum + c.credits_remaining, 0);

  const totalVibeCredits = credits.reduce((sum, c) => sum + c.credits_remaining, 0);

  return {
    credits,
    loading,
    freeLocalCredits,
    paidCreditsByTier,
    totalVibeCredits,
    spendVibeCredit,
    fetchCredits,
  };
}
