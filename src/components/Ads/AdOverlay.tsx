import { ExternalLink, Home, Building2, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';

interface AutoDetails {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  listing_type?: string | null;
}

interface AdOverlayProps {
  headline: string;
  description?: string | null;
  propertyPrice?: number | null;
  propertyType: string;
  propertyAddress: string;
  ctaText?: string | null;
  ctaUrl?: string | null;
  onCtaClick: () => void;
  variant?: 'real_estate' | 'auto';
  autoDetails?: AutoDetails | null;
  position?: 'bottom-left' | 'top-right';
}

const AdOverlay = ({
  headline,
  description,
  propertyPrice,
  propertyType,
  propertyAddress,
  ctaText,
  ctaUrl,
  onCtaClick,
  variant = 'real_estate',
  autoDetails = null,
  position = 'bottom-left',
}: AdOverlayProps) => {
  const { t } = useTranslation('common');
  const formatPrice = (price: number) => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(1)}M`;
    }
    if (price >= 1000) {
      return `$${(price / 1000).toFixed(0)}K`;
    }
    return `$${price}`;
  };

  const handleClick = () => {
    onCtaClick();
    if (ctaUrl) {
      window.open(ctaUrl, "_blank", "noopener,noreferrer");
    }
  };

  const isAuto = variant === 'auto';
  const Icon = isAuto ? Car : (propertyType === "lease" ? Building2 : Home);
  const typeLabel = isAuto
    ? (autoDetails?.listing_type === 'rent' ? 'For Rent' : autoDetails?.listing_type === 'lease' ? 'For Lease' : 'For Sale')
    : (propertyType === "lease" ? "For Lease" : "For Sale");

  const vehicleLine = isAuto
    ? [autoDetails?.year, autoDetails?.make, autoDetails?.model].filter(Boolean).join(' ')
    : '';

  const containerPos = position === 'top-right'
    ? "absolute top-4 right-4 left-4 md:left-auto md:right-6 md:top-6 md:max-w-sm z-20"
    : "absolute bottom-24 left-4 right-4 md:left-6 md:right-auto md:max-w-sm z-20";

  const defaultCta = isAuto ? "View Listing" : "View Property";

  return (
    <div className={containerPos}>
      <div className="bg-black/60 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl">
        {/* Sponsored Label */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
            Sponsored{isAuto && vehicleLine ? ` • ${vehicleLine}` : ''}
          </span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Type & Price */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-neon-cyan" />
            <span className="text-xs font-medium text-neon-cyan uppercase tracking-wide">
              {typeLabel}
            </span>
          </div>
          {propertyPrice && (
            <span className="text-lg font-bold text-white">
              {formatPrice(propertyPrice)}
            </span>
          )}
        </div>

        {/* Headline */}
        <h3 className="text-white font-semibold text-base leading-tight mb-1">
          {headline}
        </h3>

        {/* Address / Location */}
        <p className="text-white/60 text-xs mb-3 truncate">
          {propertyAddress}
        </p>

        {/* Description (if present) */}
        {description && (
          <p className="text-white/70 text-xs mb-3 line-clamp-2">
            {description}
          </p>
        )}

        {/* CTA Button */}
        <Button
          onClick={handleClick}
          size="sm"
          className="w-full bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold text-sm gap-2"
        >
          {ctaText || defaultCta}
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

export default AdOverlay;
