import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Navigation, Building2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export interface LocationData {
  type: 'venue' | 'custom';
  name: string;
  venueId?: string;
  coordinates?: { lat: number; lng: number };
}

interface Venue {
  id: string;
  name: string;
  address: string;
  city?: string;
}

interface LocationVenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation: LocationData | null;
  onSelectLocation: (location: LocationData | null) => void;
}

const LocationVenueModal = ({
  isOpen,
  onClose,
  selectedLocation,
  onSelectLocation,
}: LocationVenueModalProps) => {
  const { t } = useTranslation('feed');
  const [searchQuery, setSearchQuery] = useState("");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [customLocation, setCustomLocation] = useState("");
  const [activeTab, setActiveTab] = useState<'venue' | 'custom'>('venue');
  const [detectingLocation, setDetectingLocation] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchVenues();
    }
  }, [isOpen]);

  const fetchVenues = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('venues')
        .select('id, name, address, city')
        .limit(50);

      if (data) {
        setVenues(data);
      }
    } catch (error) {
      console.error('Error fetching venues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("location.geolocation_not_supported"));
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Use reverse geocoding to get location name
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${position.coords.longitude},${position.coords.latitude}.json?access_token=${import.meta.env.VITE_MAPBOX_TOKEN || 'pk.placeholder'}`
          );
          const data = await response.json();
          const placeName = data.features?.[0]?.place_name || t("location.current_location");
          
          onSelectLocation({
            type: 'custom',
            name: placeName,
            coordinates: { lat: position.coords.latitude, lng: position.coords.longitude },
          });
          toast.success(t("location.location_detected"));
          onClose();
        } catch {
          onSelectLocation({
            type: 'custom',
            name: t("location.current_location"),
            coordinates: { lat: position.coords.latitude, lng: position.coords.longitude },
          });
          onClose();
        }
        setDetectingLocation(false);
      },
      () => {
        toast.error(t("location.could_not_get_location"));
        setDetectingLocation(false);
      }
    );
  };

  const handleSelectVenue = (venue: Venue) => {
    onSelectLocation({
      type: 'venue',
      name: venue.name,
      venueId: venue.id,
    });
    onClose();
  };

  const handleSetCustomLocation = () => {
    if (customLocation.trim()) {
      onSelectLocation({
        type: 'custom',
        name: customLocation.trim(),
      });
      onClose();
    }
  };

  const handleClearLocation = () => {
    onSelectLocation(null);
    onClose();
  };

  const filteredVenues = venues.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="customer-dialog-surface">
        <DialogHeader>
          <DialogTitle className="text-[var(--customer-modal-text)] flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[var(--customer-modal-cyan)]" />
            {t("location.add_location")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Location Button */}
          <Button
            onClick={handleUseCurrentLocation}
            disabled={detectingLocation}
            className="customer-modal-secondary w-full text-[var(--customer-modal-cyan)]"
          >
            {detectingLocation ? (
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <Navigation className="w-4 h-4 mr-2" />
            )}
            {t("location.use_current_location")}
          </Button>

          {/* Clear Location if set */}
          {selectedLocation && (
            <div className="flex items-center gap-2 p-3 bg-[var(--customer-modal-cyan-soft)] border border-[var(--customer-modal-cyan)] rounded-[6px]">
              <MapPin className="w-4 h-4 text-[var(--customer-modal-cyan)]" />
              <span className="flex-1 text-sm text-[var(--customer-modal-text)]">{selectedLocation.name}</span>
              <button
                onClick={handleClearLocation}
                className="p-1 hover:bg-[var(--customer-modal-raised)] rounded-[4px]"
              >
                <X className="w-4 h-4 text-[var(--customer-modal-muted)]" />
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="customer-modal-segmented grid grid-cols-2 gap-1">
            <button
              onClick={() => setActiveTab('venue')}
              className={`py-2 px-4 rounded-[5px] font-medium transition-colors ${
                activeTab === 'venue'
                  ? 'is-active'
                  : 'text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]'
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              {t("location.tag_venue")}
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`py-2 px-4 rounded-[5px] font-medium transition-colors ${
                activeTab === 'custom'
                  ? 'is-active'
                  : 'text-[var(--customer-modal-muted)] hover:bg-[var(--customer-modal-raised)]'
              }`}
            >
              <MapPin className="w-4 h-4 inline mr-2" />
              {t("location.custom")}
            </button>
          </div>

          {activeTab === 'venue' ? (
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--customer-modal-faint)]" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("location.search_venues")}
                  className="customer-modal-field pl-10"
                />
              </div>

              {/* Venues List */}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {loading ? (
                  <div className="text-center py-8 text-[var(--customer-modal-faint)]">{t("location.loading_venues")}</div>
                ) : filteredVenues.length === 0 ? (
                  <div className="text-center py-8 text-[var(--customer-modal-faint)]">
                    {searchQuery ? t("location.no_venues_found") : t("location.no_venues_available")}
                  </div>
                ) : (
                  filteredVenues.map(venue => (
                    <button
                      key={venue.id}
                      onClick={() => handleSelectVenue(venue)}
                      className={`customer-modal-list-item w-full flex items-center gap-3 p-3 transition-colors ${
                        selectedLocation?.venueId === venue.id
                          ? 'is-selected'
                          : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-[6px] bg-[var(--customer-modal-cyan-soft)] flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-[var(--customer-modal-cyan)]" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-[var(--customer-modal-text)] font-medium">{venue.name}</p>
                        <p className="text-xs text-[var(--customer-modal-faint)]">{venue.address}</p>
                      </div>
                      {selectedLocation?.venueId === venue.id && (
                        <div className="w-6 h-6 rounded-full bg-[var(--customer-modal-cyan)] flex items-center justify-center">
                          <Check className="w-4 h-4 text-[var(--customer-modal-canvas)]" />
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <Input
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder={t("location.enter_location_name")}
                className="customer-modal-field"
              />
              <Button
                onClick={handleSetCustomLocation}
                disabled={!customLocation.trim()}
                className="customer-modal-primary w-full"
              >
                {t("location.set_location")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationVenueModal;
