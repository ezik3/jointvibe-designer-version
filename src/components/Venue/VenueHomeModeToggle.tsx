import { LayoutGrid, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VenueHomeMode = "classic" | "control_center";

interface VenueHomeModeToggleProps {
  mode: VenueHomeMode;
  onChange: (mode: VenueHomeMode) => void;
  className?: string;
}

export default function VenueHomeModeToggle({ mode, onChange, className }: VenueHomeModeToggleProps) {
  return (
    <div className={`venue-home-mode-toggle inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 p-1 backdrop-blur${className ? ` ${className}` : ""}`} role="group" aria-label="Dashboard display">
      <Button
        size="sm"
        variant={mode === "control_center" ? "default" : "ghost"}
        onClick={() => onChange("control_center")}
        className="h-8 gap-1.5"
        aria-pressed={mode === "control_center"}
      >
        <PanelsTopLeft className="h-3.5 w-3.5" />
        <span>Control center</span>
      </Button>
      <Button
        size="sm"
        variant={mode === "classic" ? "default" : "ghost"}
        onClick={() => onChange("classic")}
        className="h-8 gap-1.5"
        aria-pressed={mode === "classic"}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>Classic</span>
      </Button>
    </div>
  );
}
