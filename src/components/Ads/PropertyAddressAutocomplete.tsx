import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Keyboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';

interface AddressParts {
  country: string;
  city: string;
}

interface PropertyAddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onAddressParsed?: (parts: AddressParts) => void;
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  id: string;
  place_name: string;
  center: [number, number];
  context: { id: string; text: string }[];
}

export const PropertyAddressAutocomplete = ({
  value,
  onChange,
  onAddressParsed,
  placeholder = "Start typing property address...",
  className = "",
}: PropertyAddressAutocompleteProps) => {
  const { t } = useTranslation('common');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch mapbox token from edge function
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (data?.token) {
          setMapboxToken(data.token);
        }
      } catch (err) {
        console.error("Failed to fetch mapbox token:", err);
      }
    };
    fetchToken();
  }, []);

  // Debounced search - only when not in manual mode
  useEffect(() => {
    if (manualMode || !value || value.length < 3 || !mapboxToken) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${mapboxToken}&autocomplete=true&limit=5&types=address,place`
        );
        const data = await response.json();
        if (data.features) {
          setSuggestions(data.features.map((f: any) => ({
            id: f.id,
            place_name: f.place_name,
            center: f.center,
            context: f.context || [],
          })));
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error("Geocoding error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, mapboxToken, manualMode]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (suggestion: Suggestion) => {
    onChange(suggestion.place_name);
    setShowSuggestions(false);
    setSuggestions([]);

    // Parse country and city from Mapbox context
    if (onAddressParsed && suggestion.context) {
      const countryCtx = suggestion.context.find((c) => c.id.startsWith("country"));
      const placeCtx = suggestion.context.find((c) => c.id.startsWith("place"));
      onAddressParsed({
        country: countryCtx?.text || "",
        city: placeCtx?.text || "",
      });
    }
  };

  const toggleManualMode = () => {
    setManualMode(!manualMode);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          ref={inputRef}
          placeholder={manualMode ? "Type your address manually..." : placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => !manualMode && suggestions.length > 0 && setShowSuggestions(true)}
          className={className}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}

        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg overflow-hidden z-50 shadow-xl"
          >
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-start gap-3 border-b border-border last:border-b-0"
                onClick={() => handleSelect(suggestion)}
              >
                <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{suggestion.place_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggleManualMode}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        <Keyboard className="w-3 h-3 mr-1" />
        {manualMode ? "Use address suggestions" : "Type manually instead"}
      </Button>
    </div>
  );
};
