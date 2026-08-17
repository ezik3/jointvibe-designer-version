import { useState, useEffect } from "react";
import { MapPin, Navigation, ArrowRight, Lock, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getCountryByCode, getCountryByName, isCountryEnabled, formatCurrency } from "@/config/countries";
import { usdToLocal } from "@/config/exchangeRates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface LocationChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCountryCode: string;
  currentCity: string;
  walletBalanceUsd: number;
  onSave: (data: {
    countryCode: string;
    city: string;
    state: string;
    suburb: string;
    location: string;
    currency: string;
    latitude: number;
    longitude: number;
  }) => void;
}

export function LocationChangeDialog({
  open,
  onOpenChange,
  currentCountryCode,
  currentCity,
  walletBalanceUsd,
  onSave,
}: LocationChangeDialogProps) {
  const { t } = useTranslation('common');
  const [detecting, setDetecting] = useState(false);
  const [locationDetected, setLocationDetected] = useState(false);
  const [detectedCountry, setDetectedCountry] = useState("");
  const [detectedCountryCode, setDetectedCountryCode] = useState("");
  const [detectedState, setDetectedState] = useState("");
  const [detectedCity, setDetectedCity] = useState("");
  const [detectedSuburb, setDetectedSuburb] = useState("");
  const [detectedLat, setDetectedLat] = useState(0);
  const [detectedLng, setDetectedLng] = useState(0);

  useEffect(() => {
    if (open) {
      // Reset state when dialog opens
      setLocationDetected(false);
      setDetectedCountry("");
      setDetectedCountryCode("");
      setDetectedState("");
      setDetectedCity("");
      setDetectedSuburb("");
      setDetectedLat(0);
      setDetectedLng(0);
    }
  }, [open]);

  const currentCountry = getCountryByCode(currentCountryCode);
  const newCountry = getCountryByCode(detectedCountryCode);
  const currencyChanged =
    locationDetected && currentCountry && newCountry && currentCountry.currency !== newCountry.currency;

  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setDetecting(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      );

      const { latitude, longitude } = position.coords;
      setDetectedLat(latitude);
      setDetectedLng(longitude);

      const { data, error } = await supabase.functions.invoke("geocode-address", {
        body: { address: `${latitude},${longitude}` },
      });

      if (error || !data?.success) {
        toast.error("Could not determine your location. Please try again.");
        setDetecting(false);
        return;
      }

      setDetectedCountry(data.country || "");
      setDetectedState(data.state || "");
      setDetectedCity(data.city || "");
      setDetectedSuburb(data.suburb || "");

      let resolvedCode = "";
      if (data.countryCode) {
        resolvedCode = data.countryCode;
      } else if (data.country) {
        const countryConfig = getCountryByName(data.country);
        resolvedCode = countryConfig?.code || "";
      }

      if (resolvedCode && !isCountryEnabled(resolvedCode)) {
        const countryName = getCountryByCode(resolvedCode)?.name || data.country || resolvedCode;
        toast.error(`${countryName} is not yet available on the platform. We're working on expanding to more regions soon!`);
        setDetecting(false);
        return;
      }

      setDetectedCountryCode(resolvedCode);
      setLocationDetected(true);
      toast.success("Location detected successfully!");
    } catch (err: any) {
      if (err?.code === 1) {
        toast.error("Location access denied. Please enable location services.");
      } else if (err?.code === 2) {
        toast.error("Location unavailable. Please try again.");
      } else if (err?.code === 3) {
        toast.error("Location request timed out. Please try again.");
      } else {
        toast.error("Failed to detect location. Please try again.");
      }
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = () => {
    if (!locationDetected || !detectedCountryCode) {
      toast.error("Please detect your location first");
      return;
    }
    const country = getCountryByCode(detectedCountryCode);
    const parts = [detectedSuburb, detectedCity, detectedState, detectedCountry].filter(Boolean);
    const locationStr = parts.join(", ");

    onSave({
      countryCode: detectedCountryCode,
      city: detectedCity,
      state: detectedState,
      suburb: detectedSuburb,
      location: locationStr,
      currency: country?.currency || "USD",
      latitude: detectedLat,
      longitude: detectedLng,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Change Location
          </DialogTitle>
          <DialogDescription>
            Use your current location to update your profile. Your wallet display currency will update automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!locationDetected ? (
            <div className="space-y-3">
              <Button
                onClick={handleDetectLocation}
                disabled={detecting}
                className="h-12 w-full"
              >
                {detecting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Detecting your location...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Navigation className="w-5 h-5" />
                    Use My Current Location
                  </span>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                We use your device's GPS to verify your location
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Read-only location fields — matches signup */}
              <div className="space-y-3 rounded-[8px] border border-primary/40 bg-primary/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-primary">Location Detected</span>
                </div>

                {detectedCountry && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Country</Label>
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{detectedCountry}</span>
                    </div>
                  </div>
                )}

                {detectedState && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">State</Label>
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{detectedState}</span>
                    </div>
                  </div>
                )}

                {detectedCity && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">City</Label>
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{detectedCity}</span>
                    </div>
                  </div>
                )}

                {detectedSuburb && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Suburb / Town</Label>
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm text-foreground">{detectedSuburb}</span>
                    </div>
                  </div>
                )}

                {!detectedSuburb && !detectedCity && detectedState && (
                  <p className="text-xs text-muted-foreground">
                    Suburb/city not detected — you'll appear under your state
                  </p>
                )}
              </div>

              <button
                onClick={handleDetectLocation}
                disabled={detecting}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Navigation className="w-3 h-3" />
                {detecting ? "Detecting..." : "Re-detect location"}
              </button>
            </div>
          )}

          {/* Currency conversion preview */}
          {currencyChanged && newCountry && currentCountry && (
            <div className="space-y-1.5 rounded-[8px] border border-primary/40 bg-primary/10 p-3">
              <p className="text-xs font-medium text-primary">Currency will change</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {currentCountry.currency} ({currentCountry.currencySymbol})
                </span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {newCountry.currency} ({newCountry.currencySymbol})
                </span>
              </div>
              {walletBalanceUsd > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {formatCurrency(
                      usdToLocal(walletBalanceUsd, currentCountry.currency),
                      currentCountryCode
                    )}
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                  <span className="text-foreground">
                    {formatCurrency(
                      usdToLocal(walletBalanceUsd, newCountry.currency),
                      detectedCountryCode
                    )}
                  </span>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Display only — your balance stays the same in JVC.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!locationDetected}
              className="flex-1 disabled:opacity-40"
            >
              Save Location
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
