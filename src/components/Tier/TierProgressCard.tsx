import { useUserTier, getNextTierThreshold, type TierName } from "@/hooks/useUserTier";
import TierBadge from "./TierBadge";
import { Progress } from "@/components/ui/progress";
import { MapPin, TrendingUp, AlertTriangle, Globe, Building, Landmark, Map, Crown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

const REACH_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  suburb: { label: "Suburb", icon: <Building className="w-3.5 h-3.5" /> },
  city: { label: "City", icon: <Landmark className="w-3.5 h-3.5" /> },
  state: { label: "State", icon: <Map className="w-3.5 h-3.5" /> },
  country: { label: "Country", icon: <MapPin className="w-3.5 h-3.5" /> },
  global: { label: "Global", icon: <Globe className="w-3.5 h-3.5" /> },
};

const IMPACT_COLORS: Record<string, string> = {
  emerging: "text-zinc-400",
  growing: "text-emerald-400",
  strong: "text-cyan-400",
  exceptional: "text-amber-400",
};

const TIER_BORDER: Record<TierName, string> = {
  member: "border-zinc-700/50",
  bronze: "border-amber-800/40",
  silver: "border-slate-400/30 shadow-[0_0_10px_1px_hsl(220_9%_65%/0.1)]",
  gold: "border-yellow-500/40 shadow-[0_0_14px_2px_hsl(45_90%_55%/0.15)]",
  diamond: "border-cyan-400/40 shadow-[0_0_16px_3px_hsl(185_100%_50%/0.15)]",
  platinum: "border-violet-500/40 shadow-[0_0_18px_3px_hsl(256_90%_66%/0.15)]",
};

const TIER_ACCENT: Record<TierName, string> = {
  member: "text-zinc-400",
  bronze: "text-amber-400",
  silver: "text-slate-300",
  gold: "text-yellow-400",
  diamond: "text-cyan-400",
  platinum: "text-violet-400",
};

interface TierProgressCardProps {
  compact?: boolean;
  isFounder?: boolean;
}

export default function TierProgressCard({ compact = false, isFounder = false }: TierProgressCardProps) {
  const { t } = useTranslation('common');
  const {
    currentTier,
    jointScore,
    vibeScore,
    reachScore,
    impactLabel,
    geographicReach,
    tierAtRisk,
    loading,
  } = useUserTier();

  if (loading) {
    return (
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-5 animate-pulse">
        <div className="h-6 bg-zinc-700/50 rounded w-1/3 mb-3" />
        <div className="h-4 bg-zinc-700/50 rounded w-full mb-2" />
        <div className="h-4 bg-zinc-700/50 rounded w-2/3" />
      </div>
    );
  }

  const nextThreshold = getNextTierThreshold(currentTier);
  const TIER_THRESHOLDS: Record<TierName, number> = {
    member: 0, bronze: 150, silver: 500, gold: 1000, diamond: 3000, platinum: 8000,
  };
  const currentThreshold = TIER_THRESHOLDS[currentTier];
  const progressPercent = nextThreshold
    ? Math.min(100, ((jointScore - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
    : 100;
  const pointsToNext = nextThreshold ? Math.max(0, nextThreshold - jointScore) : 0;

  const reachInfo = REACH_CONFIG[geographicReach] || REACH_CONFIG.suburb;
  const borderClass = TIER_BORDER[currentTier];
  const accentClass = TIER_ACCENT[currentTier];

  if (compact) {
    return (
      <div className={cn("bg-zinc-800/50 border rounded-xl p-4 flex items-center gap-4", borderClass)}>
        <TierBadge tier={currentTier} size="lg" isFounder={isFounder} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={cn("text-xs", accentClass)}>{jointScore} pts</span>
            {nextThreshold && (
              <span className="text-[10px] text-zinc-500">{pointsToNext} to next</span>
            )}
          </div>
          <Progress value={progressPercent} className="h-1.5 bg-zinc-700" />
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          {reachInfo.icon}
          <span>{reachInfo.label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-zinc-800/50 border rounded-2xl p-5 space-y-4", borderClass)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TierBadge tier={currentTier} size="lg" isFounder={isFounder} />
          <div>
            <p className="text-lg font-bold text-foreground">
              {jointScore} <span className="text-sm font-normal text-muted-foreground">Joint Score</span>
            </p>
          </div>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
                {reachInfo.icon}
                <span className="text-xs text-zinc-300">{reachInfo.label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Your content is visible at {reachInfo.label.toLowerCase()} level</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Founder indicator */}
      {isFounder && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
          <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <p className="text-xs text-yellow-300">City Founder — Lifetime Platinum benefits active</p>
        </div>
      )}

      {/* Tier at risk warning */}
      {tierAtRisk && (
        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
          <p className="text-xs text-orange-300">
            Your {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} status is at risk. Stay active to keep it!
          </p>
        </div>
      )}

      {/* Progress to next tier */}
      {nextThreshold && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-zinc-400">Progress to next tier</span>
            <span className="text-xs text-zinc-500">{pointsToNext} pts needed</span>
          </div>
          <Progress value={progressPercent} className="h-2 bg-zinc-700" />
        </div>
      )}

      {/* Score breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Vibe Score</span>
          </div>
          <p className="text-lg font-bold text-foreground">{vibeScore}</p>
          <p className="text-[10px] text-zinc-500">Real-world activity (60%)</p>
        </div>
        <div className="bg-zinc-900/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Globe className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Reach Score</span>
          </div>
          <p className="text-lg font-bold text-foreground">{reachScore}</p>
          <p className="text-[10px] text-zinc-500">Social influence (40%)</p>
        </div>
      </div>

      {/* Venue Impact */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-3 py-2 cursor-help">
              <span className="text-xs text-zinc-400">Venue Impact</span>
              <span className={`text-xs font-semibold capitalize ${IMPACT_COLORS[impactLabel] || "text-zinc-400"}`}>
                {impactLabel}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px]">
            <p className="text-xs">
              Measures how your presence correlates with increased venue activity.
              Check in regularly, tag venues in posts, and bring friends to improve it.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
