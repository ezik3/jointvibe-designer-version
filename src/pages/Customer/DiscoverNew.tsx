import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  Bookmark,
  BookmarkCheck,
  Building2,
  Check,
  CheckCircle,
  ChevronDown,
  Flame,
  FlaskConical,
  Globe2,
  MapPin,
  MapPinned,
  Music2,
  Search,
  Star,
  UtensilsCrossed,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import RemoteOrderModal from "@/components/Customer/RemoteOrderModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserCheckIn } from "@/hooks/useUserCheckIn";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useDeliveryFee } from "@/hooks/useDeliveryFee";
import { fetchRegisteredLocations, getLocationsByCountry } from "@/utils/locationData";
import { globalCache } from "@/hooks/useGlobalPrefetch";
import { calculateVenueEnergy, venueEnergyStateLabel } from "@/utils/venueEnergyScoring";
import { useVenueFriendMomentumBatch } from "@/hooks/useVenueFriendMomentumBatch";
import { useTestVenueAccess } from "@/hooks/useTestVenueAccess";
import { useSavedVenueIds } from "@/hooks/useVenueFollow";
import { useTranslation } from "react-i18next";
import useCustomerDashboardPresentation from "@/hooks/useCustomerDashboardPresentation";
import "./discover-new.css";

const venueTypes = ["All", "Nightclubs", "Bars", "Restaurants", "Events"];

interface Venue {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  city: string | null;
  country: string | null;
  venue_type: string | null;
  vibe_score: number | null;
  current_occupancy: number | null;
  capacity: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_enabled: boolean | null;
  max_delivery_radius_km: number | null;
  reservations_enabled: boolean | null;
}

const REFERENCE_VENUE: Venue = {
  id: "reference",
  name: "My Spot",
  description: "Premium venue experience",
  image_url: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=85",
  city: null,
  country: null,
  venue_type: "Live music venue",
  vibe_score: null,
  current_occupancy: 0,
  capacity: null,
  address: null,
  latitude: null,
  longitude: null,
  delivery_enabled: false,
  max_delivery_radius_km: null,
  reservations_enabled: false,
};

interface VenueFilterOption {
  value: string;
  label: string;
}

interface VenueFilterDropdownProps {
  id: string;
  label: string;
  value: string;
  options: VenueFilterOption[];
  onChange: (value: string) => void;
  icon?: LucideIcon;
  active?: boolean;
}

const VenueFilterDropdown = ({
  id,
  label,
  value,
  options,
  onChange,
  icon: Icon,
  active = false,
}: VenueFilterDropdownProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    const closeWhenOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="discover-filter-dropdown" ref={menuRef}>
      <button
        ref={triggerRef}
        className={`discover-filter${active ? " is-active" : ""}${open ? " is-open" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        {Icon && <Icon aria-hidden="true" />}
        <span>{selectedOption?.label ?? label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="discover-filter-menu" id={`${id}-menu`} role="menu" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={selected ? "is-selected" : undefined}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span>{option.label}</span>
                {selected && <Check aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const VenueCardSkeleton = () => (
  <div className="discover-venue-card discover-venue-card--skeleton" aria-hidden="true">
    <div className="discover-venue-card__image skeleton" />
    <div className="discover-venue-card__body">
      <div className="discover-skeleton-line discover-skeleton-line--short skeleton" />
      <div className="discover-skeleton-line discover-skeleton-line--title skeleton" />
      <div className="discover-skeleton-line skeleton" />
      <div className="discover-skeleton-line discover-skeleton-line--medium skeleton" />
    </div>
  </div>
);

const DiscoverNew = () => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const [searchParams] = useSearchParams();
  const [selectedCountry, setSelectedCountry] = useState("All Countries");
  const [selectedCity, setSelectedCity] = useState("All Locations");
  const [selectedType, setSelectedType] = useState("All");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") ?? "");
  const [venues, setVenues] = useState<Venue[]>(
    () => (globalCache.venues as Venue[]) ?? [],
  );
  const [loading, setLoading] = useState(
    () => !(globalCache.venues as Venue[] | undefined)?.length,
  );
  const [countries, setCountries] = useState<string[]>([]);
  const [locations, setLocations] = useState<{ country: string; location: string }[]>([]);
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedVenueForOrder, setSelectedVenueForOrder] = useState<Venue | null>(null);
  const [venueDeals, setVenueDeals] = useState<Record<string, string>>({});
  const [venueVibes, setVenueVibes] = useState<Set<string>>(new Set());
  const [referenceVenueSaved, setReferenceVenueSaved] = useState(false);

  const { isCheckedInAt } = useUserCheckIn();
  const { latitude, longitude } = useGeolocation({ enableHighAccuracy: true });
  const { calculateDistance, calculateDeliveryFee } = useDeliveryFee();
  const { testVenues, isTestVenue } = useTestVenueAccess();
  const { savedVenueIds, pendingVenueIds, toggleSavedVenue } = useSavedVenueIds();

  useEffect(() => {
    setSearchQuery(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const loadAll = async () => {
      if (!(globalCache.venues as Venue[] | undefined)?.length) {
        setLoading(true);
      }

      try {
        const [locationsResult, venuesResult] = await Promise.all([
          fetchRegisteredLocations(),
          supabase
            .from("venues")
            .select(
              "id, name, description, image_url, city, country, venue_type, vibe_score, current_occupancy, capacity, address, latitude, longitude, delivery_enabled, max_delivery_radius_km, reservations_enabled",
            )
            .eq("approval_status", "approved")
            .eq("venue_status", "live")
            .not("verified_at", "is", null)
            .order("vibe_score", { ascending: false })
            .limit(50),
        ]);

        setCountries(locationsResult.countries);
        setLocations(locationsResult.locations);
        setAvailableLocations(
          getLocationsByCountry(locationsResult.locations, "All Countries"),
        );

        if (venuesResult.data) {
          setVenues(venuesResult.data);
          globalCache.venues = venuesResult.data;
          globalCache.lastFetch.venues = Date.now();
        }
      } catch (error) {
        console.error("DiscoverNew: failed to load venues", error);
      } finally {
        setLoading(false);
      }
    };

    void loadAll();
  }, []);

  useEffect(() => {
    const fetchDealVibeStatus = async () => {
      const [dealsResult, vibesResult] = await Promise.all([
        supabase
          .from("venue_deals_library")
          .select("venue_id, discount_text")
          .eq("status", "published")
          .limit(100),
        supabase
          .from("venue_vibes")
          .select("venue_id")
          .eq("status", "collecting")
          .limit(100),
      ]);

      if (dealsResult.data) {
        const deals: Record<string, string> = {};
        dealsResult.data.forEach((deal) => {
          deals[deal.venue_id] = deal.discount_text || "Deal";
        });
        setVenueDeals(deals);
      }

      if (vibesResult.data) {
        setVenueVibes(new Set(vibesResult.data.map((vibe) => vibe.venue_id)));
      }
    };

    void fetchDealVibeStatus();
  }, []);

  useEffect(() => {
    const nextLocations = getLocationsByCountry(locations, selectedCountry);
    setAvailableLocations(nextLocations);
    if (selectedCity !== "All Locations" && !nextLocations.includes(selectedCity)) {
      setSelectedCity("All Locations");
    }
  }, [locations, selectedCity, selectedCountry]);

  const canOrderFrom = (venue: Venue) =>
    Boolean(venue.delivery_enabled || venue.reservations_enabled);

  const getDeliveryInfo = (venue: Venue) => {
    if (!venue.latitude || !venue.longitude || !venue.delivery_enabled) {
      return { delivers: false, distance: null, fee: null };
    }

    if (latitude && longitude) {
      const distance = calculateDistance(
        venue.latitude,
        venue.longitude,
        latitude,
        longitude,
      );
      const maxRadius = venue.max_delivery_radius_km || 20;
      if (distance <= maxRadius) {
        return {
          delivers: true,
          distance: Math.round(distance * 10) / 10,
          fee: calculateDeliveryFee(distance).fare,
        };
      }

      return {
        delivers: false,
        distance: Math.round(distance * 10) / 10,
        fee: null,
      };
    }

    return { delivers: true, distance: null, fee: null };
  };

  const mergedVenues = (() => {
    const existingIds = new Set(venues.map((venue) => venue.id));
    const extraTestVenues = testVenues.filter((venue) => !existingIds.has(venue.id));
    return [...venues, ...extraTestVenues];
  })();

  const filteredVenues = mergedVenues
    .filter((venue) => {
      const matchesCountry =
        selectedCountry === "All Countries" || venue.country === selectedCountry;
      const matchesCity =
        selectedCity === "All Locations" || venue.city === selectedCity;
      const matchesType =
        selectedType === "All" ||
        venue.venue_type?.toLowerCase().includes(selectedType.toLowerCase());
      const matchesSearch =
        searchQuery === "" ||
        venue.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.description?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCountry && matchesCity && matchesType && matchesSearch;
    })
    .sort((firstVenue, secondVenue) => {
      const firstCheckedIn = isCheckedInAt(firstVenue.id);
      const secondCheckedIn = isCheckedInAt(secondVenue.id);
      if (firstCheckedIn && !secondCheckedIn) return -1;
      if (!firstCheckedIn && secondCheckedIn) return 1;
      return 0;
    });

  const usesReferenceFallback =
    !loading &&
    mergedVenues.length === 0 &&
    selectedCountry === "All Countries" &&
    selectedCity === "All Locations" &&
    selectedType === "All" &&
    searchQuery.trim() === "";
  const displayedVenues = usesReferenceFallback ? [REFERENCE_VENUE] : filteredVenues;

  const { momentumMap } = useVenueFriendMomentumBatch(
    filteredVenues.slice(0, 12).map((venue) => venue.id),
  );

  const getDefaultImage = (venueType: string | null) => {
    switch (venueType?.toLowerCase()) {
      case "nightclub":
      case "nightclubs":
        return "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600";
      case "bar":
      case "bars":
        return "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600";
      case "restaurant":
      case "restaurants":
        return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600";
      default:
        return "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600";
    }
  };

  const countryOptions = [
    { value: "All Countries", label: "All countries" },
    ...countries.map((country) => ({ value: country, label: country })),
  ];
  const locationOptions = [
    { value: "All Locations", label: "All locations" },
    ...availableLocations.map((location) => ({ value: location, label: location })),
  ];
  const typeOptions = venueTypes.map((type) => ({ value: type, label: type }));

  const clearFilters = () => {
    setSelectedType("All");
    setSelectedCountry("All Countries");
    setSelectedCity("All Locations");
    setSearchQuery("");
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, venueId: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigate(`/app/venue/${venueId}`);
  };

  return (
    <div className="discover-venues-page">
      <main className="discover-venues-main" aria-labelledby="venues-title">
        <header className="discover-venues-heading">
          <div>
            <p>Discover your next night out</p>
            <h1 id="venues-title">Venues</h1>
            <span>Find the places setting the tone in your city.</span>
          </div>
        </header>

        <section className="discover-venue-search-panel" aria-label="Find venues">
          <form
            className="discover-venue-search-form"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="discover-venue-search-field" htmlFor="venue-search">
              <Search aria-hidden="true" />
              <input
                id="venue-search"
                type="search"
                placeholder="Search venues, cities, or vibes"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                autoComplete="off"
              />
            </label>
            <button className="discover-venue-search-submit" type="submit">
              <span>Search</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </form>

          <div className="discover-venue-filter-row" aria-label="Venue filters">
            <VenueFilterDropdown
              id="venue-type-filter"
              label="Venue type"
              options={typeOptions}
              value={selectedType}
              onChange={setSelectedType}
              active
            />
            <VenueFilterDropdown
              id="venue-country-filter"
              label="Country"
              options={countryOptions}
              value={selectedCountry}
              onChange={setSelectedCountry}
              icon={Globe2}
              active={selectedCountry !== "All Countries"}
            />
            <VenueFilterDropdown
              id="venue-location-filter"
              label="Location"
              options={locationOptions}
              value={selectedCity}
              onChange={setSelectedCity}
              icon={MapPinned}
              active={selectedCity !== "All Locations"}
            />
          </div>
        </section>

        <section className="discover-venues-results" aria-labelledby="venue-results-title">
          <div className="discover-venues-results__heading">
            <div>
              <p>{isDashboardPresentation && displayedVenues.length === 1 ? "Featured venue" : "Featured venues"}</p>
              <h2 id="venue-results-title">A place worth checking in to</h2>
            </div>
            {!loading && (
              <span>
                {displayedVenues.length} {displayedVenues.length === 1 ? "venue" : "venues"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="discover-venues-list">
              {Array.from({ length: 3 }).map((_, index) => (
                <VenueCardSkeleton key={index} />
              ))}
            </div>
          ) : (
            <>
              <div className="discover-venues-list">
                {displayedVenues.map((venue) => {
                  const isReferenceVenue = venue.id === REFERENCE_VENUE.id;
                  const checkedIn = !isReferenceVenue && isCheckedInAt(venue.id);
                  const deliveryInfo = getDeliveryInfo(venue);
                  const isTest = !isReferenceVenue && isTestVenue(venue.id);
                  const saved = isReferenceVenue ? referenceVenueSaved : savedVenueIds.has(venue.id);
                  const savePending = !isReferenceVenue && pendingVenueIds.has(venue.id);
                  const energyResult = calculateVenueEnergy({
                    checkedInCount: venue.current_occupancy ?? 0,
                    headingThereCount: 0,
                    maybeGoingCount: 0,
                    recentArrivalCount: 0,
                    insideProofEventCount: 0,
                  });
                  const showEnergyBadge = energyResult.state !== "quiet";
                  const friendMomentum = momentumMap.get(venue.id);
                  const showFriendBadge = friendMomentum?.hasFriendActivity === true;

                  return (
                    <article
                      key={venue.id}
                      className={`discover-venue-card${isTest ? " is-test" : ""}${checkedIn ? " is-checked-in" : ""}`}
                      tabIndex={0}
                      onClick={() => navigate(`/app/venue/${venue.id}`)}
                      onKeyDown={(event) => handleCardKeyDown(event, venue.id)}
                    >
                      <div className="discover-venue-card__image">
                        <img
                          src={venue.image_url || getDefaultImage(venue.venue_type)}
                          alt={venue.name}
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="discover-venue-card__image-shade" />
                        <div className="discover-venue-card__badges">
                          {(isReferenceVenue ? "Up to 40% off" : venueDeals[venue.id]) && (
                            <span className="discover-venue-card__deal">
                              <BadgePercent aria-hidden="true" />
                              {isReferenceVenue ? "Up to 40% off" : venueDeals[venue.id]}
                            </span>
                          )}
                          {isTest && (
                            <span className="discover-venue-card__status">
                              <FlaskConical aria-hidden="true" />
                              Tester
                            </span>
                          )}
                          {checkedIn && !isTest && (
                            <span className="discover-venue-card__status">
                              <CheckCircle aria-hidden="true" />
                              Checked in
                            </span>
                          )}
                        </div>
                        <button
                          className={`discover-venue-card__save${saved ? " is-saved" : ""}`}
                          type="button"
                          aria-label={saved ? `Remove ${venue.name} from saved venues` : `Save ${venue.name}`}
                          aria-pressed={saved}
                          disabled={savePending}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isReferenceVenue) {
                              setReferenceVenueSaved((current) => !current);
                              return;
                            }
                            void toggleSavedVenue(venue.id);
                          }}
                        >
                          {saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                        </button>
                        {typeof venue.vibe_score === "number" && (
                          <span className="discover-venue-card__score">
                            <Star aria-hidden="true" />
                            {venue.vibe_score}
                          </span>
                        )}
                      </div>

                      <div className="discover-venue-card__body">
                        <div className="discover-venue-card__type">
                          <Music2 aria-hidden="true" />
                          {venue.venue_type || "Venue"}
                        </div>
                        <h3>{venue.name}</h3>
                        {isTest && <p className="discover-venue-card__test-copy">Test mode - only visible to you</p>}
                        <p className="discover-venue-card__description">
                          {venue.description?.replace(/^Owned by [^.]+\.?\s*/i, "") ||
                            `Premium ${venue.venue_type || "venue"} experience`}
                        </p>

                        {(showEnergyBadge || showFriendBadge || venueVibes.has(venue.id)) && (
                          <div className="discover-venue-card__signals">
                            {showEnergyBadge && (
                              <span>
                                <Flame aria-hidden="true" />
                                {venueEnergyStateLabel(energyResult.state)}
                              </span>
                            )}
                            {showFriendBadge && (
                              <span>
                                <Users aria-hidden="true" />
                                {friendMomentum!.signals.totalFriendCount} {friendMomentum!.signals.totalFriendCount === 1 ? "friend active" : "friends active"}
                              </span>
                            )}
                            {venueVibes.has(venue.id) && (
                              <span>
                                <Zap aria-hidden="true" />
                                Live vibe
                              </span>
                            )}
                          </div>
                        )}

                        <div className="discover-venue-card__location-row">
                          <span className="discover-venue-card__location">
                            <MapPin aria-hidden="true" />
                            {venue.city || venue.country || "Location TBD"}
                          </span>
                          {deliveryInfo.delivers && deliveryInfo.fee !== null && (
                            <span className="discover-venue-card__delivery">
                              ${deliveryInfo.fee.toFixed(2)} delivery
                            </span>
                          )}
                        </div>

                        <div className="discover-venue-card__actions">
                          {(canOrderFrom(venue) || isTest) && (
                            <button
                              className="discover-venue-card__order"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedVenueForOrder(venue);
                                setOrderModalOpen(true);
                              }}
                            >
                              <UtensilsCrossed aria-hidden="true" />
                              Order
                            </button>
                          )}
                          <button
                            className="discover-venue-card__action"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/app/venue/${venue.id}`);
                            }}
                          >
                            View venue
                            <ArrowUpRight aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {displayedVenues.length === 0 && (
                <div className="discover-venues-empty">
                  <div>
                    <Building2 aria-hidden="true" />
                  </div>
                  <h3>{t("feed:discover.no_venues_found")}</h3>
                  <p>
                    {venues.length === 0
                      ? "Be the first to register your venue on the platform!"
                      : "Try adjusting your filters or search term."}
                  </p>
                  {(selectedType !== "All" ||
                    selectedCountry !== "All Countries" ||
                    selectedCity !== "All Locations" ||
                    searchQuery) && (
                    <button type="button" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {selectedVenueForOrder && (
        <RemoteOrderModal
          isOpen={orderModalOpen}
          onClose={() => {
            setOrderModalOpen(false);
            setSelectedVenueForOrder(null);
          }}
          venueId={selectedVenueForOrder.id}
          venueName={selectedVenueForOrder.name}
          venueLatitude={selectedVenueForOrder.latitude ?? undefined}
          venueLongitude={selectedVenueForOrder.longitude ?? undefined}
          venueAddress={selectedVenueForOrder.address ?? undefined}
          deliveryEnabled={selectedVenueForOrder.delivery_enabled || isTestVenue(selectedVenueForOrder.id)}
          reservationsEnabled={selectedVenueForOrder.reservations_enabled || isTestVenue(selectedVenueForOrder.id)}
          isTestMode={isTestVenue(selectedVenueForOrder.id)}
          maxDeliveryRadius={selectedVenueForOrder.max_delivery_radius_km ?? 20}
          distanceToUser={getDeliveryInfo(selectedVenueForOrder).distance ?? undefined}
        />
      )}
    </div>
  );
};

export default DiscoverNew;
