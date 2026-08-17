import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;

interface SuburbSuggestion {
  id: string;
  name: string;
  context: string;
}

interface Props {
  city: string;
  country?: string | null;
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Mapbox-powered suburb/neighborhood multi-selector.
 * Searches for neighborhood/locality features biased to the campaign's city.
 */
export default function SuburbMapboxSelector({ city, country, selected, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SuburbSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    if (!MAPBOX_TOKEN) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const q = encodeURIComponent(`${query}, ${city}${country ? `, ${country}` : ''}`);
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json` +
          `?access_token=${MAPBOX_TOKEN}` +
          `&types=neighborhood,locality,place,district` +
          `&autocomplete=true&limit=8`;
        const res = await fetch(url);
        const data = await res.json();
        const feats: SuburbSuggestion[] = (data.features || [])
          .map((f: any) => ({
            id: f.id,
            name: f.text,
            context: f.place_name || f.text,
          }))
          // Prefer features that include the campaign city in their context
          .filter((s: SuburbSuggestion) =>
            s.context.toLowerCase().includes(city.toLowerCase()) || true
          );
        setSuggestions(feats);
        setShowDropdown(true);
      } catch (e) {
        console.error('Mapbox suburb search failed:', e);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, city, country]);

  const addSuburb = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setQuery('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  const removeSuburb = (name: string) => {
    onChange(selected.filter((s) => s !== name));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length && setShowDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions[0]) addSuburb(suggestions[0].name);
                else if (query.trim()) addSuburb(query.trim());
              }
            }}
            placeholder={`Search suburbs in ${city}…`}
            className="pl-9 pr-9"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-64 overflow-y-auto">
            {suggestions.map((s) => {
              const already = selected.includes(s.name);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={already}
                  onClick={() => addSuburb(s.name)}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition',
                    already && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.context}</div>
                  </div>
                  {already && <span className="ml-auto text-[10px] text-muted-foreground">added</span>}
                </button>
              );
            })}
          </div>
        )}

        {!MAPBOX_TOKEN && (
          <p className="text-xs text-amber-500 mt-1">
            Map search not configured — type a suburb name and press Enter to add.
          </p>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              <MapPin className="h-3 w-3" />
              <span>{s}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-4 w-4 ml-1 hover:bg-destructive/20"
                onClick={() => removeSuburb(s)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {selected.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add at least one suburb. Each suburb adds to your daily cost.
        </p>
      )}
    </div>
  );
}
