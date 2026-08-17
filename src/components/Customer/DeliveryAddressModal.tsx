import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Clock, Loader2, MapPin, Navigation, Truck } from "lucide-react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useTranslation } from "react-i18next";
import "./delivery-address-modal.css";

interface DeliveryAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (address: string, lat: number, lng: number) => void;
  venueLocation: { lat: number; lng: number } | null;
  venueName: string;
  maxDeliveryRadius?: number;
}

export const DeliveryAddressModal: React.FC<DeliveryAddressModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  venueLocation,
  venueName,
  maxDeliveryRadius = 20,
}) => {
  const { t } = useTranslation("common");
  const [address, setAddress] = useState("");
  const [manualLat, setManualLat] = useState<number | null>(null);
  const [manualLng, setManualLng] = useState<number | null>(null);
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { latitude, longitude, loading, error: geoError, requestLocation } = useGeolocation({
    enableHighAccuracy: true,
  });

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const currentLat = useCurrentLocation ? latitude : manualLat;
  const currentLng = useCurrentLocation ? longitude : manualLng;

  const distance = venueLocation && currentLat && currentLng
    ? calculateDistance(venueLocation.lat, venueLocation.lng, currentLat, currentLng)
    : null;

  const isWithinDeliveryRadius = distance !== null && distance <= maxDeliveryRadius;
  const estimatedTime = distance ? Math.round(15 + (distance * 3)) : null;

  const handleConfirm = () => {
    if (!currentLat || !currentLng) {
      setError(t("delivery_modal.provide_location"));
      return;
    }
    if (!isWithinDeliveryRadius) {
      setError(t("delivery_modal.only_delivers", { venue: venueName, radius: maxDeliveryRadius }));
      return;
    }
    if (!address.trim()) {
      setError(t("delivery_modal.address_required"));
      return;
    }
    onConfirm(address, currentLat, currentLng);
  };

  useEffect(() => {
    if (isOpen && useCurrentLocation && !latitude && !loading) {
      requestLocation();
    }
  }, [isOpen, useCurrentLocation]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="customer-dialog-surface delivery-address-dialog !max-w-[480px] !gap-0 !p-0">
        <DialogHeader className="delivery-address-modal__header">
          <span className="delivery-address-modal__header-icon" aria-hidden="true"><Truck /></span>
          <div>
            <DialogTitle>{t("delivery_modal.title")}</DialogTitle>
            <DialogDescription>{venueName}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="delivery-address-modal__body">
          <div className="delivery-address-modal__method" role="group" aria-label="Delivery location method">
            <button
              type="button"
              onClick={() => setUseCurrentLocation(true)}
              className={useCurrentLocation ? "is-active" : ""}
            >
              <Navigation />
              <span>{t("delivery_modal.use_my_location")}</span>
            </button>
            <button
              type="button"
              onClick={() => setUseCurrentLocation(false)}
              className={!useCurrentLocation ? "is-active" : ""}
            >
              <MapPin />
              <span>{t("delivery_modal.enter_address")}</span>
            </button>
          </div>

          {useCurrentLocation && (
            <div className={`delivery-address-modal__status ${geoError ? "is-error" : latitude && longitude ? "is-ready" : ""}`}>
              {loading ? (
                <><Loader2 className="animate-spin" /><span>{t("delivery_modal.getting_location")}</span></>
              ) : geoError ? (
                <>
                  <AlertCircle />
                  <span>{geoError}</span>
                  <Button type="button" variant="link" size="sm" onClick={requestLocation} className="delivery-address-modal__retry">
                    {t("delivery_modal.retry")}
                  </Button>
                </>
              ) : latitude && longitude ? (
                <><CheckCircle2 /><span>{t("delivery_modal.location_detected")}</span></>
              ) : null}
            </div>
          )}

          <label className="delivery-address-modal__field">
            <span>{useCurrentLocation ? t("delivery_modal.confirm_address_label") : t("delivery_modal.enter_address_label")}</span>
            <Input
              placeholder={t("delivery_modal.address_placeholder")}
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setError(null);
              }}
            />
          </label>

          {distance !== null && (
            <div className={`delivery-address-modal__distance ${isWithinDeliveryRadius ? "is-within" : "is-outside"}`}>
              <div>
                <MapPin />
                <span>{t("delivery_modal.km_away", { distance: distance.toFixed(1) })}</span>
              </div>
              {isWithinDeliveryRadius && estimatedTime && (
                <div className="delivery-address-modal__estimate">
                  <Clock />
                  <span>{t("delivery_modal.minutes_range", { from: estimatedTime, to: estimatedTime + 10 })}</span>
                </div>
              )}
              {!isWithinDeliveryRadius && (
                <p>{t("delivery_modal.out_of_range", { venue: venueName, radius: maxDeliveryRadius, over: (distance - maxDeliveryRadius).toFixed(1) })}</p>
              )}
            </div>
          )}

          {error && (
            <div className="delivery-address-modal__error">
              <AlertCircle />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={handleConfirm}
            disabled={!isWithinDeliveryRadius || !address.trim() || (!currentLat || !currentLng)}
            className="delivery-address-modal__confirm"
          >
            <Truck />
            <span>{isWithinDeliveryRadius
              ? t("delivery_modal.confirm_location")
              : distance
                ? t("delivery_modal.outside_area")
                : t("delivery_modal.enter_address")}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
