import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface CreditTierDisplayProps {
  credits: Record<string, number>;
  selectedTier: string;
  onSelectTier: (tier: string) => void;
  type?: "deal" | "vibe";
  compact?: boolean;
}

const TIER_CONFIG = [
  { key: "suburb", label: "Suburb", color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
  { key: "local", label: "Local", color: "text-green-400 border-green-500/40 bg-green-500/10" },
  { key: "regional", label: "Regional", color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
  { key: "city", label: "City", color: "text-purple-400 border-purple-500/40 bg-purple-500/10" },
  { key: "national", label: "National", color: "text-orange-400 border-orange-500/40 bg-orange-500/10" },
  { key: "international", label: "Int'l", color: "text-pink-400 border-pink-500/40 bg-pink-500/10" },
];

export default function CreditTierDisplay({
  credits,
  selectedTier,
  onSelectTier,
  type = "deal",
  compact = false,
}: CreditTierDisplayProps) {
  const { t } = useTranslation('venue');
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">
        {type === "deal" ? "Push Deal" : "Vibe"} Credits by Reach
      </p>
      <div className={cn("flex flex-wrap gap-2", compact && "gap-1.5")}>
        {TIER_CONFIG.map((tier) => {
          const count = credits[tier.key] || 0;
          const isSelected = selectedTier === tier.key;
          return (
            <button
              key={tier.key}
              onClick={() => onSelectTier(tier.key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                tier.color,
                isSelected && "ring-2 ring-offset-1 ring-offset-background ring-primary scale-105",
                count === 0 && "opacity-40",
                compact && "px-2 py-1"
              )}
            >
              <span className="block">{tier.label}</span>
              <span className={cn("block text-sm font-bold", compact && "text-xs")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {selectedTier && (
        <p className="text-xs text-muted-foreground">
          1 {type === "deal" ? "push" : "vibe"} credit will be used from{" "}
          <span className="font-semibold text-foreground capitalize">{selectedTier}</span>
        </p>
      )}
    </div>
  );
}
