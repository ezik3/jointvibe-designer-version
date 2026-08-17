import * as React from "react";
import { Check, ChevronsUpDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getAllCountriesSorted, getEnabledCountries, type CountryConfig } from "@/config/countries";
import { useTranslation } from 'react-i18next';

interface CountrySelectorProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showDisabledCountries?: boolean;
}

export function CountrySelector({ value, onChange, placeholder = "Select country...", disabled, showDisabledCountries = true }: CountrySelectorProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = React.useState(false);

  const countries = showDisabledCountries ? getAllCountriesSorted() : getEnabledCountries();
  const selected = countries.find(c => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span>{selected.flag}</span>
              <span>{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.name} ${country.code}`}
                  disabled={!country.enabled}
                  onSelect={() => {
                    if (!country.enabled) return;
                    onChange(country.code);
                    setOpen(false);
                  }}
                  className={cn(
                    !country.enabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="mr-2">{country.flag}</span>
                  <span className="flex-1">{country.name}</span>
                  {!country.enabled && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                      <Lock className="h-3 w-3" />
                      Coming soon
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
