import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, ExternalLink, MapPin, X } from "lucide-react";
import type { DriverSignupAd } from "@/hooks/useDriverSignupAd";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ad: DriverSignupAd | null;
}

/**
 * Larger in-app preview of a driver-signup auto ad. Opens when the small
 * card is tapped, then routes to the advertiser's link via the View button.
 * Layout follows the user's reference (image hero, headline, location, price,
 * specs grid, View CTA).
 */
export default function DriverSignupAdPreviewDialog({ open, onOpenChange, ad }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!ad) return null;

  const auto: any = ad.auto_details || {};
  const price = typeof auto.price === "number" ? auto.price : null;
  const weekly = typeof auto.price_weekly === "number" ? auto.price_weekly : null;
  const isSale = !auto.listing_type || auto.listing_type === "for_sale";
  const priceLabel = isSale
    ? (price ? `$${price.toLocaleString()}` : null)
    : (weekly ? `$${Number(weekly).toLocaleString()}/wk` : null);
  const vehicleLine = [auto.year, auto.make, auto.model].filter(Boolean).join(" ");
  const location = [auto.city, auto.country].filter(Boolean).join(", ");

  const handleView = () => {
    if (ad.cta_url) window.open(ad.cta_url, "_blank", "noopener");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="customer-dialog-surface customer-dialog-surface--wide p-0 overflow-hidden text-[var(--customer-modal-text)]"
        // Hide the default close X (we add our own styled one over the image)
      >
        {/* Hero image */}
        <div className="relative w-full aspect-video bg-black">
          {ad.media_url && !imgFailed ? (
            <img
              src={ad.media_url}
              alt={ad.headline}
              className="w-full h-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Car className="w-16 h-16 text-white/20" />
            </div>
          )}

          {/* Gradient overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="customer-modal-secondary absolute top-3 right-3 w-9 h-9 p-0 flex items-center justify-center z-10 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          {/* Headline overlay */}
          <div className="absolute inset-x-0 bottom-0 p-5 space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
              Sponsored{vehicleLine ? ` • ${vehicleLine}` : ""}
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
              {ad.headline}
            </h2>
            {location && (
              <p className="text-sm text-white/70 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {location}
              </p>
            )}
            {priceLabel && (
              <p className="text-2xl font-bold text-white pt-1">
                {priceLabel}
              </p>
            )}
            <div className="pt-3">
              <Button
                onClick={handleView}
                size="sm"
                className="bg-white text-black hover:bg-white/90 font-semibold px-5"
              >
                View
              </Button>
            </div>
          </div>
        </div>

        {/* Specs grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[var(--customer-modal-raised)]">
          <SpecCell value={auto.km != null ? Number(auto.km).toLocaleString() : "—"} label="Kilometres" />
          <SpecCell value={auto.transmission || "—"} label="Transmission" />
          <SpecCell value={auto.fuel || auto.fuel_type || "—"} label="Fuel" />
          <SpecCell value={ad.media_url ? "1" : "0"} label="Media" />
        </div>

        {ad.description && (
          <div className="px-4 pb-4 -mt-1">
            <p className="text-sm text-white/70 leading-relaxed line-clamp-4">
              {ad.description}
            </p>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="px-4 pb-4">
          <Button
            onClick={handleView}
            className="customer-modal-primary w-full font-semibold gap-2"
            size="lg"
          >
            {ad.cta_text || "View Listing"}
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SpecCell({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-[6px] bg-[var(--customer-modal-canvas)] border border-[var(--customer-modal-line)] p-3 text-center">
      <p className="text-lg font-bold text-[var(--customer-modal-text)] truncate capitalize">{value}</p>
      <p className="text-[11px] text-[var(--customer-modal-muted)]">{label}</p>
    </div>
  );
}
