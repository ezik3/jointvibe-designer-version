import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { haversineKm, getDriverMaxRadiusKm, getJobTier, type DriverMode } from '@/utils/driverJobFilter';
import { Badge } from '@/components/ui/badge';

export interface JVVenue {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  venue_type: string | null;
  distanceKm?: number;
  /** Which driver tier (smallest) can service this distance */
  serviceTier?: DriverMode;
  /** Whether at least one tier can serve it */
  inRange?: boolean;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (venue: JVVenue) => void;
  customerLocation: { lat: number; lng: number } | null;
}

// Customer-side: a venue is "in range" if any tier can serve it.
// Largest tier is `car` (20 km).
const MAX_SERVICEABLE_KM = getDriverMaxRadiusKm(['car'], 0);

export function VenuePickupSearch({ value, onChange, onSelect, customerLocation }: Props) {
  const navigate = useNavigate();
  const [results, setResults] = useState<JVVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  // Suppress the next debounced search after the user picks a venue
  // (we set the input to the venue name, which would otherwise re-trigger search).
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!value || value.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('venues')
        .select('id, name, address, latitude, longitude, venue_type, approval_status')
        .eq('approval_status', 'live')
        .ilike('name', `%${value}%`)
        .limit(20);

      const enriched: JVVenue[] = (data ?? []).map((v: any) => {
        const distanceKm =
          customerLocation && v.latitude != null && v.longitude != null
            ? haversineKm(customerLocation.lat, customerLocation.lng, v.latitude, v.longitude)
            : undefined;
        const serviceTier =
          distanceKm !== undefined ? getJobTier(distanceKm) : undefined;
        const inRange =
          distanceKm === undefined ? true : distanceKm <= MAX_SERVICEABLE_KM;
        return { ...v, distanceKm, serviceTier, inRange };
      });

      // Sort by distance ascending; unknown distances last
      enriched.sort((a, b) => {
        if (a.distanceKm === undefined) return 1;
        if (b.distanceKm === undefined) return -1;
        return a.distanceKm - b.distanceKm;
      });

      setResults(enriched.slice(0, 8));
      setOpen(true);
      setLoading(false);
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, customerLocation?.lat, customerLocation?.lng]);

  const fmtDist = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

  const tierLabel = (t?: DriverMode) =>
    t === 'runner' ? 'Runner' : t === 'bicycle' ? 'Bike' : t === 'motorcycle' ? 'Moto' : t === 'car' ? 'Car' : '';

  const noMatch = !loading && value.length >= 2 && results.length === 0;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search a JV venue by name…"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && (results.length > 0 || noMatch) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map((v, i) => {
            const isClosest = i === 0 && v.inRange;
            return (
              <button
                key={v.id}
                type="button"
                disabled={!v.inRange}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (v.inRange) {
                    justSelectedRef.current = true;
                    onSelect(v);
                    onChange(v.name);
                    setResults([]);
                    setOpen(false);
                  }
                }}
                className={`flex w-full items-start gap-2 border-b border-border/50 px-3 py-2 text-left text-sm last:border-b-0 transition-colors ${
                  v.inRange
                    ? isClosest
                      ? 'bg-primary/5 hover:bg-primary/10'
                      : 'hover:bg-accent'
                    : 'cursor-not-allowed opacity-60'
                }`}
              >
                <MapPin
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    isClosest ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{v.name}</span>
                    {isClosest && (
                      <Badge variant="default" className="h-4 gap-0.5 px-1 text-[10px]">
                        <Sparkles className="h-2.5 w-2.5" /> Closest
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {v.distanceKm !== undefined && <span>{fmtDist(v.distanceKm)} away</span>}
                    {v.serviceTier && v.inRange && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                        {tierLabel(v.serviceTier)}
                      </span>
                    )}
                    {v.address && <span className="truncate">· {v.address}</span>}
                  </div>
                  {!v.inRange && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        navigate(`/app/venues?venue=${v.id}`);
                      }}
                      className="mt-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      Outside runner range — order directly from venue →
                    </button>
                  )}
                </div>
              </button>
            );
          })}

          {noMatch && (
            <div className="px-3 py-3 text-sm">
              <div className="font-medium">No matching JV venue</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Switch off the toggle to send a runner to the nearest store instead.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
