import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

interface PlacementSelectorProps {
  selected: string[];
  onChange: (placements: string[]) => void;
  suggestedPlacements?: string[];
}

const PLACEMENTS = [
  { key: "feed", label: "Home Feed", description: "Main social feed" },
  { key: "explore", label: "Explore Page", description: "Discovery tabs" },
  { key: "city_view", label: "City View", description: "City map & listings" },
  { key: "public_feed", label: "Public Feed", description: "Public page content" },
  { key: "following", label: "Following Feed", description: "Followers' feeds" },
  { key: "venue_profile", label: "Venue Profile", description: "Your venue page" },
  { key: "desktop_sidebar", label: "Desktop Sidebar", description: "Side panel on desktop" },
];

export default function PlacementSelector({
  selected,
  onChange,
  suggestedPlacements = [],
}: PlacementSelectorProps) {
  const { t } = useTranslation('venue');
  const toggle = (key: string) => {
    onChange(
      selected.includes(key) ? selected.filter((p) => p !== key) : [...selected, key]
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">Where should this appear?</p>
      <div className="grid grid-cols-2 gap-2">
        {PLACEMENTS.map((p) => {
          const isSuggested = suggestedPlacements.includes(p.key);
          const isChecked = selected.includes(p.key);
          return (
            <label
              key={p.key}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-all",
                isChecked
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/30",
                isSuggested && !isChecked && "border-cyan-500/30"
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggle(p.key)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{p.label}</span>
                  {isSuggested && (
                    <span className="text-[10px] text-cyan-400 font-medium">AI ✦</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">{p.description}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
