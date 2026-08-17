import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type TierName = "member" | "bronze" | "silver" | "gold" | "diamond" | "platinum";
export type ImpactLabel = "emerging" | "growing" | "strong" | "exceptional";
export type GeoReach = "suburb" | "city" | "state" | "country" | "global";

export interface UserTierData {
  currentTier: TierName;
  jointScore: number;
  vibeScore: number;
  reachScore: number;
  impactLabel: ImpactLabel;
  geographicReach: GeoReach;
  followerCount: number;
  tierAtRisk: boolean;
  streakWeeks: number;
  loading: boolean;
}

const TIER_ORDER: TierName[] = ["member", "bronze", "silver", "gold", "diamond", "platinum"];
const TIER_THRESHOLDS = [0, 150, 500, 1000, 3000, 8000];

const EMPTY_TIER_DATA: Omit<UserTierData, "loading"> = {
  currentTier: "member",
  jointScore: 0,
  vibeScore: 0,
  reachScore: 0,
  impactLabel: "emerging",
  geographicReach: "suburb",
  followerCount: 0,
  tierAtRisk: false,
  streakWeeks: 0,
};

const UserTierContext = createContext<UserTierData>({ ...EMPTY_TIER_DATA, loading: false });

export function getNextTierThreshold(tier: TierName): number | null {
  const idx = TIER_ORDER.indexOf(tier);
  return idx < TIER_ORDER.length - 1 ? TIER_THRESHOLDS[idx + 1] : null;
}

export function getTierIndex(tier: TierName): number {
  return TIER_ORDER.indexOf(tier);
}

const toTierData = (row: Record<string, unknown>): Omit<UserTierData, "loading"> => ({
  currentTier: row.current_tier as TierName,
  jointScore: Number(row.joint_score) || 0,
  vibeScore: Number(row.vibe_score) || 0,
  reachScore: Number(row.reach_score) || 0,
  impactLabel: row.venue_impact_label as ImpactLabel,
  geographicReach: row.geographic_reach as GeoReach,
  followerCount: Number(row.follower_count_snapshot) || 0,
  tierAtRisk: Boolean(row.tier_at_risk),
  streakWeeks: Number(row.streak_weeks) || 0,
});

function useUserTierSubscription(): UserTierData {
  const { user } = useAuth();
  const [data, setData] = useState<Omit<UserTierData, "loading">>(EMPTY_TIER_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    if (!user?.id) {
      setData(EMPTY_TIER_DATA);
      setLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setLoading(true);

    const fetchTier = async () => {
      try {
        const { data: row } = await supabase
          .from("user_tiers")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (isCurrent && row) {
          setData(toTierData(row as Record<string, unknown>));
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    void fetchTier();

    // Supabase 2.110 reuses same-topic channels. The effect can replay before
    // async cleanup finishes, so every subscription gets its own topic.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      channel = supabase
        .channel(`user_tier_${user.id}_${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "user_tiers",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (isCurrent) setData(toTierData(payload.new as Record<string, unknown>));
          },
        )
        .subscribe();
    } catch (error) {
      console.error("[useUserTier] Failed to subscribe to tier updates:", error);
    }

    return () => {
      isCurrent = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { ...data, loading };
}

export function UserTierProvider({ children }: { children: ReactNode }) {
  const value = useUserTierSubscription();
  return createElement(UserTierContext.Provider, { value }, children);
}

export function useUserTier(): UserTierData {
  return useContext(UserTierContext);
}

/** Fire-and-forget helper to record a tier event */
export async function recordTierEvent(
  userId: string,
  actionType: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await supabase.functions.invoke("record-tier-event", {
      body: { user_id: userId, action_type: actionType, metadata },
    });
  } catch (err) {
    console.error("recordTierEvent failed:", err);
  }
}
