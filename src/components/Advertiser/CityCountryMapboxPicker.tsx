import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2, Keyboard, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  city: string;
  country: string;
  onChange: (next: { city: string; country: string }) => void;
}

interface Suggestion {
  id: string;
  place_name: string;
  text: string;
  context: { id: string; text: string; short_code?: string }[];
}

/**
 * City + Country picker powered by Mapbox geocoding.
 * Mirrors the venue/end-user "Set Location" pattern so saved
 * city/country values match what the rest of the app uses.
 */
export default function CityCountryMapboxPicker({ city, country, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Pull token via the same edge function used by venues/end-users.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("get-mapbox-token");
        if (data?.token) setToken(data.token);
      } catch (e) {
        console.error("mapbox token fetch failed", e);
      }
    })();
  }, []);

  // Debounced search — restricted to place + country so we get city-level hits.
  useEffect(() => {
    if (manual || !query || query.length < 2 || !token) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
          `?access_token=${token}&autocomplete=true&limit=6&types=place,locality,district`;
        const res = await fetch(url);
        const data = await res.json();
        const feats: Suggestion[] = (data.features || []).map((f: any) => ({
          id: f.id,
          place_name: f.place_name,
          text: f.text,
          context: f.context || [],
        }));
        setSuggestions(feats);
        setShowDropdown(true);
      } catch (e) {
        console.error("mapbox city search failed", e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, token, manual]);

  const pick = (s: Suggestion) => {
    const cityName = s.text;
    const countryCtx = s.context.find((c) => c.id?.startsWith("country."));
    const countryName = countryCtx?.text || "";
    onChange({ city: cityName, country: countryName });
    setQuery("");
    setSuggestions([]);
    setShowDropdown(false);
  };

  const clear = () => onChange({ city: "", country: "" });

  return (
    <div className="space-y-2">
      {/* Selected value */}
      {(city || country) && !manual && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-sm">
              {[city, country].filter(Boolean).join(", ")}
            </span>
            <button
              type="button"
              onClick={clear}
              className="ml-1 hover:text-destructive"
              aria-label="Clear location"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
        </div>
      )}

      {/* Search input (Mapbox mode) */}
      {!manual && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length && setShowDropdown(true)}
            placeholder={city ? "Change location…" : "Search city (e.g. Brisbane, Australia)"}
            className="pl-9 pr-9"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}

          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-72 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  className={cn(
                    "w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition"
                  )}
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{s.text}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.place_name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual fallback */}
      {manual && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            placeholder="City (e.g. Brisbane)"
            value={city}
            onChange={(e) => onChange({ city: e.target.value, country })}
          />
          <Input
            placeholder="Country (e.g. Australia)"
            value={country}
            onChange={(e) => onChange({ city, country: e.target.value })}
          />
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setManual((m) => !m)}
        className="text-xs text-muted-foreground hover:text-foreground h-auto py-1 px-2"
      >
        <Keyboard className="w-3 h-3 mr-1" />
        {manual ? "Use location search" : "Type manually instead"}
      </Button>
    </div>
  );
}
