import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";

export type VenueTierName = "bronze" | "silver" | "gold" | "diamond" | "platinum";

export interface VenueTierData {
  currentTier: VenueTierName;
  compositeScore: number;
  rawScoreBeforeMultiplier: number;
  sizeMultiplier: number;
  launchpadActive: boolean;
  launchpadMultiplierApplied: number;
  returnRateScore: number;
  utilizationScore: number;
  engagementScore: number;
  velocityScore: number;
  fulfillmentScore: number;
  participationScore: number;
  isTierAtRisk: boolean;
  atRiskSince: string | null;
  gracePeriodEndsAt: string | null;
  scoreFrozen: boolean;
  bonusPoints: number;
  tierCategory: string;
  sizeBand: string;
  countryCode: string;
  countryName: string;
  city: string | null;
  isFounderVenue: boolean;
  launchpadModeEndsAt: string | null;
  isPioneer: boolean;
  loading: boolean;
}

const VENUE_TIER_ORDER: VenueTierName[] = ["bronze", "silver", "gold", "diamond", "platinum"];
const VENUE_TIER_THRESHOLDS = [0, 300, 600, 800, 900];

export function getVenueTierIndex(tier: VenueTierName): number {
  return VENUE_TIER_ORDER.indexOf(tier);
}

export function getNextVenueTierThreshold(tier: VenueTierName): number | null {
  const idx = VENUE_TIER_ORDER.indexOf(tier);
  if (idx < VENUE_TIER_ORDER.length - 1) return VENUE_TIER_THRESHOLDS[idx + 1];
  return null;
}

export function getVenueTierThreshold(tier: VenueTierName): number {
  const idx = VENUE_TIER_ORDER.indexOf(tier);
  return VENUE_TIER_THRESHOLDS[idx] ?? 0;
}

const defaultData: Omit<VenueTierData, "loading"> = {
  currentTier: "bronze",
  compositeScore: 0,
  rawScoreBeforeMultiplier: 0,
  sizeMultiplier: 1.0,
  launchpadActive: false,
  launchpadMultiplierApplied: 1.0,
  returnRateScore: 0,
  utilizationScore: 0,
  engagementScore: 0,
  velocityScore: 0,
  fulfillmentScore: 0,
  participationScore: 0,
  isTierAtRisk: false,
  atRiskSince: null,
  gracePeriodEndsAt: null,
  scoreFrozen: false,
  bonusPoints: 0,
  tierCategory: "",
  sizeBand: "",
  countryCode: "",
  countryName: "",
  city: null,
  isFounderVenue: false,
  launchpadModeEndsAt: null,
  isPioneer: false,
};

export function useVenueTier(venueId: string | null): VenueTierData & { loading: boolean } {
  const [data, setData] = useState<Omit<VenueTierData, "loading">>(defaultData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueId) {
      setLoading(false);
      return;
    }

    const fetchTier = async () => {
      // Fetch scores
      const { data: scores } = await supabase
        .from("venue_tier_scores")
        .select("*")
        .eq("venue_id", venueId)
        .maybeSingle();

      // Fetch classification
      const { data: classification } = await supabase
        .from("venue_classifications")
        .select("*")
        .eq("venue_id", venueId)
        .maybeSingle();

      // Fetch pioneer status
      const { data: pioneer } = await supabase
        .from("venue_pioneer_status")
        .select("*")
        .eq("venue_id", venueId)
        .eq("is_active", true)
        .maybeSingle();

      if (scores) {
        setData({
          currentTier: (scores as any).current_tier as VenueTierName,
          compositeScore: (scores as any).composite_score ?? 0,
          rawScoreBeforeMultiplier: (scores as any).raw_score_before_multiplier ?? 0,
          sizeMultiplier: (scores as any).size_multiplier ?? 1.0,
          launchpadActive: (scores as any).launchpad_active ?? false,
          launchpadMultiplierApplied: (scores as any).launchpad_multiplier_applied ?? 1.0,
          returnRateScore: (scores as any).return_rate_score ?? 0,
          utilizationScore: (scores as any).utilization_score ?? 0,
          engagementScore: (scores as any).engagement_score ?? 0,
          velocityScore: (scores as any).velocity_score ?? 0,
          fulfillmentScore: (scores as any).fulfillment_score ?? 0,
          participationScore: (scores as any).participation_score ?? 0,
          isTierAtRisk: (scores as any).is_tier_at_risk ?? false,
          atRiskSince: (scores as any).at_risk_since,
          gracePeriodEndsAt: (scores as any).grace_period_ends_at,
          scoreFrozen: (scores as any).score_frozen ?? false,
          bonusPoints: (scores as any).bonus_points ?? 0,
          tierCategory: (classification as any)?.tier_category ?? "",
          sizeBand: (classification as any)?.size_band ?? "",
          countryCode: (classification as any)?.country_code ?? "",
          countryName: (classification as any)?.country_name ?? "",
          city: (classification as any)?.city ?? null,
          isFounderVenue: (classification as any)?.is_founder_venue ?? false,
          launchpadModeEndsAt: (classification as any)?.launchpad_mode_ends_at ?? null,
          isPioneer: !!pioneer,
        });
      }
      setLoading(false);
    };

    fetchTier();

    // Realtime subscription on venue_tier_scores
    const channel = supabase
      .channel(createRealtimeChannelTopic(`venue_tier_${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "venue_tier_scores",
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setData((prev) => ({
            ...prev,
            currentTier: row.current_tier as VenueTierName,
            compositeScore: row.composite_score ?? 0,
            rawScoreBeforeMultiplier: row.raw_score_before_multiplier ?? 0,
            sizeMultiplier: row.size_multiplier ?? 1.0,
            launchpadActive: row.launchpad_active ?? false,
            launchpadMultiplierApplied: row.launchpad_multiplier_applied ?? 1.0,
            returnRateScore: row.return_rate_score ?? 0,
            utilizationScore: row.utilization_score ?? 0,
            engagementScore: row.engagement_score ?? 0,
            velocityScore: row.velocity_score ?? 0,
            fulfillmentScore: row.fulfillment_score ?? 0,
            participationScore: row.participation_score ?? 0,
            isTierAtRisk: row.is_tier_at_risk ?? false,
            atRiskSince: row.at_risk_since,
            gracePeriodEndsAt: row.grace_period_ends_at,
            scoreFrozen: row.score_frozen ?? false,
            bonusPoints: row.bonus_points ?? 0,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId]);

  return { ...data, loading };
}

/** Fire-and-forget helper to update venue score counter */
export async function updateVenueScoreCounter(
  venueId: string,
  eventType: string,
  metadata?: Record<string, any>
) {
  try {
    await supabase.functions.invoke("update-venue-score-counter", {
      body: { venue_id: venueId, event_type: eventType, metadata },
    });
  } catch (err) {
    console.error("updateVenueScoreCounter failed:", err);
  }
}
