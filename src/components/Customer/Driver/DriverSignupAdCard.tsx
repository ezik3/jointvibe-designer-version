import { useState } from "react";
import { Car, ExternalLink } from "lucide-react";
import type { DriverSignupAd } from "@/hooks/useDriverSignupAd";
import DriverSignupAdPreviewDialog from "./DriverSignupAdPreviewDialog";

interface Props {
  ad: DriverSignupAd | null;
  onClick: () => void;
}

const TAG_LABELS: Record<string, string> = {
  fuel_efficient: "Fuel efficient",
  low_maintenance: "Low maintenance",
  good_for_rideshare: "Driver recommended",
  electric: "Electric",
};

// Price display follows the advertiser's listing_type — never synthesised.
type ListingType = "for_sale" | "for_lease" | "rent_to_own" | undefined | null;
function getPriceDisplay(listingType: ListingType, price?: number | null, weekly?: number | null) {
  const isSale = !listingType || listingType === "for_sale";
  if (isSale) {
    return price && price > 0
      ? { main: `$${price.toLocaleString()}`, sub: null as string | null }
      : null;
  }
  return weekly && weekly > 0
    ? { main: `$${Number(weekly).toLocaleString()}/wk`, sub: null }
    : null;
}

/**
 * Vertical native ad card shown above the perks block in the driver signup
 * modal. Image-first layout (16:9) so car photos render properly.
 * Tapping opens a larger in-app preview dialog before sending the user out.
 */
export default function DriverSignupAdCard({ ad, onClick }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!ad) {
    return (
      <button
        type="button"
        onClick={() => window.open("/drive/partners", "_blank", "noopener")}
        className="w-full rounded-xl border border-white/10 bg-gradient-to-r from-cyan/5 to-purple/5 p-3 flex items-center gap-3 text-left hover:border-cyan/30 transition"
      >
        <div className="w-12 h-12 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
          <Car className="w-6 h-6 text-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Don't have a car?</p>
          <p className="text-xs text-white/60 truncate">Drive with JV partners — flexible plans available</p>
        </div>
        <ExternalLink className="w-4 h-4 text-white/40 shrink-0" />
      </button>
    );
  }

  const auto: any = ad.auto_details || {};
  const price = typeof auto.price === "number" ? auto.price : null;
  const weekly = typeof auto.price_weekly === "number" ? auto.price_weekly : null;
  const priceDisplay = getPriceDisplay(auto.listing_type, price, weekly);
  const tags: string[] = Array.isArray(auto.driver_tags) ? auto.driver_tags : [];
  const vehicleLine = [auto.year, auto.make, auto.model].filter(Boolean).join(" ");

  const openPreview = () => {
    onClick(); // existing trackClick
    setPreviewOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="w-full rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:border-cyan/40 transition text-left flex flex-col"
      >
        {/* Image on top, 16:9 — fits car photos beautifully */}
        <div className="relative w-full aspect-video bg-black/40">
          {ad.media_url && !imgFailed ? (
            <img
              src={ad.media_url}
              alt={ad.headline}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Car className="w-10 h-10 text-white/30" />
            </div>
          )}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[9px] uppercase tracking-wider text-white/80">
            Sponsored
          </div>
          {priceDisplay && (
            <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 backdrop-blur">
              <span className="text-sm font-bold text-cyan">{priceDisplay.main}</span>
            </div>
          )}
        </div>

        {/* Content below */}
        <div className="p-3 space-y-1.5 w-full">
          <p className="text-sm font-bold text-white truncate">{ad.headline}</p>
          {vehicleLine && (
            <p className="text-[11px] text-white/50 truncate">
              {vehicleLine}
              {auto.km ? ` · ${Number(auto.km).toLocaleString()}km` : ""}
              {auto.transmission ? ` · ${auto.transmission}` : ""}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            {tags.length > 0 ? (
              <div className="flex gap-1 flex-wrap">
                {tags.slice(0, 2).map((t) => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-300 border border-green-500/20">
                    {TAG_LABELS[t] || t}
                  </span>
                ))}
              </div>
            ) : <span />}
            <span className="text-[11px] font-semibold text-cyan shrink-0">
              {ad.cta_text || "View Listing"} →
            </span>
          </div>
        </div>
      </button>

      <DriverSignupAdPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        ad={ad}
      />
    </>
  );
}
