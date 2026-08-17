import { MapPin, Navigation, Map, Landmark, Flag, Globe } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useTranslation } from 'react-i18next';

export type DiscoveryLevel = "suburb" | "local" | "regional" | "state" | "national" | "international";

interface DiscoveryLevelOption {
  value: DiscoveryLevel;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const discoveryLevels: DiscoveryLevelOption[] = [
  { value: "suburb", label: "Suburb/Town", icon: <MapPin className="w-3.5 h-3.5" />, description: "Hyperlocal" },
  { value: "local", label: "Local", icon: <Navigation className="w-3.5 h-3.5" />, description: "≤ 25 km" },
  { value: "regional", label: "Metro / Regional", icon: <Map className="w-3.5 h-3.5" />, description: "Metro area" },
  { value: "state", label: "State", icon: <Landmark className="w-3.5 h-3.5" />, description: "State-wide" },
  { value: "national", label: "National", icon: <Flag className="w-3.5 h-3.5" />, description: "Country-wide" },
  { value: "international", label: "International", icon: <Globe className="w-3.5 h-3.5" />, description: "Worldwide" },
];

interface DiscoveryLevelSelectorProps {
  value: DiscoveryLevel;
  onChange: (level: DiscoveryLevel) => void;
  className?: string;
}

export function DiscoveryLevelSelector({ value, onChange, className = "" }: DiscoveryLevelSelectorProps) {
  const { t } = useTranslation('common');
  return (
    <div className={className}>
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-1">
          {discoveryLevels.map((level) => (
            <button
              key={level.value}
              onClick={() => onChange(level.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-medium transition-all duration-200 ${
                value === level.value
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
                  : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
              }`}
            >
              {level.icon}
              <span>{level.label}</span>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </div>
  );
}

export { discoveryLevels };
