/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase RPCs are not represented in the generated client types. */
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserCheckIn } from "@/hooks/useUserCheckIn";
import { useGeolocation } from "@/hooks/useGeolocation";
import { toast } from "sonner";
import { recordTierEvent } from "@/hooks/useUserTier";
import VenueTierPublicBadge from "@/components/Venue/VenueTierPublicBadge";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import VibeSphere from "@/components/VibeSphere/VibeSphere";
import CheckinConflictModal from "@/components/Customer/CheckinConflictModal";
import VenueFollowButton from "@/components/Venue/VenueFollowButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TranslatedText } from "@/components/i18n/TranslatedText";
import { upsertUserVenueIntentSignal } from "@/utils/venueInterestSignals";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import {
  evaluatePresenceAndCheckInEligibility,
  normalizeEntryControlPolicy,
  normalizeSecurityOperationMode,
  type PresenceState,
} from "@/utils/venuePresencePolicy";
import { useTestVenueAccess } from "@/hooks/useTestVenueAccess";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MapPin,
  Users,
  Star,
  Clock,
  Phone,
  Globe,
  CheckCircle,
  ChevronLeft,
  Play,
  Calendar,
  Shirt,
  Shield,
  AlertCircle,
  Navigation,
  MapPinOff,
  Info,
  SlidersHorizontal,
  Gift,
  Zap,
  Flame,
  Heart,
  MessageSquare,
  FlaskConical,
  UserPlus,
} from "lucide-react";
import { useVenueEnergy } from "@/hooks/useVenueEnergy";
import { useVenueFriendMomentum } from "@/hooks/useVenueFriendMomentum";
import { useVenueFeed } from "@/hooks/useVenueFeed";
import { venueEnergyStateLabel } from "@/utils/venueEnergyScoring";
import "./immersive-venue.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || '';

interface Venue {
  id: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  venue_type?: string;
  vibe_score: number;
  current_occupancy: number;
  capacity?: number;
  image_url?: string;
  latitude?: number;
  longitude?: number;
  delivery_enabled?: boolean;
  max_delivery_radius_km?: number;
  source_language?: string | null;
  language_confidence?: number | null;
  minimum_entry_age?: number | null;
  entry_control_policy?: string | null;
  security_operation_mode?: string | null;
}

const REFERENCE_VENUE: Venue = {
  id: "9af6e89e",
  name: "My Spot",
  description: "Experience the pinnacle of nightlife and entertainment.",
  address: "54 Robbs Road, Morayfield Queensland 4506, Australia",
  city: "Morayfield",
  vibe_score: 0,
  current_occupancy: 0,
  image_url: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1800&q=85",
};

const REFERENCE_VENUE_DEAL = {
  id: "reference-deal",
  venue_id: "reference",
  venue_name: "My Spot",
  headline: "Flash sale - tonight only",
  discount_text: "Up to 40% off",
  description: "Get 40% off your next drink.",
};

// Check-in radius in meters (500m to account for GPS inaccuracy)
const CHECK_IN_RADIUS_METERS = 500;
const INTENT_ACTION_COOLDOWN_MS = 2000;
const CHECKIN_VISIBILITY_SELECTION_TIMEOUT_MS = 30_000;

// Mock venue details (would come from DB in production)
const venueDetails = {
  ageRestriction: "21+",
  ageRestrictionDetail: "Strictly 21+ - Valid physical ID or passport required for entry. No exceptions.",
  dressCode: "Smart Casual - No sportswear, baseball caps, or flip-flops. Designer sneakers allowed.",
  hours: {
    "Mon - Thu": "4:00 PM â€” 1:00 AM",
    "Fri - Sat": "4:00 PM â€” 2:00 AM",
    "Sunday": "4:00 PM â€” 12:00 AM"
  },
  phone: "+1 (555) 123-4567",
  website: "www.skylineslounge.com",
  rating: 4.8,
  features: ["Rooftop Terrace", "Award-winning DJs", "VIP Fashion Access", "Full-Service Bar", "Gourmet Dining"],
};

// Inline wrapper to fetch and display venue tier badge
function VenueTierPublicBadgeInlineWrapper({ venueId }: { venueId: string }) {
  const [tier, setTier] = useState<string | null>(null);
  useEffect(() => {
    if (!venueId || venueId === "mock") return;
    (supabase as any).from("venue_tier_scores").select("current_tier").eq("venue_id", venueId).maybeSingle()
      .then(({ data }: any) => { if (data) setTier(data.current_tier); });
  }, [venueId]);
  if (!tier) return null;
  return <VenueTierPublicBadge tier={tier as any} />;
}

const ImmersiveVenue = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { currentCheckIn } = useUserCheckIn();
  const { latitude: userLat, longitude: userLng, loading: locationLoading, error: locationError, requestLocation } = useGeolocation({ enableHighAccuracy: true });
  const { deals: venueDeals, redeemDeal } = useActiveDeals('venue_profile', 1);
  const { hasTestAccess } = useTestVenueAccess();
  const isReferenceVenue = id === "reference";
  const usesReferenceVenue = !id || isReferenceVenue;
  
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTestVenueView, setIsTestVenueView] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isReferenceFollowing, setIsReferenceFollowing] = useState(false);
  const [isReferencePounded, setIsReferencePounded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showVibeSphere, setShowVibeSphere] = useState(false);
  const [userStatus, setUserStatus] = useState<"at" | "heading" | "maybe" | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [fallbackCheckInPrompt, setFallbackCheckInPrompt] = useState<"guided" | "manual" | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [distanceToVenue, setDistanceToVenue] = useState<number | null>(null);
  const [hasActiveDeal, setHasActiveDeal] = useState(false);
  const [hasActiveVibe, setHasActiveVibe] = useState(false);
  const [isUpdatingIntent, setIsUpdatingIntent] = useState(false);
  const [lastIntentActionAt, setLastIntentActionAt] = useState(0);
  const [presenceState, setPresenceState] = useState<PresenceState>("not_nearby");
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [visibilityCountdownSeconds, setVisibilityCountdownSeconds] = useState<number | null>(null);
  
  // Mini-map refs
  const miniMapContainer = useRef<HTMLDivElement>(null);
  const miniMap = useRef<mapboxgl.Map | null>(null);
  const hasTriggeredVisibilityTimeoutRef = useRef(false);
  
  const [crowdStatus, setCrowdStatus] = useState({
    at: 0,
    heading: 0,
    maybe: 0,
  });

  // â”€â”€ Social energy systems â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Isolated hooks â€” each fetches its own data independently and degrades
  // gracefully on error. None of them touch moderation, bans, or operational
  // systems. See hook docs for full privacy and isolation guarantees.
  const _socialVenueId = id && id !== "mock" && !isReferenceVenue ? id : null;
  const { energy } = useVenueEnergy({ venueId: _socialVenueId });
  const { momentum } = useVenueFriendMomentum({ venueId: _socialVenueId });
  const { posts: venueFeedPosts, loading: venueFeedLoading } = useVenueFeed(
    _socialVenueId,
    { limit: 5 },
  );

  useEffect(() => {
    const fetchVenueInterestCounts = async () => {
      if (usesReferenceVenue || id === "mock") {
        setCrowdStatus({ at: 0, heading: 0, maybe: 0 });
        return;
      }

      const { data, error } = await (supabase as any).rpc(
        "get_venue_interest_signal_counts",
        { p_venue_id: id },
      );

      if (error) {
        console.error("Failed to fetch venue interest signal counts:", error);
        setCrowdStatus({ at: 0, heading: 0, maybe: 0 });
        return;
      }

      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setCrowdStatus({
        at: Number(row?.currently_at_count ?? 0),
        heading: Number(row?.heading_there_count ?? 0),
        maybe: Number(row?.maybe_going_count ?? 0),
      });
    };

    const fetchVenue = async () => {
      if (usesReferenceVenue) {
        setVenue(REFERENCE_VENUE);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("id", id)
        .eq("approval_status", "approved")
        .eq("venue_status", "live")
        .not("verified_at", "is", null)
        .single();

      if (error || !data) {
        // Not a public venue â€” check if user has test access
        const canTest = await hasTestAccess(id);
        if (canTest) {
          const { data: testData } = await supabase
            .from("venues")
            .select("*")
            .eq("id", id)
            .single();

          if (testData) {
            setVenue(testData);
            setIsTestVenueView(true);
            setLoading(false);
            return;
          }
        }
        // Venue not found and no test access â€” redirect
        setLoading(false);
        navigate("/app/venues", { replace: true });
        return;
      }

      setVenue(data);
      setLoading(false);
    };

    const checkIfCheckedIn = async () => {
      if (!user || usesReferenceVenue) return;

      const { data } = await supabase
        .from("check_ins")
        .select("*")
        .eq("user_id", user.id)
        .eq("venue_id", id)
        .is("checked_out_at", null)
        .single();

      if (data) {
        setIsCheckedIn(true);
        setUserStatus("at");
      }
    };

    const fetchUserIntentSignal = async () => {
      if (!user || usesReferenceVenue || id === "mock") return;

      const { data, error } = await (supabase as any)
        .from("venue_interest_signals")
        .select("signal_type, active, expires_at")
        .eq("user_id", user.id)
        .eq("venue_id", id)
        .eq("active", true)
        .gt("expires_at", new Date().toISOString())
        .order("set_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Failed to fetch user venue intent signal:", error);
        return;
      }

      if (data?.signal_type === "heading_there" && !isCheckedIn) {
        setUserStatus("heading");
      } else if (data?.signal_type === "maybe_going" && !isCheckedIn) {
        setUserStatus("maybe");
      } else if (!isCheckedIn) {
        setUserStatus(null);
      }
    };

    fetchVenue();
    checkIfCheckedIn();
    fetchVenueInterestCounts();
    fetchUserIntentSignal();

    // Fetch active deals/vibes for hero badges
    if (!usesReferenceVenue && id && id !== "mock") {
      (supabase as any).from('venue_deals_library').select('id').eq('venue_id', id).eq('status', 'published').limit(1)
        .then(({ data }: any) => setHasActiveDeal(!!(data && data.length)));
      (supabase as any).from('venue_vibes').select('id').eq('venue_id', id).eq('status', 'collecting').limit(1)
        .then(({ data }: any) => setHasActiveVibe(!!(data && data.length)));
    }

    // Realtime subscription for live check-in count updates
    if (!usesReferenceVenue && id && id !== "mock") {
      const channel = supabase
        .channel(createRealtimeChannelTopic(`venue-crowd-${id}`))
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "check_ins", filter: `venue_id=eq.${id}` },
          () => { fetchVenueInterestCounts(); }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "venue_interest_signals", filter: `venue_id=eq.${id}` },
          () => { fetchVenueInterestCounts(); }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [id, user, isCheckedIn, isReferenceVenue, usesReferenceVenue]);

  // Calculate distance to venue when user location or venue changes
  useEffect(() => {
    if (venue?.latitude && venue?.longitude && userLat && userLng) {
      const R = 6371000; // Radius of earth in meters
      const dLat = (venue.latitude - userLat) * Math.PI / 180;
      const dLon = (venue.longitude - userLng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(userLat * Math.PI / 180) * Math.cos(venue.latitude * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      setDistanceToVenue(distance);
    }
  }, [venue, userLat, userLng]);

  // Initialize mini-map when venue has location
  useEffect(() => {
    if (!miniMapContainer.current || miniMap.current || !venue?.latitude || !venue?.longitude || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    miniMap.current = new mapboxgl.Map({
      container: miniMapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [venue.longitude, venue.latitude],
      zoom: 14,
      interactive: false, // Static map for preview
    });

    // Add venue marker
    new mapboxgl.Marker({ color: '#00e5ff' })
      .setLngLat([venue.longitude, venue.latitude])
      .addTo(miniMap.current);

    return () => {
      miniMap.current?.remove();
      miniMap.current = null;
    };
  }, [venue?.latitude, venue?.longitude]);

  // Check if user is within check-in radius
  const hasVenueLocation = Boolean(venue?.latitude && venue?.longitude);
  const hasUserLocation = Boolean(userLat && userLng);
  const isWithinCheckInRadius = hasVenueLocation && hasUserLocation && distanceToVenue !== null && distanceToVenue <= CHECK_IN_RADIUS_METERS;
  const entryControlPolicy = normalizeEntryControlPolicy(venue?.entry_control_policy);
  const securityOperationMode = normalizeSecurityOperationMode(venue?.security_operation_mode);

  const presenceEvaluation = evaluatePresenceAndCheckInEligibility({
    policy: {
      minimumEntryAge: venue?.minimum_entry_age,
      entryControlPolicy: venue?.entry_control_policy,
      securityOperationMode: venue?.security_operation_mode,
    },
    isWithinVenueRadius: Boolean(isWithinCheckInRadius),
    isCheckedIn,
  });

  useEffect(() => {
    setPresenceState(presenceEvaluation.presenceState);
  }, [presenceEvaluation.presenceState]);

  const updateCheckInVisibility = async (
    visibility: "public" | "private",
    source: "user_prompt" | "timeout_default",
  ) => {
    if (!user || !currentCheckIn?.id || currentCheckIn.venueId !== id) return;
    if (isUpdatingVisibility) return;

    setIsUpdatingVisibility(true);
    try {
      const idempotencyKey = `visibility:${currentCheckIn.id}:${visibility}:${source}`;
      const { error } = await (supabase as any).rpc("update_checkin_visibility_selection", {
        p_checkin_id: currentCheckIn.id,
        p_visibility: visibility,
        p_visibility_source: source,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;

      if (source === "timeout_default") {
        toast.info("Check-in visibility defaulted to private.");
      } else {
        toast.success(visibility === "public" ? "You are checked in publicly." : "You are checked in privately.");
      }
    } catch (error) {
      console.error("Failed to update check-in visibility:", error);
      if (source !== "timeout_default") {
        toast.error("Failed to update visibility. Please try again.");
      }
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  useEffect(() => {
    if (!currentCheckIn || currentCheckIn.venueId !== id) {
      setVisibilityCountdownSeconds(null);
      hasTriggeredVisibilityTimeoutRef.current = false;
      return;
    }

    if (currentCheckIn.visibilitySelectionStatus !== "pending") {
      setVisibilityCountdownSeconds(null);
      hasTriggeredVisibilityTimeoutRef.current = false;
      return;
    }

    const deadlineMs = currentCheckIn.visibilitySelectionDeadline
      ? new Date(currentCheckIn.visibilitySelectionDeadline).getTime()
      : Date.now() + CHECKIN_VISIBILITY_SELECTION_TIMEOUT_MS;

    const tick = () => {
      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        setVisibilityCountdownSeconds(0);
        if (!hasTriggeredVisibilityTimeoutRef.current) {
          hasTriggeredVisibilityTimeoutRef.current = true;
          void updateCheckInVisibility("private", "timeout_default");
        }
        return;
      }
      setVisibilityCountdownSeconds(Math.ceil(remainingMs / 1000));
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [
    currentCheckIn?.id,
    currentCheckIn?.venueId,
    currentCheckIn?.visibilitySelectionDeadline,
    currentCheckIn?.visibilitySelectionStatus,
    id,
  ]);

  const handleCheckIn = async () => {
    if (!user) {
      toast.error("Please sign in to check in");
      return;
    }

    // Venue MUST have location set for check-in
    if (!hasVenueLocation) {
      toast.error("This venue hasn't set their location yet. Check-in unavailable.");
      return;
    }

    // User MUST have location enabled
    if (!hasUserLocation) {
      toast.error("Please enable location services to check in");
      requestLocation();
      return;
    }

    // Check proximity - must be within 100m of venue
    if (!isWithinCheckInRadius) {
      const distanceKm = distanceToVenue ? (distanceToVenue / 1000).toFixed(1) : 'unknown';
      toast.error(`You must be at the venue to check in. You're ${distanceKm}km away.`);
      return;
    }

    if (!presenceEvaluation.canCheckInNow) {
      if (presenceEvaluation.reasonCode === "security_approval_required") {
        toast.info(
          securityOperationMode === "scheduled" || securityOperationMode === "event_based"
            ? "This venue requires staff/security approval during controlled entry periods."
            : "This venue requires staff/security approval before check-in.",
        );
      } else if (presenceEvaluation.reasonCode === "hybrid_entry_unverified") {
        if (presenceEvaluation.canFallbackCheckIn) {
          setFallbackCheckInPrompt("guided");
        } else {
          toast.info("This venue uses hybrid entry. Staff/security verification is required before check-in.");
        }
      }
      return;
    }

    // Check if already checked in at another venue
    if (currentCheckIn && currentCheckIn.venueId !== id) {
      setShowConflictModal(true);
      return;
    }

    await performCheckIn({
      verificationState: "not_required",
      checkinEntrySource: "self_checkin_open_entry",
    });
  };

  const performCheckIn = async (options?: {
    verificationState?: "not_required" | "approved" | "fallback_unverified";
    checkinEntrySource?: "self_checkin_open_entry" | "staff_approval" | "hybrid_fallback";
  }) => {
    const verificationState = options?.verificationState || "not_required";
    const checkinEntrySource = options?.checkinEntrySource || "self_checkin_open_entry";

    // Start transition animation
    setIsTransitioning(true);

    if (usesReferenceVenue || id === "mock") {
      // Mock check-in - wait for transition
      setTimeout(() => {
        setIsCheckedIn(true);
        setUserStatus("at");
        setIsTransitioning(false);
        setShowVibeSphere(true);
      }, 3000);
      return;
    }

    const idempotencyKey = `checkin:${id}:${checkinEntrySource}:${Math.floor(Date.now() / 5000)}`;
    const { error } = await (supabase as any).rpc("create_venue_checkin_for_user", {
      p_venue_id: id,
      p_visibility: "private",
      p_verification_state: verificationState,
      p_checkin_entry_source: checkinEntrySource,
      p_idempotency_key: idempotencyKey,
      p_metadata: { source: "immersive_venue" },
    });

    if (error) {
      toast.error("Failed to check in");
      setIsTransitioning(false);
      console.error(error);
    } else {
      // Record tier event for check-in
      recordTierEvent(user!.id, "checkin", { venue_id: id });

      // Fire-and-forget: Update behavioral weight for vibe preferences via RPC (Area 5)
      (async () => {
        try {
          const { data: venueTags } = await (supabase as any)
            .from("venue_vibe_tags")
            .select("tag_name")
            .eq("venue_id", id);
          if (venueTags && venueTags.length > 0) {
            for (const vt of venueTags) {
              await (supabase as any).rpc("increment_vibe_behavioral_weight", {
                p_user_id: user!.id,
                p_tag_name: vt.tag_name,
                p_increment: 0.1,
              });
            }
          }
        } catch (e) {
          console.error("Behavioral weight update failed:", e);
        }
      })();

      // First-checkin bonus: check if user has ever checked in at this venue before
      (async () => {
        try {
          const { count } = await supabase
            .from("tier_point_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user!.id)
            .eq("action_type", "checkin")
            .filter("metadata->>venue_id", "eq", id);
          if ((count || 0) <= 1) {
            recordTierEvent(user!.id, "first_checkin", { venue_id: id });
          }
        } catch (e) {
          console.error("First-checkin check failed:", e);
        }
      })();

      // Wait for transition to complete
      setTimeout(() => {
        setIsCheckedIn(true);
        setUserStatus("at");
        setIsTransitioning(false);
        setShowVibeSphere(true);
      }, 3000);
    }
  };

  const handleConfirmFallbackCheckIn = async () => {
    setFallbackCheckInPrompt(null);
    await performCheckIn({
      verificationState: "fallback_unverified",
      checkinEntrySource: "hybrid_fallback",
    });
  };

  const handleCheckoutAndContinue = async () => {
    if (!user || !currentCheckIn) return;

    setIsCheckingOut(true);

    // Checkout from current venue
    const { error: checkoutError } = await (supabase as any).rpc("checkout_current_venue_checkin", {
      p_venue_id: currentCheckIn.venueId,
      p_idempotency_key: `checkout:${currentCheckIn.venueId}:${Math.floor(Date.now() / 5000)}`,
      p_metadata: { source: "immersive_venue_conflict" },
    });

    if (checkoutError) {
      toast.error("Failed to checkout from current venue");
      setIsCheckingOut(false);
      console.error(checkoutError);
      return;
    }

    toast.success(`Checked out of ${currentCheckIn.venueName || "previous venue"}`);
    setShowConflictModal(false);
    setIsCheckingOut(false);

    // Small delay to allow real-time update to propagate
    setTimeout(() => {
      performCheckIn({
        verificationState: "not_required",
        checkinEntrySource: "self_checkin_open_entry",
      });
    }, 500);
  };

  const handleExitVibeSphere = () => {
    // Just hide the VibeSphere - don't navigate away
    // User stays on the venue page but exits the immersive experience
    setShowVibeSphere(false);
  };

  const handleCheckoutVibeSphere = () => {
    // Full checkout - hide VibeSphere and mark as not checked in
    setShowVibeSphere(false);
    setIsCheckedIn(false);
    setUserStatus(null);
  };

  const handleStatusChange = async (status: "heading" | "maybe") => {
    if (!user) {
      toast.error("Please sign in to set venue intent");
      return;
    }

    if (usesReferenceVenue || id === "mock") {
      setUserStatus(status);
      return;
    }

    if (isCheckedIn) {
      toast.info("You're currently checked in. '@ venue' is derived from check-in.");
      return;
    }

    if (isUpdatingIntent) return;

    if (userStatus === status) {
      toast.info(status === "heading" ? "Already marked as heading there" : "Already marked as maybe going");
      return;
    }

    const now = Date.now();
    if (now - lastIntentActionAt < INTENT_ACTION_COOLDOWN_MS) {
      toast.info("Please wait a moment before changing intent again");
      return;
    }

    setIsUpdatingIntent(true);
    try {
      const signalType = status === "heading" ? "heading_there" : "maybe_going";
      const writeResult = await upsertUserVenueIntentSignal({
        userId: user.id,
        venueId: id,
        signalType,
        source: "manual",
      });

      if (writeResult.status === "skipped_cooldown") {
        toast.info("Please wait a moment before changing intent again");
        return;
      }

      setUserStatus(status);
      setLastIntentActionAt(Date.now());
      toast.success(status === "heading" ? "You're marked as heading to this venue" : "You're marked as maybe going");
    } catch (error) {
      console.error("Failed to persist venue intent signal:", error);
      toast.error("Failed to update venue intent. Please try again.");
    } finally {
      setIsUpdatingIntent(false);
    }
  };

  const checkInDisabled =
    isCheckedIn ||
    !hasVenueLocation ||
    (!isWithinCheckInRadius && !locationLoading) ||
    !presenceEvaluation.canCheckInNow;

  const checkInLabel = isCheckedIn
    ? "@ " + venue?.name
    : !hasVenueLocation || !isWithinCheckInRadius
      ? "Too Far to Check In"
      : !presenceEvaluation.canCheckInNow &&
          (entryControlPolicy === "security_required" || entryControlPolicy === "hybrid_entry")
        ? "Awaiting Staff Approval"
        : "Check In";

  const displayedDeal = isReferenceVenue ? REFERENCE_VENUE_DEAL : venueDeals[0];

  const toggleReferenceFollow = () => {
    const next = !isReferenceFollowing;
    setIsReferenceFollowing(next);
    toast.success(next ? "Venue followed." : "Venue follow removed.");
  };

  const toggleReferencePound = () => {
    const next = !isReferencePounded;
    setIsReferencePounded(next);
    toast.success(next ? "Venue pounded." : "Venue pound removed.");
  };

  if (loading) {
    return (
      <div className="venue-detail-page venue-detail-page--state">
        <div className="venue-detail-loading" role="status">
          <span className="venue-detail-loading__mark" />
          <p>Loading venue...</p>
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="venue-detail-page venue-detail-page--state">
        <p className="venue-detail-empty">Venue not found</p>
      </div>
    );
  }

  const directionsUrl =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(venue.address || venue.name);

  return (
    <div
      className="venue-detail-page"
      style={{ overflowY: showVibeSphere ? "hidden" : undefined }}
    >
      {isTestVenueView && (
        <div className="venue-detail-test-banner" role="status">
          <FlaskConical aria-hidden="true" />
          <span>You're viewing this venue as a tester. Only you can see it.</span>
        </div>
      )}

      <main className="venue-detail" aria-labelledby="venue-detail-title">
        <section className="venue-detail-hero" aria-label={venue.name + " overview"}>
          <img
            className="venue-detail-hero__image"
            src={
              venue.image_url ||
              "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200"
            }
            alt=""
          />
          <div className="venue-detail-hero__scrim" aria-hidden="true" />

          <button
            className="venue-detail-icon-button venue-detail-hero__back"
            type="button"
            onClick={() => navigate("/app/venues")}
            aria-label="Back to venues"
            title="Back to venues"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            className="venue-detail-icon-button venue-detail-hero__play"
            type="button"
            onClick={() => toast.info("Venue video is ready to play.")}
            aria-label="Play venue video"
            title="Play venue video"
          >
            <Play aria-hidden="true" fill="currentColor" />
          </button>

          <div className="venue-detail-hero__content">
            <div className="venue-detail-hero__badges">
              <span className="venue-detail-badge">Premium venue</span>
              {!isReferenceVenue && <VenueTierPublicBadgeInlineWrapper venueId={venue.id} />}
              {(isReferenceVenue || hasActiveDeal) && (
                <span className="venue-detail-hero__meta"><Gift aria-hidden="true" />Deal available</span>
              )}
              {hasActiveVibe && (
                <span className="venue-detail-hero__meta"><Zap aria-hidden="true" />Live vibe</span>
              )}
              {energy && (
                <span className="venue-detail-hero__meta"><Flame aria-hidden="true" />{venueEnergyStateLabel(energy.state)}</span>
              )}
              <span className="venue-detail-hero__meta venue-detail-hero__rating">
                <Star aria-hidden="true" fill="currentColor" />
                {venueDetails.rating}
              </span>
            </div>
            <h1 id="venue-detail-title">{venue.name}</h1>
            {venue.venue_type && <p className="venue-detail-hero__type">{venue.venue_type}</p>}
          </div>

          <div className="venue-detail-hero__counts" aria-label="Venue attendance">
            <div><strong>{crowdStatus.at}</strong><span>Here now</span></div>
            <div><strong>{crowdStatus.heading}</strong><span>Heading</span></div>
            <div><strong>{crowdStatus.maybe}</strong><span>Maybe</span></div>
          </div>
        </section>

        <div className="venue-detail-layout">
          <div className="venue-detail-content">
            {displayedDeal && (
              <section className="venue-detail-card venue-detail-deal" aria-labelledby="venue-deal-title">
                <div className="venue-detail-deal__heading">
                  <span className="venue-detail-deal__icon"><Gift aria-hidden="true" /></span>
                  <div>
                    <p>{displayedDeal.headline}</p>
                    <h2 id="venue-deal-title">{displayedDeal.discount_text}</h2>
                  </div>
                </div>
                {displayedDeal.description && (
                  <p className="venue-detail-deal__description">{displayedDeal.description}</p>
                )}
                <button
                  className="venue-detail-button venue-detail-button--primary"
                  type="button"
                  onClick={async () => {
                    if (isReferenceVenue) {
                      toast.success("Your deal is ready to redeem.");
                      return;
                    }

                    try {
                      await redeemDeal(displayedDeal.id, displayedDeal.venue_id);
                      toast.success("Deal redeemed. Show the code to staff.");
                    } catch {
                      toast.error("Failed to redeem deal.");
                    }
                  }}
                >
                  <Gift aria-hidden="true" />
                  Redeem deal
                </button>
              </section>
            )}

            <section className="venue-detail-card venue-detail-section" aria-labelledby="venue-about-title">
              <h2 id="venue-about-title"><Info aria-hidden="true" />About {venue.name}</h2>
              <p className="venue-detail-section__copy">
                <TranslatedText
                  text={
                    venue.description?.replace(/^Owned by [^.]+\.?\s*/i, "") ||
                    "Experience the pinnacle of nightlife and entertainment."
                  }
                  contentId={venue.id}
                  contentType="venue"
                  sourceLang={venue.source_language ?? null}
                  sourceConfidence={venue.language_confidence ?? null}
                />
              </p>
              <div className="venue-detail-tags">
                {venueDetails.features.map((feature) => <span key={feature}>{feature}</span>)}
              </div>
            </section>

            <section className="venue-detail-card venue-detail-section" aria-labelledby="venue-essentials-title">
              <h2 id="venue-essentials-title"><SlidersHorizontal aria-hidden="true" />Venue essentials</h2>
              <div className="venue-detail-essentials">
                <article className="venue-detail-essential">
                  <span className="venue-detail-essential__icon venue-detail-essential__icon--cyan"><AlertCircle aria-hidden="true" /></span>
                  <div><h3>Age restriction</h3><p>{venueDetails.ageRestrictionDetail}</p></div>
                </article>
                <article className="venue-detail-essential">
                  <span className="venue-detail-essential__icon venue-detail-essential__icon--gold"><Shirt aria-hidden="true" /></span>
                  <div><h3>Dress code</h3><p>{venueDetails.dressCode}</p></div>
                </article>
                <article className="venue-detail-essential venue-detail-hours">
                  <span className="venue-detail-essential__icon"><Clock aria-hidden="true" /></span>
                  <div>
                    <h3>Operating hours</h3>
                    <dl>
                      {Object.entries(venueDetails.hours).map(([day, hours]) => (
                        <div key={day}><dt>{day}</dt><dd>{hours}</dd></div>
                      ))}
                    </dl>
                  </div>
                </article>
              </div>
            </section>

            <section className="venue-detail-card venue-detail-section venue-detail-guests" aria-labelledby="venue-guests-title">
              <div className="venue-detail-section__heading">
                <div>
                  <h2 id="venue-guests-title"><Users aria-hidden="true" />Who's here</h2>
                  <p>{crowdStatus.at} people currently checked in</p>
                </div>
                <button
                  className="venue-detail-button venue-detail-button--secondary venue-detail-button--compact"
                  type="button"
                  onClick={() => toast.info(isReferenceVenue ? "No guests are currently checked in." : "Guest details are not available yet.")}
                >
                  View all guests
                </button>
              </div>
              {momentum?.hasFriendActivity && (
                <p className="venue-detail-friend-momentum"><Users aria-hidden="true" />{momentum.label}</p>
              )}
              <div className="venue-detail-guest-tabs" role="group" aria-label="Set attendance">
                <button
                  className={userStatus === "heading" || (isReferenceVenue && userStatus === null) ? "is-active" : ""}
                  type="button"
                  disabled={isUpdatingIntent || isCheckedIn}
                  onClick={() => void handleStatusChange("heading")}
                >
                  Heading there
                </button>
                <button
                  className={userStatus === "maybe" ? "is-active" : ""}
                  type="button"
                  disabled={isUpdatingIntent || isCheckedIn}
                  onClick={() => void handleStatusChange("maybe")}
                >
                  Maybe going
                </button>
              </div>
              <div className="venue-detail-avatars" aria-label={isReferenceVenue ? "People heading to My Spot" : "People attending this venue"}>
                {(isReferenceVenue ? ["AK", "JM", "RP", "SD", "NV"] : ["U1", "U2", "U3", "U4", "U5"]).map((label) => <span key={label}>{label}</span>)}
                <b>+{Math.max(0, crowdStatus.at - 5)}</b>
              </div>
            </section>

            {(isReferenceVenue || _socialVenueId) && (
              <section className="venue-detail-card venue-detail-section venue-detail-live" aria-labelledby="venue-live-title">
                <h2 id="venue-live-title"><MessageSquare aria-hidden="true" />Live from this venue</h2>
                {isReferenceVenue ? (
                  <p className="venue-detail-section__copy">No recent posts from this venue yet.</p>
                ) : venueFeedLoading ? (
                  <div className="venue-detail-live__loading" aria-label="Loading venue posts">
                    {[1, 2, 3].map((index) => <span key={index} />)}
                  </div>
                ) : venueFeedPosts.length === 0 ? (
                  <p className="venue-detail-section__copy">No recent posts from this venue yet.</p>
                ) : (
                  <div className="venue-detail-live__list">
                    {venueFeedPosts.map((post) => (
                      <article className="venue-detail-live__post" key={post.id}>
                        <div className="venue-detail-live__avatar">
                          {post.author.avatar_url ? (
                            <img src={post.author.avatar_url} alt="" loading="lazy" />
                          ) : (
                            <span>{(post.author.display_name?.[0] ?? "?").toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <strong>{post.author.display_name ?? "Someone"}</strong>
                          <p>{post.content}</p>
                          {post.image_url && (
                            <img className="venue-detail-live__image" src={post.image_url} alt="" loading="lazy" />
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="venue-detail-sidebar" aria-label="Venue actions and contact information">
            {isReferenceVenue ? (
              <section className="venue-detail-card venue-detail-connect" aria-labelledby="venue-connect-title">
                <h2 id="venue-connect-title"><Heart aria-hidden="true" />Connect</h2>
                <div>
                  <button className={isReferenceFollowing ? "is-active" : ""} type="button" onClick={toggleReferenceFollow}>
                    <UserPlus aria-hidden="true" /> Follow <b>{isReferenceFollowing ? 1 : 0}</b>
                  </button>
                  <button className={isReferencePounded ? "is-active" : ""} type="button" onClick={toggleReferencePound}>
                    <Heart aria-hidden="true" /> Pound <b>{isReferencePounded ? 1 : 0}</b>
                  </button>
                </div>
              </section>
            ) : id && id !== "mock" && (
              <section className="venue-detail-card venue-detail-connect" aria-labelledby="venue-connect-title">
                <h2 id="venue-connect-title"><Heart aria-hidden="true" />Connect</h2>
                <VenueFollowButton venueId={id} />
              </section>
            )}

            <section className="venue-detail-attendance" aria-label="Check-in and attendance actions">
              {hasVenueLocation && hasUserLocation && distanceToVenue !== null && !isCheckedIn && (
                <p
                  className={
                    "venue-detail-presence venue-detail-presence--" +
                    (isWithinCheckInRadius && entryControlPolicy === "open_entry"
                      ? "ready"
                      : isWithinCheckInRadius
                        ? "approval"
                        : "away")
                  }
                >
                  {isWithinCheckInRadius && entryControlPolicy === "open_entry" ? (
                    <><MapPin aria-hidden="true" />You're at the venue</>
                  ) : isWithinCheckInRadius ? (
                    <><Shield aria-hidden="true" />At venue. Awaiting staff verification.</>
                  ) : (
                    <><MapPinOff aria-hidden="true" />{(distanceToVenue / 1000).toFixed(1)} km away. You must be at the venue to check in.</>
                  )}
                </p>
              )}

              {!hasVenueLocation && !isCheckedIn && (
                <p className="venue-detail-presence venue-detail-presence--neutral">
                  <MapPinOff aria-hidden="true" />
                  Venue location is not set. Check-in is unavailable.
                </p>
              )}
              {hasVenueLocation && locationLoading && !isCheckedIn && (
                <p className="venue-detail-presence venue-detail-presence--neutral">
                  <span className="venue-detail-spinner" aria-hidden="true" />
                  Getting your location...
                </p>
              )}
              {hasVenueLocation && hasUserLocation && !isCheckedIn && (
                <p className="venue-detail-presence-state">
                  Presence state: {String(presenceState).replace(/_/g, " ")}
                </p>
              )}

              <button
                className={"venue-detail-button venue-detail-button--checkin" + (isCheckedIn ? " is-checked-in" : "")}
                type="button"
                onClick={() => void handleCheckIn()}
                disabled={checkInDisabled}
              >
                <CheckCircle aria-hidden="true" />
                {checkInLabel}
              </button>

              {!isCheckedIn &&
                entryControlPolicy === "hybrid_entry" &&
                hasVenueLocation &&
                hasUserLocation &&
                isWithinCheckInRadius &&
                presenceEvaluation.canFallbackCheckIn && (
                  <button
                    className="venue-detail-button venue-detail-button--secondary"
                    type="button"
                    onClick={() => setFallbackCheckInPrompt("manual")}
                  >
                    Continue with fallback check-in
                  </button>
                )}

              {isCheckedIn &&
                currentCheckIn?.venueId === id &&
                currentCheckIn?.checkinEntrySource === "hybrid_fallback" && (
                  <p className="venue-detail-note venue-detail-note--warning">
                    You are checked in through fallback entry for this hybrid venue.
                  </p>
                )}

              {isCheckedIn &&
                currentCheckIn?.venueId === id &&
                currentCheckIn.visibilitySelectionStatus === "pending" && (
                  <div className="venue-detail-visibility">
                    <p>Choose how your check-in appears at this venue.</p>
                    <div>
                      <button
                        className="venue-detail-button venue-detail-button--primary"
                        type="button"
                        disabled={isUpdatingVisibility}
                        onClick={() => void updateCheckInVisibility("public", "user_prompt")}
                      >
                        Publicly
                      </button>
                      <button
                        className="venue-detail-button venue-detail-button--secondary"
                        type="button"
                        disabled={isUpdatingVisibility}
                        onClick={() => void updateCheckInVisibility("private", "user_prompt")}
                      >
                        Privately
                      </button>
                    </div>
                    <small>Defaults to private in {Math.max(visibilityCountdownSeconds ?? 0, 0)}s.</small>
                  </div>
                )}

              <button
                className={"venue-detail-button venue-detail-button--heading" + (userStatus === "heading" ? " is-selected" : "")}
                type="button"
                onClick={() => void handleStatusChange("heading")}
                disabled={isUpdatingIntent || isCheckedIn}
              >
                <Navigation aria-hidden="true" />
                I'm heading there
              </button>
              <button
                className={"venue-detail-button venue-detail-button--primary" + (userStatus === "maybe" ? " is-selected" : "")}
                type="button"
                onClick={() => void handleStatusChange("maybe")}
                disabled={isUpdatingIntent || isCheckedIn}
              >
                <Calendar aria-hidden="true" />
                Maybe going
              </button>

              {isCheckedIn && !showVibeSphere && (
                <button
                  className="venue-detail-button venue-detail-button--venueverse"
                  type="button"
                  onClick={() => setShowVibeSphere(true)}
                >
                  <Zap aria-hidden="true" />
                  Enter VenueVerse
                </button>
              )}
              {isCheckedIn && (
                <button
                  className="venue-detail-button venue-detail-button--secondary"
                  type="button"
                  onClick={() => toast.success("Waiter called. They'll be with you shortly.")}
                >
                  <Phone aria-hidden="true" />
                  Call waiter
                </button>
              )}
            </section>

            <section className="venue-detail-card venue-detail-contact" aria-labelledby="venue-contact-title">
              <h2 id="venue-contact-title"><MapPin aria-hidden="true" />Contact info</h2>
              <address>
                <p><MapPin aria-hidden="true" /><span>{venue.address || "Address not available"}</span></p>
                <p>
                  <Phone aria-hidden="true" />
                  <a href={"tel:" + venueDetails.phone.replace(/[^\d+]/g, "")}>{venueDetails.phone}</a>
                </p>
                <p>
                  <Globe aria-hidden="true" />
                  <a href={"https://" + venueDetails.website} target="_blank" rel="noreferrer">{venueDetails.website}</a>
                </p>
              </address>

              <a
                className="venue-detail-map"
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={"View " + venue.name + " on a map"}
              >
                <div ref={miniMapContainer} className="venue-detail-map__canvas" />
                <span><MapPin aria-hidden="true" /></span>
                <strong>{venue.address || venue.name}</strong>
              </a>

              {hasVenueLocation ? (
                <button
                  className="venue-detail-button venue-detail-button--primary"
                  type="button"
                  onClick={() =>
                    navigate(
                      "/app/maps?destLat=" +
                        venue.latitude +
                        "&destLng=" +
                        venue.longitude +
                        "&destName=" +
                        encodeURIComponent(venue.name),
                    )
                  }
                >
                  <Navigation aria-hidden="true" />
                  Get directions
                </button>
              ) : (
                <a
                  className="venue-detail-button venue-detail-button--primary"
                  href={directionsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation aria-hidden="true" />
                  Get directions
                </a>
              )}
              <small>
                Verified venue ID: #JV-{venue.id.slice(0, 4).toUpperCase()}-{venue.id.slice(-4).toUpperCase()}
              </small>
            </section>
          </aside>
        </div>
      </main>

      <VibeSphere
        isCheckedIn={isCheckedIn && showVibeSphere}
        isTransitioning={isTransitioning}
        venueName={venue.name}
        venueType={venue.venue_type}
        vibeLevel="Lit"
        priceLevel="$$"
        hours="Closes 2 AM"
        venueId={venue.id}
        onExit={handleExitVibeSphere}
        onCheckout={handleCheckoutVibeSphere}
      />

      <AlertDialog open={fallbackCheckInPrompt !== null} onOpenChange={(open) => { if (!open) setFallbackCheckInPrompt(null); }}>
        <AlertDialogContent className="customer-dialog-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Continue with fallback check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              {fallbackCheckInPrompt === "guided"
                ? "This venue uses hybrid entry. If staff approval is missed, you can continue with fallback check-in. Fallback check-in is lower confidence than staff-approved entry."
                : "This is not staff/security-approved entry."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmFallbackCheckIn()}>
              Continue with fallback check-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CheckinConflictModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        currentVenueName={currentCheckIn?.venueName || "Unknown Venue"}
        newVenueName={venue.name}
        onCheckoutAndContinue={handleCheckoutAndContinue}
        isLoading={isCheckingOut}
      />
    </div>
  );
};

export default ImmersiveVenue;
