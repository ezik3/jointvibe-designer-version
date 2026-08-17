import { type VenueTierName } from "@/hooks/useVenueTier";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface VenueTierBadgeProps {
  tier: VenueTierName;
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
  isFounder?: boolean;
}

const TIER_CONFIG: Record<VenueTierName, { label: string; emoji: string; classes: string; glow?: string }> = {
  bronze: {
    label: "Bronze",
    emoji: "🥉",
    classes: "bg-gradient-to-r from-amber-800/60 to-orange-700/60 text-amber-200 border-amber-700/50",
  },
  silver: {
    label: "Silver",
    emoji: "🥈",
    classes: "bg-gradient-to-r from-slate-400/30 to-zinc-300/30 text-slate-200 border-slate-400/50",
    glow: "shadow-slate-400/20",
  },
  gold: {
    label: "Gold",
    emoji: "🥇",
    classes: "bg-gradient-to-r from-yellow-600/50 to-amber-500/50 text-yellow-200 border-yellow-500/50",
    glow: "shadow-yellow-500/25",
  },
  diamond: {
    label: "Diamond",
    emoji: "💎",
    classes: "bg-gradient-to-r from-cyan-500/40 to-blue-500/40 text-cyan-100 border-cyan-400/50 animate-pulse",
    glow: "shadow-cyan-400/30",
  },
  platinum: {
    label: "Platinum",
    emoji: "🏆",
    classes: "bg-gradient-to-r from-violet-500/40 via-fuchsia-500/40 to-pink-500/40 text-white border-violet-400/50",
    glow: "shadow-violet-500/30",
  },
};

const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 gap-0.5",
  md: "text-xs px-2 py-0.5 gap-1",
  lg: "text-sm px-3 py-1 gap-1.5",
};

export default function VenueTierBadge({ tier, size = "md", className, showLabel = true, isFounder = false }: VenueTierBadgeProps) {
  const { t } = useTranslation('venue');
  const config = TIER_CONFIG[tier];

  return (
    <span className="relative inline-flex items-center">
      <span
        className={cn(
          "inline-flex items-center rounded-full border font-semibold",
          SIZE_CLASSES[size],
          config.classes,
          config.glow && `shadow-lg ${config.glow}`,
          className,
        )}
      >
        <span>{config.emoji}</span>
        {showLabel && <span>{config.label}</span>}
      </span>
      {isFounder && (
        <span className={cn(
          "absolute -top-1 -right-1 z-10",
          size === "sm" ? "text-[8px]" : size === "md" ? "text-[10px]" : "text-xs"
        )}>
          👑
        </span>
      )}
    </span>
  );
}
