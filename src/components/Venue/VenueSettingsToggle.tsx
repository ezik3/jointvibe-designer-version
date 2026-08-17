import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface VenueSettingsToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: LucideIcon;
}

export default function VenueSettingsToggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  icon: Icon,
}: VenueSettingsToggleProps) {
  return (
    <div className="venue-settings-toggle">
      {Icon && <span className="venue-settings-toggle__icon"><Icon aria-hidden="true" /></span>}
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
