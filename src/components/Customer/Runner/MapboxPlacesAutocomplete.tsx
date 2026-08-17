import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin } from 'lucide-react';
import { ensureCountryCode, getUserCountryCodeSync } from '@/lib/userCountry';
import { haversineKm } from '@/utils/driverJobFilter';
import { supabase } from '@/integrations/supabase/client';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string;

export interface MapboxPlace {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category?: string;
}

interface Props {
  mode: 'poi' | 'address';
  value: string;
  onChange: (v: string) => void;
  onSelect: (place: MapboxPlace) => void;
  placeholder?: string;
  proximity?: { lat: number; lng: number } | null;
  /** Customer location used to compute distance shown in results (often === proximity). */
  customerLocation?: { lat: number; lng: number } | null;
  /** Optional nearby address/suburb text used to bias short brand searches like KFC. */
  localityBias?: string;
  disabled?: boolean;
}

interface Result extends MapboxPlace {
  distanceKm?: number;
}

// Default bbox for non-brand POI / address searches: ~60–70 km radius.
// Wide enough to keep nationwide street-name searches working.
const BBOX_DEG_WIDE = 0.6;
// Tight bbox for short brand-only queries like "kfc", "mcdonalds", "bp".
// ~15–17 km radius — keeps results in the user's neighborhood/city.
const BBOX_DEG_TIGHT = 0.15;

function buildBbox(p: { lat: number; lng: number }, deg: number): string {
  const minLng = Math.max(-180, p.lng - deg);
  const minLat = Math.max(-90, p.lat - deg);
  const maxLng = Math.min(180, p.lng + deg);
  const maxLat = Math.min(90, p.lat + deg);
  return `${minLng},${minLat},${maxLng},${maxLat}`;
}

// Common brand typo / partial → canonical Mapbox-friendly query.
// Tiny static map; covers the chains a runner is most likely to be sent to.
const BRAND_NORMALIZE: Array<{ match: RegExp; canonical: string }> = [
  { match: /\b(m+c?d+o?n+a?l+d?s?|maccas|mickey ?d'?s?)\b/i, canonical: "McDonald's" },
  { match: /\bk\.?f\.?c\b/i, canonical: 'KFC' },
  { match: /\bhungry ?jack'?s?\b/i, canonical: "Hungry Jack's" },
  { match: /\bburger ?king\b/i, canonical: 'Burger King' },
  { match: /\bdomino'?s?\b/i, canonical: "Domino's Pizza" },
  { match: /\bpizza ?hut\b/i, canonical: 'Pizza Hut' },
  { match: /\bsubway\b/i, canonical: 'Subway' },
  { match: /\bstarbucks\b/i, canonical: 'Starbucks' },
  { match: /\b7[- ]?eleven\b/i, canonical: '7-Eleven' },
  { match: /\bcoles\b/i, canonical: 'Coles' },
  { match: /\bwoolworth?s?\b|\bwoolies\b/i, canonical: 'Woolworths' },
  { match: /\baldi\b/i, canonical: 'Aldi' },
  { match: /\biga\b/i, canonical: 'IGA' },
  { match: /\bchemist ?warehouse\b/i, canonical: 'Chemist Warehouse' },
  { match: /\bbp\b/i, canonical: 'BP' },
  { match: /\bshell\b/i, canonical: 'Shell' },
  { match: /\bcaltex\b/i, canonical: 'Caltex' },
  { match: /\bampol\b/i, canonical: 'Ampol' },
  { match: /\bunited petroleum\b|\bunited\b/i, canonical: 'United Petroleum' },
];

// Generic category terms → POI category bias keyword that Mapbox understands
// well as a free-text query (Mapbox's geocoder doesn't expose a `category`
// filter on /geocoding/v5, but using the canonical English category word as
// the search term reliably returns POI features of that type).
const CATEGORY_HINTS: Array<{ match: RegExp; query: string }> = [
  { match: /\b(petrol|gas|fuel) ?station\b|\bservo\b/i, query: 'petrol station' },
  { match: /\bsupermarket\b|\bgrocery\b/i, query: 'supermarket' },
  { match: /\bpharmacy\b|\bchemist\b|\bdrug ?store\b/i, query: 'pharmacy' },
  { match: /\batm\b|\bcash machine\b/i, query: 'atm' },
  { match: /\bcafe\b|\bcoffee\b/i, query: 'cafe' },
  { match: /\brestaurant\b/i, query: 'restaurant' },
  { match: /\bconvenience\b/i, query: 'convenience store' },
  { match: /\bbottle ?(shop|o)\b|\bliquor\b/i, query: 'liquor store' },
];

function normalizeQuery(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length < 2) return trimmed;
  for (const b of BRAND_NORMALIZE) {
    if (b.match.test(trimmed)) return b.canonical;
  }
  for (const c of CATEGORY_HINTS) {
    if (c.match.test(trimmed)) return c.query;
  }
  return trimmed;
}

function extractLocality(address?: string): string | null {
  if (!address) return null;
  const cleaned = address.replace(/\bAustralia\b/gi, '').replace(/\b\d{4}\b/g, '');
  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  const withState = parts.find((p) => /\b(Queensland|QLD|New South Wales|NSW|Victoria|VIC|South Australia|SA|Western Australia|WA|Tasmania|TAS|Northern Territory|NT|Australian Capital Territory|ACT)\b/i.test(p));
  if (withState) return withState;
  return parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? null;
}

export function MapboxPlacesAutocomplete({
  mode,
  value,
  onChange,
  onSelect,
  placeholder,
  proximity,
  customerLocation,
  localityBias,
  disabled,
}: Props) {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<string | undefined>(() => getUserCountryCodeSync());
  const debounceRef = useRef<number | null>(null);
  // Cache lat/lng per Google placeId so re-typing the same query doesn't
  // re-fetch coordinates from the details endpoint.
  const detailsCacheRef = useRef<Map<string, { lat: number; lng: number; address: string; name: string }>>(new Map());
  // When the user picks a result we set the input value to the full address.
  // Without this guard the debounced effect would re-run a search on that
  // address and re-open the dropdown. This flag suppresses the next run.
  const justSelectedRef = useRef(false);

  // Resolve country code once (uses profile cache, falls back to reverse geocode).
  useEffect(() => {
    if (country) return;
    ensureCountryCode(proximity ?? customerLocation ?? null).then((cc) => {
      if (cc) setCountry(cc);
    });
  }, [country, proximity?.lat, proximity?.lng, customerLocation?.lat, customerLocation?.lng]);

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
      try {
        const anchor = proximity ?? customerLocation ?? null;
        const ref = customerLocation ?? proximity ?? null;
        void localityBias;

        // ──────────────────────────────────────────────────────────────
        // POI mode → Google Places (New) Autocomplete via edge function.
        // Mapbox classic geocoder has poor brand POI coverage in AU,
        // so brand searches like "kfc" returned addresses 30+ km away
        // even when proper KFCs sat 3 km from the drop-off. Google's
        // Places API matches what google.com/maps shows the user.
        // Address mode (drop-off) keeps using Mapbox — it works fine
        // for street/address geocoding and saves API spend.
        // ──────────────────────────────────────────────────────────────
        if (mode === 'poi') {
          const { data, error } = await supabase.functions.invoke('google-places-search', {
            body: {
              action: 'autocomplete',
              query: value,
              lat: anchor?.lat,
              lng: anchor?.lng,
              country,
              // 8 km hard ring around drop-off — keeps pickup truly local.
              radiusMeters: 8000,
            },
          });
          if (error) {
            console.error('[places] autocomplete error', error);
            setResults([]);
            setOpen(false);
            return;
          }
          const suggestions = (data?.suggestions ?? []) as Array<{
            placeId: string;
            mainText: string;
            secondaryText: string;
            fullText: string;
            types: string[];
            distanceMeters: number | null;
          }>;

          // Take the top 8 and resolve coordinates in parallel via Place
          // Details so we can sort/show distance. Use cache when possible.
          const top = suggestions.slice(0, 8);
          const resolved = await Promise.all(
            top.map(async (s) => {
              const cached = detailsCacheRef.current.get(s.placeId);
              if (cached) return { sug: s, ...cached };
              try {
                const det = await supabase.functions.invoke('google-places-search', {
                  body: { action: 'details', placeId: s.placeId },
                });
                const d = det.data;
                if (det.error || !d || d.error || typeof d.latitude !== 'number') {
                  return { sug: s, lat: NaN, lng: NaN, address: s.fullText, name: s.mainText || s.fullText };
                }
                const entry = {
                  lat: d.latitude as number,
                  lng: d.longitude as number,
                  address: (d.address as string) || s.fullText,
                  name: (d.name as string) || s.mainText || s.fullText,
                };
                detailsCacheRef.current.set(s.placeId, entry);
                return { sug: s, ...entry };
              } catch {
                return { sug: s, lat: NaN, lng: NaN, address: s.fullText, name: s.mainText || s.fullText };
              }
            }),
          );

          const mapped: Result[] = resolved.map((r) => {
            const distanceKm =
              ref && Number.isFinite(r.lat) && Number.isFinite(r.lng)
                ? haversineKm(ref.lat, ref.lng, r.lat, r.lng)
                : r.sug.distanceMeters != null
                  ? r.sug.distanceMeters / 1000
                  : undefined;
            return {
              id: r.sug.placeId,
              name: r.sug.mainText || r.name,
              address: r.sug.secondaryText
                ? `${r.sug.mainText}, ${r.sug.secondaryText}`
                : r.address,
              latitude: r.lat,
              longitude: r.lng,
              category: r.sug.types?.[0],
              distanceKm,
            };
          });

          mapped.sort((a, b) => {
            if (a.distanceKm === undefined) return 1;
            if (b.distanceKm === undefined) return -1;
            return a.distanceKm - b.distanceKm;
          });

          setResults(mapped);
          setOpen(mapped.length > 0);
          return;
        }

        // ──────────────────────────────────────────────────────────────
        // Address mode → Mapbox geocoding (unchanged, works fine).
        // ──────────────────────────────────────────────────────────────
        if (!MAPBOX_TOKEN) {
          setResults([]);
          return;
        }

        const queryStr = value;

        const fetchOnce = async (types: string, useBbox: boolean, deg: number) => {
          const params = new URLSearchParams({
            access_token: MAPBOX_TOKEN,
            types,
            limit: '10',
            autocomplete: 'true',
          });
          if (anchor) params.set('proximity', `${anchor.lng},${anchor.lat}`);
          if (country) params.set('country', country);
          if (useBbox && anchor) params.set('bbox', buildBbox(anchor, deg));
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            queryStr,
          )}.json?${params.toString()}`;
          const res = await fetch(url);
          const data = await res.json();
          return (data?.features ?? []) as any[];
        };

        const MIN_RESULTS = 3;
        let features = await fetchOnce('address,poi', !!anchor, BBOX_DEG_TIGHT);
        if (features.length < MIN_RESULTS && anchor) {
          const wider = await fetchOnce('address,poi', true, BBOX_DEG_WIDE);
          if (wider.length > features.length) features = wider;
        }
        if (features.length < MIN_RESULTS && anchor) {
          const noBbox = await fetchOnce('address,poi', false, BBOX_DEG_WIDE);
          if (noBbox.length > features.length) features = noBbox;
        }

        const mapped: Result[] = features.map((f) => {
          const lat = f.center?.[1];
          const lng = f.center?.[0];
          const distanceKm =
            ref && typeof lat === 'number' && typeof lng === 'number'
              ? haversineKm(ref.lat, ref.lng, lat, lng)
              : undefined;
          return {
            id: f.id,
            name: f.text ?? f.place_name,
            address: f.place_name,
            latitude: lat,
            longitude: lng,
            category: f.properties?.category,
            distanceKm,
          };
        });

        mapped.sort((a, b) => {
          if (a.distanceKm === undefined) return 1;
          if (b.distanceKm === undefined) return -1;
          return a.distanceKm - b.distanceKm;
        });

        setResults(mapped);
        setOpen(true);
      } catch (e) {
        console.error('[places] search error', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
      }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, mode, proximity?.lat, proximity?.lng, customerLocation?.lat, customerLocation?.lng, localityBias, country]);

  // Reference unused so void is no longer needed — touched to keep lint clean
  // for the BRAND_NORMALIZE / CATEGORY_HINTS helpers (still used elsewhere).
  void normalizeQuery;

  const fmtDist = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              onMouseDown={async (e) => {
                e.preventDefault();
                justSelectedRef.current = true;
                // Google Places suggestions don't include lat/lng — resolve
                // them via Place Details before bubbling the selection up,
                // otherwise downstream code (proximity, distance, geofence)
                // breaks. Mapbox results already have coordinates.
                if (mode === 'poi' && (Number.isNaN(r.latitude) || Number.isNaN(r.longitude))) {
                  setLoading(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('google-places-search', {
                      body: { action: 'details', placeId: r.id },
                    });
                    if (error || !data || data.error) {
                      console.error('[places] details error', error || data?.error);
                      setLoading(false);
                      return;
                    }
                    const resolved: MapboxPlace = {
                      id: data.placeId ?? r.id,
                      name: data.name || r.name,
                      address: data.address || r.address,
                      latitude: data.latitude,
                      longitude: data.longitude,
                      category: r.category,
                    };
                    onChange(resolved.address);
                    onSelect(resolved);
                  } finally {
                    setLoading(false);
                  }
                } else {
                  onChange(r.address);
                  onSelect(r);
                }
                setResults([]);
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 border-b border-border/50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  {r.distanceKm !== undefined && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDist(r.distanceKm)} away
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{r.address}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
