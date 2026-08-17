import { useState } from "react";
import { ExternalLink, Home, Building2, Car, X, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from 'react-i18next';

interface AutoDetailsLite {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  listing_type?: string | null;
}

interface AdBannerProps {
  headline: string;
  description?: string | null;
  propertyPrice?: number | null;
  propertyType: string;
  propertyAddress: string;
  ctaText?: string | null;
  ctaUrl?: string | null;
  onCtaClick: () => void;
  variant?: 'real_estate' | 'auto';
  autoDetails?: AutoDetailsLite | null;
}

const AdBanner = ({
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
}: AdBannerProps) => {
  const { t } = useTranslation('common');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

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
  const PropertyIcon = isAuto ? Car : (propertyType === "lease" ? Building2 : Home);
  const typeLabel = isAuto
    ? (autoDetails?.listing_type === 'rent' ? 'FOR RENT' : autoDetails?.listing_type === 'lease' ? 'FOR LEASE' : 'FOR SALE')
    : (propertyType === "lease" ? "FOR LEASE" : "FOR SALE");
  const vehicleLine = isAuto
    ? [autoDetails?.year, autoDetails?.make, autoDetails?.model].filter(Boolean).join(' ')
    : '';
  const displayHeadline = isAuto && vehicleLine ? `${headline} — ${vehicleLine}` : headline;
  const defaultCta = isAuto ? "View Listing" : "View Property";

  if (isDismissed) return null;

  return (
    <>
      {/* Desktop Banner - Horizontal above city tabs */}
      <div className="hidden md:block w-full px-4 mb-2">
        <div className="bg-black/60 backdrop-blur-xl rounded-xl p-3 border border-white/10 shadow-lg">
          <div className="flex items-center gap-4">
            {/* Sponsored Label */}
            <span className="text-[9px] uppercase tracking-widest text-white/40 font-medium px-2 py-0.5 bg-white/5 rounded">
              Sponsored
            </span>

            {/* Property Type Badge */}
            <div className="flex items-center gap-1.5">
              <PropertyIcon className="w-3.5 h-3.5 text-neon-cyan" />
              <span className="text-[10px] font-semibold text-neon-cyan uppercase tracking-wide">
                {typeLabel}
              </span>
            </div>

            {/* Headline - flex grow */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">{displayHeadline}</p>
              <p className="text-white/50 text-xs truncate">{propertyAddress}</p>
            </div>

            {/* Price */}
            {propertyPrice && (
              <span className="text-white font-bold text-lg">
                {formatPrice(propertyPrice)}
              </span>
            )}

            {/* CTA Button */}
            <Button
              onClick={handleClick}
              size="sm"
              className="bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold text-xs gap-1.5 shrink-0"
            >
              {ctaText || "View"}
              <ExternalLink className="w-3 h-3" />
            </Button>

            {/* Dismiss */}
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-white/40 hover:text-white/70" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Ticker - Bottom bar that scrolls */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30">
        <AnimatePresence>
          {isExpanded ? (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-black/90 backdrop-blur-xl border-t border-white/10 p-4 rounded-t-2xl"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsExpanded(false)}
                className="absolute top-2 right-2 p-2 hover:bg-white/10 rounded-full"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>

              {/* Sponsored Label */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
                  Sponsored
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Property Type & Price */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PropertyIcon className="w-4 h-4 text-neon-cyan" />
                  <span className="text-xs font-medium text-neon-cyan uppercase tracking-wide">
                    {typeLabel}
                  </span>
                </div>
                {propertyPrice && (
                  <span className="text-xl font-bold text-white">
                    {formatPrice(propertyPrice)}
                  </span>
                )}
              </div>

              {/* Headline */}
              <h3 className="text-white font-semibold text-base leading-tight mb-1">
                {displayHeadline}
              </h3>

              {/* Address */}
              <p className="text-white/60 text-sm mb-3">
                {propertyAddress}
              </p>

              {/* Description */}
              {description && (
                <p className="text-white/70 text-sm mb-4 line-clamp-3">
                  {description}
                </p>
              )}

              {/* CTA Button */}
              <Button
                onClick={handleClick}
                className="w-full bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold gap-2"
              >
                {ctaText || defaultCta}
                <ExternalLink className="w-4 h-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              className="bg-black/80 backdrop-blur-xl border-t border-white/10"
            >
              {/* Scrolling Ticker */}
              <div className="relative overflow-hidden h-12 flex items-center">
                {/* Expand button on left */}
                <button
                  onClick={() => setIsExpanded(true)}
                  className="absolute left-0 z-10 h-full px-3 bg-gradient-to-r from-black via-black/90 to-transparent flex items-center gap-1"
                >
                  <ChevronUp className="w-4 h-4 text-neon-cyan" />
                  <span className="text-[10px] uppercase tracking-wide text-neon-cyan font-medium">View</span>
                </button>

                {/* Scrolling content */}
                <div className="animate-marquee whitespace-nowrap pl-20 pr-8">
                  <span className="text-[10px] uppercase tracking-wider text-white/40 mr-3">Sponsored</span>
                  <span className="text-neon-cyan font-medium text-xs mr-3">{typeLabel}</span>
                  <span className="text-white font-medium text-sm mr-3">{displayHeadline}</span>
                  <span className="text-white/50 text-xs mr-3">•</span>
                  <span className="text-white/60 text-xs mr-3">{propertyAddress}</span>
                  {propertyPrice && (
                    <>
                      <span className="text-white/50 text-xs mr-3">•</span>
                      <span className="text-white font-bold text-sm">{formatPrice(propertyPrice)}</span>
                    </>
                  )}
                </div>

                {/* Duplicate for seamless scroll */}
                <div className="animate-marquee whitespace-nowrap pl-8" aria-hidden>
                  <span className="text-[10px] uppercase tracking-wider text-white/40 mr-3">Sponsored</span>
                  <span className="text-neon-cyan font-medium text-xs mr-3">{typeLabel}</span>
                  <span className="text-white font-medium text-sm mr-3">{displayHeadline}</span>
                  <span className="text-white/50 text-xs mr-3">•</span>
                  <span className="text-white/60 text-xs mr-3">{propertyAddress}</span>
                  {propertyPrice && (
                    <>
                      <span className="text-white/50 text-xs mr-3">•</span>
                      <span className="text-white font-bold text-sm">{formatPrice(propertyPrice)}</span>
                    </>
                  )}
                </div>

                {/* Dismiss button on right */}
                <button
                  onClick={() => setIsDismissed(true)}
                  className="absolute right-0 z-10 h-full px-3 bg-gradient-to-l from-black via-black/90 to-transparent flex items-center"
                >
                  <X className="w-4 h-4 text-white/40 hover:text-white/70" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default AdBanner;
