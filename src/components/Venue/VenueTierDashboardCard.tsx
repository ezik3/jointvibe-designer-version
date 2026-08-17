import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Rocket, MapPin, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import VenueTierBadge from "./VenueTierBadge";
import VenueWeeklyLeaderboard from "./VenueWeeklyLeaderboard";
import { type VenueTierData, type VenueTierName, getNextVenueTierThreshold, getVenueTierThreshold } from "@/hooks/useVenueTier";
import { useTranslation } from 'react-i18next';

interface VenueTierDashboardCardProps {
  tierData: VenueTierData & { loading: boolean };
  venueId: string;
}

const METRIC_LABELS: { key: string; label: string; hint: string }[] = [
  { key: "returnRateScore", label: "Return Rate", hint: "More returning customers boosts this" },
  { key: "utilizationScore", label: "Platform Use", hint: "Use more features (POS, KDS, deals...)" },
  { key: "engagementScore", label: "Engagement", hint: "Get more fist bumps on tagged posts" },
  { key: "velocityScore", label: "Growth", hint: "Grow JVC revenue period over period" },
  { key: "fulfillmentScore", label: "Fulfillment", hint: "Complete orders faster" },
  { key: "participationScore", label: "Community", hint: "Run deals, go live, send push" },
];

const SIZE_LABELS: Record<string, string> = {
  micro: "Micro · 2.5×",
  small: "Small · 2.0×",
  medium: "Medium · 1.5×",
  large: "Large · 1.0×",
  major: "Major · 0.75×",
};

const CATEGORY_LABELS: Record<string, string> = {
  nightclub_bar_lounge: "Nightclub / Bar",
  restaurant_cafe_bistro: "Restaurant / Café",
  food_truck_street_stall_popup: "Food Truck / Street",
  live_music_entertainment: "Live Music",
  hotel_resort: "Hotel / Resort",
  sports_bar_gaming: "Sports Bar",
};

export default function VenueTierDashboardCard({ tierData, venueId }: VenueTierDashboardCardProps) {
  const { t } = useTranslation('venue');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  if (tierData.loading) {
    return (
      <Card className="bg-slate-800/80 backdrop-blur-xl border-slate-700">
        <CardContent className="p-6">
          <div className="h-32 animate-pulse bg-slate-700/50 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!tierData.tierCategory) return null; // not classified yet

  const nextThreshold = getNextVenueTierThreshold(tierData.currentTier);
  const currentThreshold = getVenueTierThreshold(tierData.currentTier);
  const progressToNext = nextThreshold
    ? ((tierData.compositeScore - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    : 100;

  const launchpadDaysLeft = tierData.launchpadModeEndsAt
    ? Math.max(0, Math.ceil((new Date(tierData.launchpadModeEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const graceDaysLeft = tierData.gracePeriodEndsAt
    ? Math.max(0, Math.ceil((new Date(tierData.gracePeriodEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="bg-slate-800/80 backdrop-blur-xl border-slate-700 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Venue Tier
            </CardTitle>
            <VenueTierBadge tier={tierData.currentTier} size="lg" isFounder={tierData.isFounderVenue} />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Score */}
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-3xl font-bold text-white">{tierData.compositeScore}</span>
              <span className="text-sm text-slate-400">/ 1000</span>
            </div>
            {nextThreshold && (
              <>
                <Progress value={Math.min(100, Math.max(0, progressToNext))} className="h-2 bg-slate-700" />
                <p className="text-xs text-slate-400 mt-1">
                  {nextThreshold - tierData.compositeScore} pts to {
                    (["bronze", "silver", "gold", "diamond", "platinum"] as VenueTierName[])
                      [["bronze", "silver", "gold", "diamond", "platinum"].indexOf(tierData.currentTier) + 1]
                  }
                </p>
              </>
            )}
          </div>

          {/* Pool */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <MapPin className="w-3 h-3" />
            <span>
              {CATEGORY_LABELS[tierData.tierCategory] || tierData.tierCategory} · {tierData.sizeBand} · {tierData.countryCode}
            </span>
          </div>

          {/* Size Multiplier */}
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
            {SIZE_LABELS[tierData.sizeBand] || tierData.sizeBand} multiplier
          </Badge>

          {/* Launchpad Banner */}
          {tierData.launchpadActive && launchpadDaysLeft > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Rocket className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-300">
                🚀 Launchpad Mode — {launchpadDaysLeft} days remaining · 1.5× bonus active
              </span>
            </div>
          )}

          {/* At Risk Warning */}
          {tierData.isTierAtRisk && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-300">
                Your {tierData.currentTier.charAt(0).toUpperCase() + tierData.currentTier.slice(1)} status is at risk — {graceDaysLeft} days to recover
              </span>
            </div>
          )}

          {/* Pioneer */}
          {tierData.isPioneer && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
              <span className="text-teal-300 text-xs">
                👑 Pioneer — first {CATEGORY_LABELS[tierData.tierCategory] || tierData.tierCategory} in {tierData.countryName || tierData.countryCode}
              </span>
            </div>
          )}

          {/* Metric Bars */}
          <div className="space-y-2 pt-2 border-t border-slate-700">
            {METRIC_LABELS.map((m) => {
              const val = (tierData as any)[m.key] as number;
              return (
                <div key={m.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{m.label}</span>
                    <span className="text-slate-400">{val}/100</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-primary/60 rounded-full transition-all"
                      style={{ width: `${val}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{m.hint}</p>
                </div>
              );
            })}
          </div>

          {/* Weekly Competition Toggle */}
          {tierData.tierCategory && (
            <div className="pt-2 border-t border-slate-700">
              <button
                onClick={() => setShowLeaderboard(!showLeaderboard)}
                className="flex items-center justify-between w-full text-xs text-slate-300 hover:text-white transition-colors py-1"
              >
                <span className="flex items-center gap-2">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  Weekly Competitions
                </span>
                {showLeaderboard ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showLeaderboard && (
                <div className="mt-3">
                  <VenueWeeklyLeaderboard
                    venueId={venueId}
                    countryCode={tierData.countryCode}
                    tierCategory={tierData.tierCategory}
                    sizeBand={tierData.sizeBand}
                    isPioneer={tierData.isPioneer}
                    countryName={tierData.countryName}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
