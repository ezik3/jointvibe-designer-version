import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserTier, type TierName } from '@/hooks/useUserTier';
import { useLocationActivityScore } from '@/hooks/useLocationActivityScore';
import { getTierDelaySecs } from '@/utils/tierDelays';
import { getMinExposureGuarantee } from '@/utils/activityScore';

export interface ActiveDeal {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_image?: string;
  headline: string;
  discount_text: string;
  description?: string;
  media_url?: string;
  placement_types: string[];
  relevance_score: number;
  linked_vibe_id?: string | null;
}

/**
 * Minimum exposure is now adaptive per mode — see getMinExposureGuarantee().
 * This constant is kept only as an absolute fallback.
 */

/** Deals published within this window (ms) get a delay bypass */
const FRESH_DEAL_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export function useActiveDeals(placementType: string, maxDeals: number = 3) {
  const { user } = useAuth();
  const { currentTier } = useUserTier();
  const { mode: delayMode } = useLocationActivityScore();
  const [deals, setDeals] = useState<ActiveDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayImpressions, setTodayImpressions] = useState(0);

  const fetchDeals = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    try {
      // Get today's impression count for this user
      const today = new Date().toISOString().split('T')[0];
      const { count: totalImpressions } = await (supabase as any)
        .from('user_deal_impressions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('impression_date', today);

      setTodayImpressions(totalImpressions || 0);

      // If at daily cap (relaxed to 20 for beta), return empty
      if ((totalImpressions || 0) >= 20) {
        setDeals([]);
        setLoading(false);
        return;
      }

      // Get venues already shown today for this placement
      const { data: shownToday } = await (supabase as any)
        .from('user_deal_impressions')
        .select('venue_id')
        .eq('user_id', user.id)
        .eq('placement_type', placementType)
        .eq('impression_date', today);

      const shownVenueIds = new Set((shownToday || []).map((r: any) => r.venue_id));

      // Fetch published deals
      const { data: publishedDeals } = await (supabase as any)
        .from('venue_deals_library')
        .select('id, venue_id, headline, discount_text, description, media_url, placement_types, status, last_used_at, linked_vibe_id')
        .eq('status', 'published');

      if (!publishedDeals || publishedDeals.length === 0) {
        setDeals([]);
        setLoading(false);
        return;
      }

      // Get snoozed deals for this user
      const { data: snoozedData } = await (supabase as any)
        .from('user_deal_impressions')
        .select('deal_id, snoozed_until')
        .eq('user_id', user.id)
        .not('snoozed_until', 'is', null);

      const snoozedMap = new Map<string, string>();
      (snoozedData || []).forEach((s: any) => {
        if (s.snoozed_until) snoozedMap.set(s.deal_id, s.snoozed_until);
      });

      const now = new Date();
      const nowISO = now.toISOString();

      // ─── PHASE 1: Basic eligibility (placement, snooze, shown-today) ──────
      const basicEligible = publishedDeals.filter((d: any) => {
        if (shownVenueIds.has(d.venue_id)) return false;
        if (d.placement_types && d.placement_types.length > 0 && !d.placement_types.includes(placementType)) return false;
        const snoozedUntil = snoozedMap.get(d.id);
        if (snoozedUntil && snoozedUntil > nowISO) return false;
        return true;
      });

      // ─── PHASE 2: Apply dynamic tier delay filter ─────────────────────────
      const tierDelaySecs = getTierDelaySecs(currentTier as TierName, delayMode);

      const delayFiltered: any[] = [];
      const delayBlocked: any[] = [];

      basicEligible.forEach((d: any) => {
        const publishedAt = d.last_used_at ? new Date(d.last_used_at).getTime() : 0;
        const dealAge = now.getTime() - publishedAt;

        // FRESH DEAL BOOST: deals published within last 2 min bypass delay
        if (dealAge < FRESH_DEAL_WINDOW_MS) {
          delayFiltered.push(d);
          return;
        }

        // VIBE-CONVERTED PRIORITY: deals linked to a vibe get reduced delay
        if (d.linked_vibe_id) {
          // Apply only 25% of the normal delay for vibe-converted deals
          const reducedDelay = tierDelaySecs * 0.25;
          const visibleAt = publishedAt + reducedDelay * 1000;
          if (now.getTime() >= visibleAt) {
            delayFiltered.push(d);
          } else {
            delayBlocked.push(d);
          }
          return;
        }

        // STANDARD DELAY: apply full tier-based delay
        const visibleAt = publishedAt + tierDelaySecs * 1000;
        if (now.getTime() >= visibleAt) {
          delayFiltered.push(d);
        } else {
          delayBlocked.push(d);
        }
      });

      // ─── PHASE 3: ADAPTIVE MINIMUM EXPOSURE GUARANTEE ────────────────────
      // Minimum varies by mode: LOW=1, GROWTH=2, HIGH=3
      const minExposure = getMinExposureGuarantee(delayMode);
      let finalEligible = delayFiltered;
      if (delayFiltered.length < minExposure && delayBlocked.length > 0) {
        const needed = minExposure - delayFiltered.length;
        // Prioritize vibe-converted and freshest deals
        delayBlocked.sort((a: any, b: any) => {
          // Vibe-linked first
          if (a.linked_vibe_id && !b.linked_vibe_id) return -1;
          if (!a.linked_vibe_id && b.linked_vibe_id) return 1;
          // Then newest first
          return new Date(b.last_used_at || 0).getTime() - new Date(a.last_used_at || 0).getTime();
        });
        finalEligible = [...delayFiltered, ...delayBlocked.slice(0, needed)];
      }

      // ─── PHASE 4: Venue info + scoring (unchanged logic) ─────────────────
      const venueIds = [...new Set(finalEligible.map((d: any) => d.venue_id))] as string[];

      if (venueIds.length === 0) {
        setDeals([]);
        setLoading(false);
        return;
      }

      const { data: venues } = await supabase
        .from('venues')
        .select('id, name, image_url')
        .in('id', venueIds);

      const venueMap = new Map((venues || []).map(v => [v.id, v]));

      // Get user's vibe preferences for relevance scoring
      const { data: userPrefs } = await (supabase as any)
        .from('user_vibe_preferences')
        .select('tag_name, total_weight')
        .eq('user_id', user.id);

      const prefMap = new Map((userPrefs || []).map((p: any) => [p.tag_name, p.total_weight]));

      // Get venue vibe tags for matching
      const { data: venueTags } = await (supabase as any)
        .from('venue_vibe_tags')
        .select('venue_id, tag_name')
        .in('venue_id', venueIds);

      const venueTagMap = new Map<string, string[]>();
      (venueTags || []).forEach((vt: any) => {
        if (!venueTagMap.has(vt.venue_id)) venueTagMap.set(vt.venue_id, []);
        venueTagMap.get(vt.venue_id)!.push(vt.tag_name);
      });

      // Score and sort
      const scored: ActiveDeal[] = finalEligible.map((d: any) => {
        const venue = venueMap.get(d.venue_id);
        const tags = venueTagMap.get(d.venue_id) || [];
        let score = 0;
        tags.forEach(tag => { score += (Number(prefMap.get(tag)) || 0); });

        return {
          id: d.id,
          venue_id: d.venue_id,
          venue_name: venue?.name || 'Unknown Venue',
          venue_image: venue?.image_url,
          headline: d.headline || '',
          discount_text: d.discount_text || '',
          description: d.description,
          media_url: d.media_url,
          placement_types: d.placement_types || [],
          relevance_score: score,
          linked_vibe_id: d.linked_vibe_id,
        };
      });

      scored.sort((a, b) => b.relevance_score - a.relevance_score);
      setDeals(scored.slice(0, maxDeals));
    } catch (err) {
      console.error('Failed to fetch active deals:', err);
    } finally {
      setLoading(false);
    }
  }, [user, placementType, maxDeals, currentTier, delayMode]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const recordImpression = async (dealId: string, venueId: string) => {
    if (!user) return;
    await (supabase as any)
      .from('user_deal_impressions')
      .insert({
        user_id: user.id,
        deal_id: dealId,
        venue_id: venueId,
        placement_type: placementType,
      })
      .catch(() => {}); // Ignore duplicates
  };

  const snoozeDeal = async (dealId: string, venueId: string) => {
    if (!user) return;
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await (supabase as any)
      .from('user_deal_impressions')
      .upsert({
        user_id: user.id,
        deal_id: dealId,
        venue_id: venueId,
        placement_type: placementType,
        snoozed_until: snoozedUntil,
      }, { onConflict: 'user_id,deal_id,placement_type,impression_date' })
      .catch(() => {});
    // Remove from local state immediately
    setDeals(prev => prev.filter(d => d.id !== dealId));
  };

  const redeemDeal = async (dealId: string, venueId: string): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    
    const { error } = await (supabase as any)
      .from('venue_deal_redemptions')
      .insert({
        deal_id: dealId,
        venue_id: venueId,
        user_id: user.id,
        placement_type: placementType,
        redemption_code: code,
      });

    if (error) throw error;
    return code;
  };

  return { deals, loading, todayImpressions, recordImpression, redeemDeal, snoozeDeal, refetch: fetchDeals };
}
