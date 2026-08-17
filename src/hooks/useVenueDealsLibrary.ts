import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VenueDeal {
  id: string;
  venue_id: string;
  headline: string | null;
  description: string | null;
  discount_text: string | null;
  media_url: string | null;
  media_type: string | null;
  reach_tier: string | null;
  placement_types: string[] | null;
  status: string;
  linked_vibe_id: string | null;
  created_at: string;
  last_used_at: string | null;
  scheduled_for: string | null;
  expires_at: string | null;
}

export function useVenueDealsLibrary(venueId: string | null) {
  const [deals, setDeals] = useState<VenueDeal[]>([]);
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchDeals = useCallback(async () => {
    if (!venueId) {
      setDeals([]);
      setLoading(false);
      return;
    }
    const { data } = await (supabase as any)
      .from('venue_deals_library')
      .select('*')
      .eq('venue_id', venueId)
      .order('last_used_at', { ascending: false, nullsFirst: false });
    if (data) setDeals(data);
    setLoading(false);
  }, [venueId]);

  const fetchCredits = useCallback(async () => {
    if (!venueId) {
      setCredits({});
      return;
    }
    const { data } = await (supabase as any)
      .from('venue_push_credits')
      .select('reach_tier, credits_remaining, credit_type')
      .eq('venue_id', venueId);
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((r: any) => {
        map[r.reach_tier] = (map[r.reach_tier] || 0) + r.credits_remaining;
      });
      setCredits(map);
    }
  }, [venueId]);

  useEffect(() => {
    fetchDeals();
    fetchCredits();
  }, [fetchDeals, fetchCredits]);

  const createDeal = async (deal: Partial<VenueDeal>) => {
    if (!venueId) return null;
    const { data, error } = await (supabase as any)
      .from('venue_deals_library')
      .insert({ 
        ...deal, 
        venue_id: venueId,
        placement_types: deal.placement_types || ['feed'],
      })
      .select()
      .single();
    if (error) throw error;
    await fetchDeals();
    return data;
  };

  const updateDeal = async (dealId: string, updates: Partial<VenueDeal>) => {
    const { error } = await (supabase as any)
      .from('venue_deals_library')
      .update(updates)
      .eq('id', dealId);
    if (error) throw error;
    await fetchDeals();
  };

  const publishDeal = async (dealId: string, reachTier?: string) => {
    // Get tier from param, or query DB directly (avoid stale React state)
    let tier = reachTier || 'local';
    if (!reachTier) {
      const { data: freshDeal } = await (supabase as any)
        .from('venue_deals_library')
        .select('reach_tier')
        .eq('id', dealId)
        .single();
      if (freshDeal?.reach_tier) tier = freshDeal.reach_tier;
    }

    // Query credit rows — try specific tier first
    let { data: creditRows } = await (supabase as any)
      .from('venue_push_credits')
      .select('id, credits_remaining, reach_tier')
      .eq('venue_id', venueId)
      .eq('reach_tier', tier)
      .gt('credits_remaining', 0)
      .order('updated_at', { ascending: true })
      .limit(1);

    // Fallback: if no credits for specific tier, try ANY tier
    if (!creditRows?.length) {
      ({ data: creditRows } = await (supabase as any)
        .from('venue_push_credits')
        .select('id, credits_remaining, reach_tier')
        .eq('venue_id', venueId)
        .gt('credits_remaining', 0)
        .order('updated_at', { ascending: true })
        .limit(1));
    }

    const creditRow = creditRows?.[0];
    if (!creditRow) throw new Error('No credits available');

    await (supabase as any)
      .from('venue_push_credits')
      .update({ credits_remaining: creditRow.credits_remaining - 1, updated_at: new Date().toISOString() })
      .eq('id', creditRow.id);

    // Publish deal
    await (supabase as any)
      .from('venue_deals_library')
      .update({ status: 'published', last_used_at: new Date().toISOString() })
      .eq('id', dealId);

    await Promise.all([fetchDeals(), fetchCredits()]);
  };

  const cloneDeal = async (dealId: string) => {
    const original = deals.find(d => d.id === dealId);
    if (!original) return null;
    return createDeal({
      headline: original.headline,
      description: original.description,
      discount_text: original.discount_text,
      media_url: original.media_url,
      media_type: original.media_type,
      reach_tier: original.reach_tier,
      placement_types: original.placement_types,
      status: 'draft',
    });
  };

  return { deals, credits, loading, fetchDeals, createDeal, updateDeal, publishDeal, cloneDeal, fetchCredits };
}
