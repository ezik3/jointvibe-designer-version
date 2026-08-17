import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface ETATimeSelectorProps {
  onTimeSelected: (scheduledFor: string | null) => void;
  selectedTime: string | null;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i); // 0–12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0–59

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_INDEX = Math.floor(VISIBLE_ITEMS / 2);

function useScrollWheel(
  values: number[],
  selected: number,
  onChange: (val: number) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const isUserScroll = useRef(true);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Scroll to the selected value on mount / when selected changes programmatically
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = values.indexOf(selected);
    if (idx === -1) return;
    isUserScroll.current = false;
    el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" });
    const t = setTimeout(() => { isUserScroll.current = true; }, 300);
    return () => clearTimeout(t);
  }, [selected, values]);

  const handleScroll = useCallback(() => {
    if (!isUserScroll.current) return;
    const el = ref.current;
    if (!el) return;

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, values.length - 1));
      // Snap
      el.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: "smooth" });
      if (values[clamped] !== selected) {
        onChange(values[clamped]);
      }
    }, 80);
  }, [values, selected, onChange]);

  return { ref, handleScroll };
}

export default function ETATimeSelector({ onTimeSelected, selectedTime }: ETATimeSelectorProps) {
  const { t } = useTranslation('common');
  const [expanded, setExpanded] = useState(false);

  // Derive hours/minutes from selectedTime
  const { hours, minutes } = useMemo(() => {
    if (!selectedTime) return { hours: 0, minutes: 0 };
    const now = new Date();
    const target = new Date(selectedTime);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return { hours: 0, minutes: 0 };
    const totalMins = Math.round(diffMs / 60000);
    return { hours: Math.min(12, Math.floor(totalMins / 60)), minutes: totalMins % 60 };
  }, [selectedTime]);

  const isASAP = hours === 0 && minutes === 0;

  const setTime = useCallback((h: number, m: number) => {
    if (h === 0 && m === 0) {
      onTimeSelected(null);
      return;
    }
    const target = new Date();
    target.setMinutes(target.getMinutes() + h * 60 + m);
    onTimeSelected(target.toISOString());
  }, [onTimeSelected]);

  const hourWheel = useScrollWheel(HOURS, hours, (h) => setTime(h, minutes));
  const minWheel = useScrollWheel(MINUTES, minutes, (m) => setTime(hours, m));

  const displayLabel = isASAP
    ? t('eta.pickup_asap')
    : t('eta.pickup_in', { time: `${hours > 0 ? `${hours}h ` : ""}${minutes}min` });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{displayLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isASAP && (
            <Badge className="bg-primary/20 text-primary text-xs">{t('eta.scheduled')}</Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-xs text-muted-foreground text-center">
            {isASAP ? t('eta.scroll_to_set') : t('eta.when_ready')}
          </p>

          <div className="relative flex items-center justify-center gap-2">
            {/* Highlight bar */}
            <div
              className="absolute left-2 right-2 rounded-xl bg-muted/80 border border-border pointer-events-none"
              style={{ height: ITEM_HEIGHT, top: CENTER_INDEX * ITEM_HEIGHT }}
            />

            {/* Hours wheel */}
            <div
              ref={hourWheel.ref}
              onScroll={hourWheel.handleScroll}
              className="relative overflow-y-auto no-scrollbar snap-y snap-mandatory"
              style={{ height: CONTAINER_HEIGHT, width: 64 }}
            >
              {/* Top/bottom padding so first/last items can center */}
              <div style={{ height: CENTER_INDEX * ITEM_HEIGHT }} />
              {HOURS.map((h) => (
                <div
                  key={h}
                  className={`snap-center flex items-center justify-center text-lg font-semibold transition-colors ${
                    h === hours ? "text-foreground" : "text-muted-foreground/40"
                  }`}
                  style={{ height: ITEM_HEIGHT }}
                >
                  {h}
                </div>
              ))}
              <div style={{ height: CENTER_INDEX * ITEM_HEIGHT }} />
            </div>

            {/* Label: hrs */}
            <span className="text-xs text-muted-foreground font-medium w-8">{t('eta.hrs')}</span>

            {/* Minutes wheel */}
            <div
              ref={minWheel.ref}
              onScroll={minWheel.handleScroll}
              className="relative overflow-y-auto no-scrollbar snap-y snap-mandatory"
              style={{ height: CONTAINER_HEIGHT, width: 64 }}
            >
              <div style={{ height: CENTER_INDEX * ITEM_HEIGHT }} />
              {MINUTES.map((m) => (
                <div
                  key={m}
                  className={`snap-center flex items-center justify-center text-lg font-semibold transition-colors ${
                    m === minutes ? "text-foreground" : "text-muted-foreground/40"
                  }`}
                  style={{ height: ITEM_HEIGHT }}
                >
                  {String(m).padStart(2, "0")}
                </div>
              ))}
              <div style={{ height: CENTER_INDEX * ITEM_HEIGHT }} />
            </div>

            {/* Label: min */}
            <span className="text-xs text-muted-foreground font-medium w-8">{t('eta.min')}</span>
          </div>

          {!isASAP && (
            <p className="text-xs text-center text-muted-foreground">
              {t('eta.ready_in')} <span className="font-medium text-foreground">
                {hours > 0 ? `${hours}h ` : ""}{String(minutes).padStart(2, "0")}min
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
