import { Switch } from "@/components/ui/switch";
import {
  normalizeVenueOperatingHours,
  venueOperatingDays,
  type VenueOperatingHour,
} from "@/lib/venueOperatingHours";
import "./venue-operating-hours-editor.css";

interface VenueOperatingHoursEditorProps {
  value: VenueOperatingHour[];
  onChange: (hours: VenueOperatingHour[]) => void;
  idPrefix: string;
  className?: string;
}

export default function VenueOperatingHoursEditor({
  value,
  onChange,
  idPrefix,
  className = "",
}: VenueOperatingHoursEditorProps) {
  const hours = normalizeVenueOperatingHours(value);

  const updateHour = (day: number, updates: Partial<VenueOperatingHour>) => {
    onChange(hours.map((hour) => (
      hour.day === day ? { ...hour, ...updates } : hour
    )));
  };

  return (
    <div className={`venue-operating-hours-editor ${className}`.trim()}>
      {venueOperatingDays.map((day) => {
        const hour = hours.find((item) => item.day === day.value)!;

        return (
          <div className="venue-operating-hours-editor__row" key={day.value}>
            <strong>{day.short}</strong>
            <Switch
              id={`${idPrefix}-${day.value}`}
              checked={!hour.isClosed}
              onCheckedChange={(checked) => updateHour(day.value, { isClosed: !checked })}
              aria-label={`${day.label} is ${hour.isClosed ? "closed" : "open"}`}
            />
            {!hour.isClosed ? (
              <div className="venue-operating-hours-editor__times">
                <input
                  aria-label={`${day.label} opening time`}
                  type="time"
                  value={hour.openTime}
                  onChange={(event) => updateHour(day.value, { openTime: event.target.value })}
                />
                <span>to</span>
                <input
                  aria-label={`${day.label} closing time`}
                  type="time"
                  value={hour.closeTime}
                  onChange={(event) => updateHour(day.value, { closeTime: event.target.value })}
                />
              </div>
            ) : (
              <span className="venue-operating-hours-editor__closed">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
