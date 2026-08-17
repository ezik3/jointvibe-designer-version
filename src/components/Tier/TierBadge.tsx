import { type TierName } from "@/hooks/useUserTier";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface TierBadgeProps {
  tier: TierName;
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
  isFounder?: boolean;
}

const TIER_CONFIG: Record<TierName, { label: string; emoji: string; classes: string; glow?: string; shimmer?: boolean }> = {
  member: {
    label: "Member",
    emoji: "👤",
    classes: "bg-zinc-700/60 text-zinc-300 border-zinc-600",
  },
  bronze: {
    label: "Bronze",
    emoji: "🥉",
    classes: "bg-gradient-to-r from-amber-800/60 to-orange-700/60 text-amber-200 border-amber-700/50",
  },
  silver: {
    label: "Silver",
    emoji: "🥈",
    classes: "bg-gradient-to-r from-slate-400/30 to-zinc-300/30 text-slate-200 border-slate-400/50",
    glow: "shadow-[0_0_8px_1px_hsl(220_9%_65%/0.2)]",
  },
  gold: {
    label: "Gold",
    emoji: "🥇",
    classes: "bg-gradient-to-r from-yellow-600/50 to-amber-500/50 text-yellow-200 border-yellow-500/50",
    glow: "shadow-[0_0_10px_2px_hsl(45_90%_55%/0.25)]",
  },
  diamond: {
    label: "Diamond",
    emoji: "💎",
    classes: "bg-gradient-to-r from-cyan-500/40 to-blue-500/40 text-cyan-100 border-cyan-400/50",
    glow: "shadow-[0_0_12px_2px_hsl(185_100%_50%/0.3)]",
    shimmer: true,
  },
  platinum: {
    label: "Platinum",
    emoji: "🏆",
    classes: "bg-gradient-to-r from-violet-500/40 via-fuchsia-500/40 to-pink-500/40 text-white border-violet-400/50",
    glow: "shadow-[0_0_14px_3px_hsl(256_90%_66%/0.3)]",
    shimmer: true,
  },
};

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 gap-0.5",
  md: "text-xs px-2 py-0.5 gap-1",
  lg: "text-sm px-3 py-1 gap-1.5",
};

export default function TierBadge({ tier, size = "md", className, showLabel = true, isFounder = false }: TierBadgeProps) {
  const { t } = useTranslation('common');
  const config = TIER_CONFIG[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold relative overflow-hidden",
        SIZE_CLASSES[size],
        config.classes,
        config.glow,
        className,
      )}
    >
      {/* Shimmer effect for Diamond/Platinum */}
      {config.shimmer && (
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-tier-shimmer pointer-events-none" />
      )}
      <span className="relative">{config.emoji}</span>
      {showLabel && <span className="relative">{config.label}</span>}
      {isFounder && (
        <>
          <span className="relative text-yellow-400/70">•</span>
          <Crown className="relative w-3 h-3 text-yellow-400" />
          <span className="relative text-yellow-300 text-[9px]">Founder</span>
        </>
      )}
    </span>
  );
}
