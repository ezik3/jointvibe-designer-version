import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, TrendingUp, Percent, ShoppingCart, Sparkles, Crown } from "lucide-react";
import VenueTierBadge from "./VenueTierBadge";
import { type VenueTierName } from "@/hooks/useVenueTier";
import { useTranslation } from 'react-i18next';

interface CompetitionEntry {
  venue_id: string;
  venue_name?: string;
  venue_tier?: VenueTierName;
  metric_value: number;
  rank_in_pool: number;
  is_winner: boolean;
}

interface VenueWeeklyLeaderboardProps {
  venueId: string;
  countryCode: string;
  tierCategory: string;
  sizeBand: string;
  isPioneer: boolean;
  countryName?: string;
}

const COMPETITION_TYPES = [
  { key: "new_customers", label: "New Customers", icon: Users, minThreshold: "3 new customers" },
  { key: "engagement_rate", label: "Engagement", icon: TrendingUp, minThreshold: "10 check-ins" },
  { key: "deals_redeemed", label: "Deals", icon: Sparkles, minThreshold: "1 active deal" },
  { key: "fulfillment_rate", label: "Fulfillment", icon: Percent, minThreshold: "5 orders" },
  { key: "growth_velocity", label: "Growth", icon: ShoppingCart, minThreshold: "5 transactions" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  nightclub_bar_lounge: "Nightclub / Bar",
  restaurant_cafe_bistro: "Restaurant / Café",
  food_truck_street_stall_popup: "Food Truck / Street",
  live_music_entertainment: "Live Music",
  hotel_resort: "Hotel / Resort",
  sports_bar_gaming: "Sports Bar",
};

function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

export default function VenueWeeklyLeaderboard({
  venueId,
  countryCode,
  tierCategory,
  sizeBand,
  isPioneer,
  countryName,
}: VenueWeeklyLeaderboardProps) {
  const { t } = useTranslation('venue');
  const [competitions, setCompetitions] = useState<Record<string, CompetitionEntry[]>>({});
  const [ownRanks, setOwnRanks] = useState<Record<string, CompetitionEntry | null>>({});
  const [poolSize, setPoolSize] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompetitions = async () => {
      const weekStart = getWeekStart();

      // Fetch all competition entries for this pool this week
      const { data, error } = await (supabase as any)
        .from("venue_weekly_competitions")
        .select("*")
        .eq("week_start", weekStart)
        .eq("country_code", countryCode)
        .eq("tier_category", tierCategory)
        .eq("size_band", sizeBand)
        .order("rank_in_pool", { ascending: true });

      if (error) {
        console.error("Error fetching competitions:", error);
        setLoading(false);
        return;
      }

      const byType: Record<string, CompetitionEntry[]> = {};
      const ownByType: Record<string, CompetitionEntry | null> = {};

      for (const type of COMPETITION_TYPES) {
        const entries = (data || [])
          .filter((d: any) => d.competition_type === type.key && d.meets_minimum_threshold)
          .map((d: any) => ({
            venue_id: d.venue_id,
            metric_value: d.metric_value,
            rank_in_pool: d.rank_in_pool,
            is_winner: d.is_winner,
          }));
        byType[type.key] = entries.slice(0, 3);
        ownByType[type.key] = entries.find((e: CompetitionEntry) => e.venue_id === venueId) || null;
      }

      // Get pool size
      const firstEntry = data?.[0];
      if (firstEntry) setPoolSize(firstEntry.pool_size || 0);

      // Try to fetch venue names for top 3
      const allVenueIds = [...new Set((data || []).map((d: any) => d.venue_id as string))] as string[];
      if (allVenueIds.length > 0) {
        const { data: venues } = await supabase
          .from("venues")
          .select("id, name")
          .in("id", allVenueIds.slice(0, 20));

        const { data: tiers } = await (supabase as any)
          .from("venue_tier_scores")
          .select("venue_id, current_tier")
          .in("venue_id", allVenueIds.slice(0, 20));

        const venueMap = new Map((venues || []).map((v: any) => [v.id, v.name]));
        const tierMap = new Map((tiers || []).map((t: any) => [t.venue_id, t.current_tier]));

        for (const key of Object.keys(byType)) {
          byType[key] = byType[key].map((e) => ({
            ...e,
            venue_name: venueMap.get(e.venue_id) || "Venue",
            venue_tier: (tierMap.get(e.venue_id) || "bronze") as VenueTierName,
          }));
        }
        for (const key of Object.keys(ownByType)) {
          if (ownByType[key]) {
            ownByType[key] = {
              ...ownByType[key]!,
              venue_name: venueMap.get(ownByType[key]!.venue_id) || "Your Venue",
              venue_tier: (tierMap.get(ownByType[key]!.venue_id) || "bronze") as VenueTierName,
            };
          }
        }
      }

      setCompetitions(byType);
      setOwnRanks(ownByType);
      setLoading(false);
    };

    fetchCompetitions();
  }, [venueId, countryCode, tierCategory, sizeBand]);

  if (loading) {
    return (
      <div className="h-32 animate-pulse bg-slate-700/30 rounded-lg" />
    );
  }

  // Pioneer card when pool < 5
  if (isPioneer || poolSize < 5) {
    return (
      <Card className="bg-teal-500/10 border-teal-500/20">
        <CardContent className="p-5 text-center space-y-3">
          <Crown className="w-10 h-10 text-teal-400 mx-auto" />
          <h3 className="text-lg font-bold text-teal-300">Pioneer Venue</h3>
          <p className="text-sm text-slate-400">
            You're among the first {CATEGORY_LABELS[tierCategory] || tierCategory} venues in{" "}
            {countryName || countryCode}. Weekly competitions unlock when 5 venues join your category.
          </p>
          <Badge variant="secondary" className="bg-teal-500/20 text-teal-300 border-teal-500/30">
            {poolSize} / 5 venues in pool
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          Weekly Competitions
        </h3>
        <span className="text-[10px] text-slate-500">
          Pool: {poolSize} venues · {CATEGORY_LABELS[tierCategory] || tierCategory} · {sizeBand} · {countryCode}
        </span>
      </div>

      <Tabs defaultValue="new_customers" className="w-full">
        <TabsList className="grid grid-cols-5 h-8 bg-slate-800/50">
          {COMPETITION_TYPES.map((ct) => (
            <TabsTrigger key={ct.key} value={ct.key} className="text-[10px] px-1 py-1 data-[state=active]:bg-slate-700">
              {ct.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {COMPETITION_TYPES.map((ct) => (
          <TabsContent key={ct.key} value={ct.key} className="mt-2">
            <div className="space-y-1.5">
              {/* Top 3 */}
              {(competitions[ct.key] || []).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No qualifying venues yet. Min: {ct.minThreshold} this week.
                </p>
              ) : (
                (competitions[ct.key] || []).map((entry, i) => (
                  <div
                    key={entry.venue_id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                      entry.venue_id === venueId ? "bg-primary/10 border border-primary/20" : "bg-slate-800/40"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-amber-500 text-black" : i === 1 ? "bg-slate-400 text-black" : "bg-amber-700 text-white"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-200 truncate block">
                        {entry.venue_name || "Venue"}
                      </span>
                    </div>
                    {entry.venue_tier && <VenueTierBadge tier={entry.venue_tier} size="sm" />}
                    <span className="text-xs font-mono text-slate-400">
                      {entry.metric_value.toFixed(1)}
                    </span>
                    {entry.is_winner && <Trophy className="w-3 h-3 text-amber-400" />}
                  </div>
                ))
              )}

              {/* Own rank if not in top 3 */}
              {ownRanks[ct.key] && ownRanks[ct.key]!.rank_in_pool > 3 && (
                <>
                  <div className="text-center text-[10px] text-slate-600">···</div>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-slate-600 text-white">
                      {ownRanks[ct.key]!.rank_in_pool}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-200">Your Venue</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      {ownRanks[ct.key]!.metric_value.toFixed(1)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
