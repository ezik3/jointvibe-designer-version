import { type TierName } from "@/hooks/useUserTier";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface TierAvatarRingProps {
  tier: TierName;
  isFounder?: boolean;
  size?: "md" | "lg";
  children: React.ReactNode;
  className?: string;
}

const RING_STYLES: Record<TierName, { ring: string; glow?: string; animated?: boolean }> = {
  member: {
    ring: "bg-zinc-600",
  },
  bronze: {
    ring: "bg-gradient-to-br from-amber-700 to-orange-500",
  },
  silver: {
    ring: "bg-gradient-to-br from-slate-300 to-zinc-400",
    glow: "shadow-[0_0_12px_2px_hsl(220_9%_65%/0.3)]",
  },
  gold: {
    ring: "bg-gradient-to-br from-yellow-400 to-amber-600",
    glow: "shadow-[0_0_18px_3px_hsl(45_90%_55%/0.35)]",
  },
  diamond: {
    ring: "bg-gradient-to-br from-cyan-400 to-blue-500",
    glow: "shadow-[0_0_20px_4px_hsl(185_100%_50%/0.3)]",
    animated: true,
  },
  platinum: {
    ring: "tier-platinum-ring",
    glow: "shadow-[0_0_24px_5px_hsl(256_90%_66%/0.35)]",
    animated: true,
  },
};

const SIZE_MAP = {
  md: { outer: "w-20 h-20 md:w-24 md:h-24", padding: "p-[3px]", crown: "-top-3 text-base" },
  lg: { outer: "w-28 h-28 md:w-32 md:h-32", padding: "p-[3px]", crown: "-top-4 text-lg" },
};

export default function TierAvatarRing({
  tier,
  isFounder = false,
  size = "md",
  children,
  className,
}: TierAvatarRingProps) {
  const { t } = useTranslation('common');
  const style = RING_STYLES[tier];
  const sizeClasses = SIZE_MAP[size];

  return (
    <div className={cn("relative", className)}>
      {/* Founder crown */}
      {isFounder && (
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-20 drop-shadow-lg",
            sizeClasses.crown,
          )}
        >
          👑
        </span>
      )}

      {/* Diamond pulse aura */}
      {tier === "diamond" && (
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 animate-tier-pulse" />
      )}

      {/* Platinum rotating aura */}
      {tier === "platinum" && (
        <div className="absolute -inset-1 rounded-full tier-platinum-aura animate-tier-rotate opacity-60" />
      )}

      {/* Outer ring */}
      <div
        className={cn(
          "rounded-full",
          sizeClasses.outer,
          sizeClasses.padding,
          style.ring,
          style.glow,
          tier === "diamond" && "animate-tier-pulse",
        )}
      >
        {/* Founder inner gold ring */}
        {isFounder ? (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-yellow-500/40 to-amber-600/40 p-[2px]">
            <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden">
              {children}
            </div>
          </div>
        ) : (
          <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
