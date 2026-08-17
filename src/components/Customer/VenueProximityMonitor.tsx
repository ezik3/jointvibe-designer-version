import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MapPin, LogOut, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useUserCheckIn } from "@/hooks/useUserCheckIn";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

const PROXIMITY_RADIUS_METERS = 100; // 100m radius
const CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

interface VenueLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

const VenueProximityMonitor = () => {
  const { t } = useTranslation('venue');
  const { user } = useAuth();
  const { currentCheckIn } = useUserCheckIn();
  const { latitude, longitude, isWithinRadius, getDistanceTo } = useGeolocation({
    watchPosition: true,
    enableHighAccuracy: true,
  });

  const [venueLocation, setVenueLocation] = useState<VenueLocation | null>(null);
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const [hasPrompted, setHasPrompted] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Fetch venue location when checked in
  useEffect(() => {
    const fetchVenueLocation = async () => {
      if (!currentCheckIn?.venueId) {
        setVenueLocation(null);
        setShowExitPrompt(false);
        setHasPrompted(false);
        return;
      }

      const { data, error } = await supabase
        .from("venues")
        .select("id, name, latitude, longitude")
        .eq("id", currentCheckIn.venueId)
        .eq("venue_status", "live")
        .single();

      if (!error && data && data.latitude && data.longitude) {
        setVenueLocation({
          id: data.id,
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
        });
      } else {
        setVenueLocation(null);
      }
    };

    fetchVenueLocation();
  }, [currentCheckIn?.venueId]);

  // Monitor proximity
  useEffect(() => {
    if (!venueLocation || !latitude || !longitude || hasPrompted) {
      return;
    }

    const isNearVenue = isWithinRadius(
      venueLocation.latitude,
      venueLocation.longitude,
      PROXIMITY_RADIUS_METERS
    );

    // If user is outside the venue radius, show prompt
    if (!isNearVenue) {
      const distance = getDistanceTo(venueLocation.latitude, venueLocation.longitude);
      console.log(`User is ${distance?.toFixed(0)}m from ${venueLocation.name}`);
      
      // Only show prompt once per check-in session
      setShowExitPrompt(true);
      setHasPrompted(true);
    }
  }, [latitude, longitude, venueLocation, isWithinRadius, getDistanceTo, hasPrompted]);

  const handleCheckout = useCallback(async () => {
    if (!user || !currentCheckIn?.venueId) return;

    setIsCheckingOut(true);
    
    const { error } = await supabase
      .from("check_ins")
      .update({ checked_out_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("venue_id", currentCheckIn.venueId)
      .is("checked_out_at", null);

    if (error) {
      toast.error("Failed to checkout");
      console.error(error);
    } else {
      toast.success(`Checked out of ${currentCheckIn.venueName || "venue"}`);
    }
    
    setIsCheckingOut(false);
    setShowExitPrompt(false);
  }, [user, currentCheckIn]);

  const handleDismiss = () => {
    setShowExitPrompt(false);
  };

  // Don't render anything if no check-in or no venue location
  if (!currentCheckIn || !venueLocation) {
    return null;
  }

  return (
    <AnimatePresence>
      {showExitPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 z-50"
        >
          <div className="bg-secondary/95 backdrop-blur-lg rounded-2xl p-4 border border-border/50 shadow-2xl">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>

            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-6 h-6 text-orange-400" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-sm">
                  Left {venueLocation.name}?
                </h3>
                <p className="text-white/60 text-xs">
                  You appear to be outside the venue area
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 mt-4">
              <Button
                onClick={handleDismiss}
                variant="ghost"
                size="sm"
                className="flex-1 text-white/70 hover:text-white hover:bg-white/10"
              >
                I'm still here
              </Button>
              <Button
                onClick={handleCheckout}
                size="sm"
                disabled={isCheckingOut}
                className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white"
              >
                {isCheckingOut ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogOut className="w-4 h-4 mr-1" />
                    Checkout
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VenueProximityMonitor;
