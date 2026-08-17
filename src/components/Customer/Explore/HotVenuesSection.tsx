import { useState, useEffect } from "react";
import { Flame, MapPin, Tag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VenueTierBadge from "@/components/Venue/VenueTierBadge";
import { type VenueTierName } from "@/hooks/useVenueTier";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { calculateVenueEnergy } from "@/utils/venueEnergyScoring";
import { useTranslation } from 'react-i18next';

interface HotVenue {
  id: string;
  name: string;
  image_url?: string;
  city?: string;
  activity_score: number;
  check_ins_count: number;
  current_occupancy: number;
}

interface HotVenuesSectionProps {
  venues: HotVenue[];
  loading?: boolean;
}

const HotVenuesSection = ({ venues, loading }: HotVenuesSectionProps) => {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const [venueTiers, setVenueTiers] = useState<Record<string, VenueTierName>>({});
  const [venueDeals, setVenueDeals] = useState<Record<string, { headline: string; discount_text: string }>>({});

  useEffect(() => {
    if (!venues.length) return;
    const ids = venues.map(v => v.id);

    // Fetch tiers
    (supabase as any).from("venue_tier_scores").select("venue_id, current_tier").in("venue_id", ids)
      .then(({ data }: any) => {
        if (data) {
          const map: Record<string, VenueTierName> = {};
          data.forEach((d: any) => { map[d.venue_id] = d.current_tier; });
          setVenueTiers(map);
        }
      });

    // Fetch active deals for these venues (9c)
    (supabase as any).from("venue_deals_library")
      .select("venue_id, headline, discount_text")
      .eq("status", "published")
      .in("venue_id", ids)
      .then(({ data }: any) => {
        if (data) {
          const map: Record<string, { headline: string; discount_text: string }> = {};
          data.forEach((d: any) => { if (!map[d.venue_id]) map[d.venue_id] = d; });
          setVenueDeals(map);
        }
      });
  }, [venues]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-red-500" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-36 h-28 rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (venues.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-red-500" />
          <h3 className="font-semibold text-white">{t("discover.hot_venues")}</h3>
        </div>
        <div className="p-6 text-center bg-white/5 rounded-xl border border-white/10">
          <p className="text-white/50 text-sm">{t("discover.no_hot_venues")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 text-red-500" />
        <h3 className="font-semibold text-white">{t("discover.hot_venues")}</h3>
      </div>
      
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
        {venues.slice(0, 8).map((venue, index) => (
          <div
            key={venue.id}
            onClick={() => navigate(`/app/venue/${venue.id}`)}
            className="relative w-36 h-28 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-red-500/20 to-orange-500/20 group cursor-pointer hover:scale-105 transition-transform"
          >
            {venue.image_url ? (
              <img
                src={venue.image_url}
                alt={venue.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-red-500/30 via-orange-500/30 to-yellow-500/30" />
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            
            {/* Rank badge */}
            <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-bold shadow-lg">
              {index + 1}
            </div>
            
            {/* Activity indicator + tier badge + deal badge */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              {/* Deal badge (9c) */}
              {venueDeals[venue.id] && (
                <Popover>
                  <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button className="flex items-center gap-0.5 bg-cyan-500/90 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-black hover:bg-cyan-400 transition-colors">
                      <Tag className="w-2.5 h-2.5" />
                       {t("common:deals.deal")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 bg-zinc-900 border-zinc-700" onClick={(e) => e.stopPropagation()}>
                    <p className="text-white font-semibold text-sm">{venueDeals[venue.id].headline}</p>
                    <p className="text-cyan-400 text-xs mt-1">{venueDeals[venue.id].discount_text}</p>
                    <Button
                      size="sm"
                      className="w-full mt-2 bg-cyan-500 hover:bg-cyan-600 text-black text-xs h-7"
                      onClick={() => navigate(`/app/venue/${venue.id}`)}
                    >
                      {t("common:deals.view_deal")}
                    </Button>
                  </PopoverContent>
                </Popover>
              )}
              {venueTiers[venue.id] && venueTiers[venue.id] !== "bronze" && (
                <VenueTierBadge tier={venueTiers[venue.id]} size="sm" />
              )}
              {/* Activity dot — coloured by energy state derived from occupancy */}
              {(() => {
                const energyState = calculateVenueEnergy({
                  checkedInCount:        venue.current_occupancy,
                  headingThereCount:     0,
                  maybeGoingCount:       0,
                  recentArrivalCount:    0,
                  insideProofEventCount: 0,
                }).state;
                const dotClass =
                  energyState === "trending"
                    ? "bg-orange-500 animate-pulse"
                    : energyState === "busy"
                    ? "bg-amber-400 animate-pulse"
                    : energyState === "building"
                    ? "bg-cyan-400"
                    : "bg-green-500";
                return (
                  <div className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded-full">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                    <span className="text-white text-[9px]">{venue.current_occupancy}</span>
                  </div>
                );
              })()}
            </div>
            
            {/* Content */}
            <div className="absolute bottom-2 left-2 right-2">
              <h4 className="text-white text-sm font-semibold truncate">{venue.name}</h4>
              <div className="flex items-center gap-1 text-white/60 text-[10px]">
                <MapPin className="w-2.5 h-2.5" />
                <span>{venue.city || t("common:app.unknown")}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HotVenuesSection;
