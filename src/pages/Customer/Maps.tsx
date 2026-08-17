import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverSystem } from '@/hooks/useDriverSystem';
import { useDeliveryFee } from '@/hooks/useDeliveryFee';
import { useDriverEarnings } from '@/hooks/useDriverEarnings';
import { useDriverDeliveryNotifications } from '@/hooks/useDriverDeliveryNotifications';
import { useDriverShiftSound } from '@/hooks/useDriverShiftSound';
import { useDriverPushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import { 
  Navigation, Car, Bike, Package, MapPin, Clock, DollarSign, 
  Star, Play, Square, Search, X, User, CheckCircle2, ChevronUp,
  ChevronDown, TrendingUp, Calendar, Wallet, Route, Users, Gift, Navigation2,
  Volume2, VolumeX, ArrowRight, Loader2, History, Eye, MessageCircle, Bell, Heart,
  Crosshair, Layers3, Minus, Plus, PanelLeftOpen, Map as MapIcon, MapPinOff
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DriverNavigation from '@/components/Driver/DriverNavigation';
import OrderTrackingMap from '@/components/Customer/OrderTrackingMap';
import FriendsOnMapLayer from '@/components/Customer/FriendsOnMapLayer';
import FollowedVenuesLayer from '@/components/Customer/FollowedVenuesLayer';
import AllVenuesLayer from '@/components/Customer/AllVenuesLayer';
import BoostedVenuesLayer from '@/components/Customer/BoostedVenuesLayer';
import DriverCustomerChat from '@/components/Customer/DriverCustomerChat';
import AcceptOrderModal from '@/components/Driver/AcceptOrderModal';
import { globalCache } from '@/hooks/useGlobalPrefetch';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from 'react-i18next';
import { useDriverSignupAd } from '@/hooks/useDriverSignupAd';
import DriverSignupAdCard from '@/components/Customer/Driver/DriverSignupAdCard';
import VehicleModePicker from '@/components/Customer/Driver/VehicleModePicker';
import LicenseUploadSheet from '@/components/Customer/Driver/LicenseUploadSheet';
import IdUploadSheet from '@/components/Customer/Driver/IdUploadSheet';
import ActiveJobRunnerMode from '@/components/Customer/Driver/ActiveJobRunnerMode';
import { useDriverVerification, type DriverMode } from '@/hooks/useDriverVerification';
import useCustomerDashboardPresentation from '@/hooks/useCustomerDashboardPresentation';
import './map.css';

// Mapbox token from env or fallback
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || 'pk.your_token_here';

// Platform fee constant
const PLATFORM_FEE = 0.10;

const Maps = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const { calculateRideFare } = useDeliveryFee();
  const {
    isDriver,
    driverProfile,
    activeShift,
    activeOrder,
    availableDeliveries,
    availableRides,
    registerAsDriver,
    startShift,
    endShift,
    updateLocation,
    bookRide,
    calculateDistance,
    acceptDelivery,
    acceptRide,
    refreshActiveOrder,
    updateDeliveryStatus,
    updateRideStatus,
    updateVehicleModes,
  } = useDriverSystem();

  // Sound toggle hook
  const { soundEnabled, toggleSound } = useDriverShiftSound();
  
  // Track if accepting an order
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  
  // Track ignored orders (driver-local dismissals)
  const [ignoredOrderIds, setIgnoredOrderIds] = useState<Set<string>>(new Set());
  
  // Navigation state
  const [isPickedUp, setIsPickedUp] = useState(false);

  // Accept order modal state
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [pendingOrderType, setPendingOrderType] = useState<'delivery' | 'ride'>('delivery');

  // Use live earnings hook
  const { earnings } = useDriverEarnings(activeShift?.id || null);

  // Callback when a new delivery notification arrives and user clicks "View"
  const handleNewDeliveryNotification = useCallback((order: any) => {
    setPendingOrder(order);
    setPendingOrderType('delivery');
    setShowAcceptModal(true);
    setActiveTab('driver'); // Switch to driver tab
  }, []);

  // Callback when a new ride notification arrives and user clicks "View"
  const handleNewRideNotification = useCallback((ride: any) => {
    setPendingOrder(ride);
    setPendingOrderType('ride');
    setShowAcceptModal(true);
    setActiveTab('driver'); // Switch to driver tab
  }, []);

  // Use driver notification hook - only check activeShift, not is_available (which can lag)
  useDriverDeliveryNotifications(
    !!activeShift,
    activeShift?.shift_type || null,
    handleNewDeliveryNotification,
    handleNewRideNotification
  );

  const [activeTab, setActiveTab] = useState<'explore' | 'ride' | 'driver'>('explore');
  const [showDriverSignup, setShowDriverSignup] = useState(false);
  const [showRideBooking, setShowRideBooking] = useState(false);
  const [showEarningsPopup, setShowEarningsPopup] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<any>(null);
  const [showTrackingMap, setShowTrackingMap] = useState(false);
  const [driverPanelExpanded, setDriverPanelExpanded] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [chatTarget, setChatTarget] = useState<'customer' | 'venue'>('customer');
  const [showFriends, setShowFriends] = useState(false);
  const [showFollowedVenues, setShowFollowedVenues] = useState(false);
  const [showAllVenues, setShowAllVenues] = useState(true);
  const [isNearbyPanelOpen, setIsNearbyPanelOpen] = useState(true);
  const [isLightMapStyle, setIsLightMapStyle] = useState(false);

  const selectNearbyFilter = (filter: 'venues' | 'friends' | 'following') => {
    setShowAllVenues(filter === 'venues');
    setShowFriends(filter === 'friends');
    setShowFollowedVenues(filter === 'following');
  };

  // Reverse-geocoded location for driver-signup ad targeting (fetched lazily)
  const [signupLoc, setSignupLoc] = useState<{ country: string | null; state: string | null; city: string | null; suburb: string | null }>({
    country: null, state: null, city: null, suburb: null,
  });
  useEffect(() => {
    if (!showDriverSignup || !userLocation) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${userLocation.lng},${userLocation.lat}.json?types=country,region,place,locality,neighborhood&access_token=${MAPBOX_TOKEN}`
        );
        const json = await res.json();
        if (cancelled || !json?.features) return;
        const find = (t: string) => json.features.find((f: any) => f.place_type?.includes(t))?.text || null;
        setSignupLoc({
          country: find("country"),
          state: find("region"),
          city: find("place"),
          suburb: find("neighborhood") || find("locality"),
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [showDriverSignup, userLocation]);

  const driverSignupAd = useDriverSignupAd(showDriverSignup, signupLoc);

  // Push notifications for drivers
  const { requestPermission: requestPushPermission, hasPermission: hasPushPermission } = useDriverPushNotifications(!!activeShift);
  
  // Driver signup form
  const [licenseId, setLicenseId] = useState('');
  const [selectedModes, setSelectedModes] = useState<Array<'car' | 'motorcycle' | 'bicycle' | 'runner'>>([]);
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [showLicenseUpload, setShowLicenseUpload] = useState(false);
  const [showIdUpload, setShowIdUpload] = useState(false);
  const [showModeManager, setShowModeManager] = useState(false);
  const driverVerification = useDriverVerification();

  // Prefill license number from signup OCR (AWS Textract → user_verification.document_number)
  useEffect(() => {
    if (showDriverSignup && !licenseId && driverVerification.state.extractedDocumentNumber) {
      setLicenseId(driverVerification.state.extractedDocumentNumber);
    }
  }, [showDriverSignup, driverVerification.state.extractedDocumentNumber, licenseId]);

  // Sync mode manager dialog seed with the user's currently-saved modes
  useEffect(() => {
    if (showModeManager) {
      const current = (driverProfile?.vehicle_modes ?? []) as Array<'car' | 'motorcycle' | 'bicycle' | 'runner'>;
      setSelectedModes(current.length > 0 ? current : ['car']);
    }
  }, [showModeManager, driverProfile?.vehicle_modes]);

  // Ride booking form
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>([]);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fareEstimate, setFareEstimate] = useState<{ fare: number; distance: number; duration: number; driverEarnings: number; platformFee: number } | null>(null);
  const [isForFriend, setIsForFriend] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSuggestions, setFriendSuggestions] = useState<any[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);

  // Route visualization
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  // Directions from URL params (venue directions)
  const [venueDirections, setVenueDirections] = useState<{
    lat: number;
    lng: number;
    name: string;
    distance?: number;
    duration?: number;
  } | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const geolocateControlRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Keep these in refs to avoid stale closures inside the map init effect
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFixRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const hasCenteredOnUserRef = useRef(false);
  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: [153.0251, -27.4698], // Brisbane default - will be overridden by user location
      zoom: 13,
      pitch: 45,
      attributionControl: false,
    });

    const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    };

    const shouldAcceptFix = (next: { lat: number; lng: number; accuracy: number }) => {
      const prev = lastFixRef.current;
      if (!prev) return true;

      const dist = distanceMeters(prev, next);

      // If a very low-quality fix jumps far away, it's usually IP/cell fallback; ignore it.
      if (next.accuracy > 5000 && dist > 5000) return false;

      // If accuracy gets significantly worse and it's also a noticeable jump, ignore.
      if (next.accuracy > prev.accuracy * 1.5 && dist > 250) return false;

      return true;
    };

    const applyFix = (next: { lat: number; lng: number; accuracy: number }, centerIfFirst: boolean) => {
      if (!shouldAcceptFix(next)) return;

      userLocationRef.current = { lat: next.lat, lng: next.lng };
      lastFixRef.current = next;

      setUserLocation({ lat: next.lat, lng: next.lng });
      setLocationLoading(false);
      setLocationError(null);

      // Only auto-center once on first good fix to prevent random "jumping".
      if (centerIfFirst && !hasCenteredOnUserRef.current) {
        map.current?.flyTo({
          center: [next.lng, next.lat],
          zoom: 15,
          duration: 900,
          essential: true,
        });
        hasCenteredOnUserRef.current = true;
      }
    };

    const quickLocate = () => {
      if (!navigator.geolocation) return;

      // Fast path: use a cached/rough fix immediately (like Maps apps do), then refine.
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          applyFix(
            {
              lat: latitude,
              lng: longitude,
              accuracy: typeof accuracy === 'number' ? accuracy : Number.POSITIVE_INFINITY,
            },
            true
          );
        },
        () => {
          // Ignore: we still try the high-accuracy path below
        },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 5 * 60 * 1000 }
      );
    };

    // Create geolocate control with tracking (high accuracy refinement)
    const geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60 * 1000,
      },
      trackUserLocation: true,
      showUserHeading: true,
      showAccuracyCircle: true,
    });
    geolocateControlRef.current = geolocateControl;
    map.current.addControl(geolocateControl, 'top-right');

    geolocateControl.on('geolocate', (e: any) => {
      const lat = e?.coords?.latitude;
      const lng = e?.coords?.longitude;
      const accuracy = e?.coords?.accuracy;

      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      applyFix(
        {
          lat,
          lng,
          accuracy: typeof accuracy === 'number' ? accuracy : Number.POSITIVE_INFINITY,
        },
        true
      );
    });

    geolocateControl.on('error', (e: any) => {
      console.log('GeolocateControl error:', e);
      setLocationLoading(false);
      // Only set error on mobile or if permission explicitly denied - desktop often has no GPS
      if (e?.code === 1) {
        setLocationError('Location permission denied');
      }
      // For other errors (position unavailable, timeout), don't show error on desktop
      // as it's expected behavior without GPS hardware
    });

    // Map load handler
    map.current.on('load', () => {
      if (!map.current) return;
      setMapLoaded(true);

      // Start with an instant cached fix, then trigger high-accuracy tracking.
      quickLocate();
      geolocateControl.trigger();

      // Add route source
      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });

      // Add route layer with gradient
      map.current.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#00FFFF',
          'line-width': 6,
          'line-opacity': 0.8,
        },
      });

      // Add route outline for better visibility
      map.current.addLayer(
        {
          id: 'route-outline',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#8B5CF6',
            'line-width': 10,
            'line-opacity': 0.4,
          },
        },
        'route'
      );
    });

    const loadingTimeout = setTimeout(() => {
      if (!userLocationRef.current) {
        setLocationLoading(false);
        setLocationError('Location is taking too long — check GPS / permissions');
      }
    }, 12000);

    return () => {
      clearTimeout(loadingTimeout);
      map.current?.remove();
      map.current = null;
    };
    return () => {
      clearTimeout(loadingTimeout);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize();
    });

    resizeObserver.observe(mapContainer.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Function to fetch and display route
  const displayRoute = useCallback(async (start: [number, number], end: [number, number]) => {
    if (!map.current) return;

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;
        
        setRouteCoordinates(coordinates);

        // Update route on map
        const source = map.current.getSource('route') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            }
          });
        }

        // Add destination marker
        new mapboxgl.Marker({ color: '#EF4444' })
          .setLngLat(end)
          .setPopup(new mapboxgl.Popup().setHTML(`<strong>${t('maps_driver.destination_popup')}</strong>`))
          .addTo(map.current);

        // Fit map to route bounds
        const bounds = new mapboxgl.LngLatBounds();
        coordinates.forEach((coord: [number, number]) => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: 100 });
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
  }, []);

  // Track driver location when on shift
  useEffect(() => {
    if (!activeShift || !driverProfile?.is_available) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        updateLocation(latitude, longitude);
      },
      null,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeShift, driverProfile?.is_available, updateLocation]);

  // Handle venue directions from URL params
  useEffect(() => {
    const destLat = searchParams.get('destLat');
    const destLng = searchParams.get('destLng');
    const destName = searchParams.get('destName');

    if (destLat && destLng && destName && userLocation && mapLoaded) {
      const lat = parseFloat(destLat);
      const lng = parseFloat(destLng);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        // Fetch directions
        const fetchDirections = async () => {
          try {
            const response = await fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/${userLocation.lng},${userLocation.lat};${lng},${lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
            );
            const data = await response.json();

            if (data.routes && data.routes[0]) {
              const route = data.routes[0];
              const distanceKm = route.distance / 1000;
              const durationMin = Math.ceil(route.duration / 60);

              setVenueDirections({
                lat,
                lng,
                name: decodeURIComponent(destName),
                distance: distanceKm,
                duration: durationMin,
              });

              // Display route on map
              displayRoute([userLocation.lng, userLocation.lat], [lng, lat]);
            }
          } catch (error) {
            console.error('Error fetching venue directions:', error);
          }
        };

        fetchDirections();
      }
    }
  }, [searchParams, userLocation, mapLoaded, displayRoute]);

  // Open native maps for navigation
  const openNativeNavigation = () => {
    if (!venueDirections) return;
    
    const { lat, lng, name } = venueDirections;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
      // Apple Maps
      window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(name)}`, '_blank');
    } else {
      // Google Maps
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(name)}`, '_blank');
    }
  };

  // Note: earnings are now managed by useDriverEarnings hook

  // Geocoding search function using Mapbox
  const searchAddresses = useCallback(async (query: string, proximity?: { lat: number; lng: number }) => {
    if (!query || query.length < 3) return [];
    
    try {
      const proximityParam = proximity 
        ? `&proximity=${proximity.lng},${proximity.lat}` 
        : userLocation 
          ? `&proximity=${userLocation.lng},${userLocation.lat}` 
          : '';
      
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5${proximityParam}&types=address,poi`
      );
      const data = await response.json();
      return data.features || [];
    } catch (error) {
      console.error('Geocoding error:', error);
      return [];
    }
  }, [userLocation]);

  // Handle pickup address search
  const handlePickupSearch = useCallback(async (value: string) => {
    setPickupAddress(value);
    if (value.length >= 3) {
      const results = await searchAddresses(value);
      setPickupSuggestions(results);
      setShowPickupSuggestions(true);
    } else {
      setPickupSuggestions([]);
      setShowPickupSuggestions(false);
    }
  }, [searchAddresses]);

  // Handle destination address search
  const handleDestinationSearch = useCallback(async (value: string) => {
    setDestinationAddress(value);
    if (value.length >= 3) {
      const results = await searchAddresses(value);
      setDestinationSuggestions(results);
      setShowDestinationSuggestions(true);
    } else {
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
    }
  }, [searchAddresses]);

  // Select pickup suggestion
  const selectPickupSuggestion = (suggestion: any) => {
    setPickupAddress(suggestion.place_name);
    setPickupCoords({ lat: suggestion.center[1], lng: suggestion.center[0] });
    setShowPickupSuggestions(false);
    calculateFareEstimateFromRoute(
      { lat: suggestion.center[1], lng: suggestion.center[0] },
      destinationCoords
    );
  };

  // Select destination suggestion
  const selectDestinationSuggestion = (suggestion: any) => {
    setDestinationAddress(suggestion.place_name);
    setDestinationCoords({ lat: suggestion.center[1], lng: suggestion.center[0] });
    setShowDestinationSuggestions(false);
    calculateFareEstimateFromRoute(pickupCoords, { lat: suggestion.center[1], lng: suggestion.center[0] });
  };

  // Calculate fare estimate using real Mapbox directions API
  const calculateFareEstimateFromRoute = async (
    pickup: { lat: number; lng: number } | null,
    destination: { lat: number; lng: number } | null
  ) => {
    if (!pickup || !destination) return;
    
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();
      
      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        const distanceKm = route.distance / 1000;
        const durationMin = Math.round(route.duration / 60);
        
        // Use the hook's fare calculation for consistency
        const fareCalc = calculateRideFare(distanceKm, durationMin);
        
        setFareEstimate({
          fare: fareCalc.fare,
          distance: Math.round(distanceKm * 10) / 10,
          duration: durationMin,
          driverEarnings: fareCalc.driverEarnings,
          platformFee: fareCalc.platformFee,
        });
      }
    } catch (error) {
      console.error('Route calculation error:', error);
    }
  };

  // Use current location for pickup
  const useCurrentLocationForPickup = () => {
    if (userLocation) {
      setPickupCoords(userLocation);
      // Reverse geocode to get address
      fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${userLocation.lng},${userLocation.lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      )
        .then(res => res.json())
        .then(data => {
          if (data.features && data.features[0]) {
            setPickupAddress(data.features[0].place_name);
          } else {
            setPickupAddress('Current Location');
          }
        });
    }
  };

  // Search friends for ride booking
  const handleFriendSearch = useCallback(async (value: string) => {
    setFriendSearch(value);
    if (value.length >= 2) {
      // Mock friends data - in production would search customer_profiles
      const mockFriends = [
        { id: '1', display_name: 'Sarah Johnson', avatar_url: 'https://randomuser.me/api/portraits/women/32.jpg' },
        { id: '2', display_name: 'Mike Chen', avatar_url: 'https://randomuser.me/api/portraits/men/45.jpg' },
        { id: '3', display_name: 'Emma Williams', avatar_url: 'https://randomuser.me/api/portraits/women/67.jpg' },
        { id: '4', display_name: 'David Brown', avatar_url: 'https://randomuser.me/api/portraits/men/22.jpg' },
      ].filter(f => f.display_name.toLowerCase().includes(value.toLowerCase()));
      setFriendSuggestions(mockFriends);
    } else {
      setFriendSuggestions([]);
    }
  }, []);

  // Handle driver registration
  const handleDriverSignup = async () => {
    if (selectedModes.length === 0) {
      toast.error('Select at least one mode');
      return;
    }
    if (!driverVerification.canGoActive(selectedModes)) {
      toast.error('Upload required documents before continuing');
      return;
    }

    driverSignupAd.trackSignupStarted();

    const primary = selectedModes[0];
    const needsLicenseFields = primary === 'car' || primary === 'motorcycle';

    const result = await registerAsDriver(
      licenseId || null,
      primary,
      needsLicenseFields
        ? { make: vehicleMake, model: vehicleModel, plate: vehiclePlate }
        : undefined,
      selectedModes
    );

    if (result.success) {
      driverSignupAd.trackSignupCompleted();
      setShowDriverSignup(false);
      setLicenseId('');
      setVehicleMake('');
      setVehicleModel('');
      setVehiclePlate('');
      setSelectedModes([]);
      driverVerification.refresh();
    }
  };

  // Handle ride booking
  const handleBookRide = async () => {
    if (!pickupAddress || !destinationAddress) {
      toast.error(t('maps_driver.pickup_destination_required'));
      return;
    }

    const pickup = pickupCoords || userLocation;
    const destination = destinationCoords;

    if (!pickup) {
      toast.error(t('maps_driver.pickup_location_failed'));
      return;
    }

    if (!destination) {
      toast.error(t('maps_driver.destination_failed'));
      return;
    }

    const result = await bookRide(
      { address: pickupAddress, latitude: pickup.lat, longitude: pickup.lng },
      { address: destinationAddress, latitude: destination.lat, longitude: destination.lng },
      fareEstimate || undefined
    );

    if (result.success) {
      setShowRideBooking(false);
      setTrackingOrder(result.booking);
      setFareEstimate(null);
      setSelectedFriend(null);
      setIsForFriend(false);
      
      // Display route on map
      displayRoute(
        [pickup.lng, pickup.lat],
        [destination.lng, destination.lat]
      );
      
      if (isForFriend && selectedFriend) {
        toast.success(t('maps_driver.ride_booked_for', { name: selectedFriend.display_name }));
      }
    }
  };

  // Handle panel drag
  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 50) {
      setDriverPanelExpanded(false);
    } else if (info.offset.y < -50) {
      setDriverPanelExpanded(true);
    }
  };

  const zoomMap = (direction: 'in' | 'out') => {
    if (!map.current) return;
    if (direction === 'in') {
      map.current.zoomIn();
      return;
    }
    map.current.zoomOut();
  };

  const retryLocation = () => {
    geolocateControlRef.current?.trigger();
  };

  return (
    <div className={`customer-map-page${isMobile ? ' customer-map-page--mobile' : ''}${isDashboardPresentation ? ' customer-map-page--dashboard-presentation' : ''}${isLightMapStyle ? ' customer-map-page--light' : ''}`}>
      <h1 className="customer-map-page__sr-only">{t("feed:map.explore")}</h1>

      <div ref={mapContainer} className="customer-map-page__canvas" aria-label={t("feed:map.explore")} />

      {(!mapLoaded || locationLoading) && (
        <div className="customer-map-page__loading" aria-live="polite">
          <div>
            <span className="customer-map-page__loading-icon"><MapPin aria-hidden="true" /></span>
            <strong>{!mapLoaded ? t("feed:map.loading_map") : t("feed:map.finding_location")}</strong>
            <small>{t("feed:map.allow_location")}</small>
          </div>
        </div>
      )}

      {locationError && !locationLoading && (
        <section className="customer-map-page__permission" role="alert">
          <div>
            <MapPinOff aria-hidden="true" />
            <span>{locationError}</span>
          </div>
          <button type="button" onClick={retryLocation}>
            <Crosshair aria-hidden="true" />
            {t("common:actions.retry")}
          </button>
        </section>
      )}

      {/* Venue Directions Panel */}
      {venueDirections && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="customer-map-page__directions"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan/20 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-cyan" />
              </div>
              <div>
                <h3 className="text-white font-semibold">{venueDirections.name}</h3>
                <p className="text-white/60 text-sm">
                  {venueDirections.distance?.toFixed(1)} km • {venueDirections.duration} min
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setVenueDirections(null);
                navigate('/app/maps', { replace: true });
              }}
              className="text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          <Button
            onClick={openNativeNavigation}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold h-12 text-lg hover:from-green-600 hover:to-emerald-600"
          >
            <Navigation2 className="w-5 h-5 mr-2" />
            {t("feed:map.start_navigation")}
          </Button>
        </motion.div>
      )}

      {!isDashboardPresentation && (
        <nav className="customer-map-page__modes" aria-label={t("feed:map.explore")}>
          <button
            type="button"
            className={activeTab === 'explore' ? 'customer-map-page__mode customer-map-page__mode--active' : 'customer-map-page__mode'}
            aria-pressed={activeTab === 'explore'}
            onClick={() => {
              setActiveTab('explore');
              setIsNearbyPanelOpen(true);
            }}
          >
            <MapPin aria-hidden="true" />
            {t("feed:map.explore")}
          </button>
          <button
            type="button"
            className={activeTab === 'ride' ? 'customer-map-page__mode customer-map-page__mode--active' : 'customer-map-page__mode'}
            aria-pressed={activeTab === 'ride'}
            onClick={() => setActiveTab('ride')}
          >
            <Car aria-hidden="true" />
            {t("feed:map.book_ride")}
          </button>
          <button
            type="button"
            className={activeTab === 'driver' ? 'customer-map-page__mode customer-map-page__mode--active' : 'customer-map-page__mode'}
            aria-pressed={activeTab === 'driver'}
            onClick={() => setActiveTab('driver')}
          >
            <Navigation aria-hidden="true" />
            {t("feed:map.driver")}
          </button>
        </nav>
      )}

      {/* ── Desktop Left Panel — Explore tab only, lg+ screens ─────────── */}
      {(isDashboardPresentation || activeTab === 'explore') && (
        <>
          <aside className={`customer-map-page__nearby-panel${isNearbyPanelOpen ? '' : ' customer-map-page__nearby-panel--hidden'}`} aria-label="Explore nearby" aria-hidden={!isNearbyPanelOpen}>
            <header className="customer-map-page__nearby-header">
              <span className="customer-map-page__nearby-icon"><MapPin aria-hidden="true" /></span>
              <div>
                <h2>Explore nearby</h2>
                <p>Discover plans around you</p>
              </div>
              <button type="button" aria-label="Hide nearby panel" title="Hide nearby panel" onClick={() => setIsNearbyPanelOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </header>
            <label className="customer-map-page__nearby-search">
              <Search aria-hidden="true" />
              <Input type="search" placeholder={t("feed:search.venues_cities")} aria-label={t("feed:search.venues_cities")} />
            </label>
            <div className="customer-map-page__filters" role="group" aria-label="Nearby filters">
              <button type="button" className={showAllVenues ? 'customer-map-page__filter customer-map-page__filter--active' : 'customer-map-page__filter'} aria-pressed={showAllVenues} onClick={() => selectNearbyFilter('venues')}>
                <MapPin aria-hidden="true" />
                {t("feed:map.venues")}
              </button>
              <button type="button" className={showFriends ? 'customer-map-page__filter customer-map-page__filter--active' : 'customer-map-page__filter'} aria-pressed={showFriends} onClick={() => selectNearbyFilter('friends')}>
                <Users aria-hidden="true" />
                {t("feed:map.friends")}
              </button>
              <button type="button" className={showFollowedVenues ? 'customer-map-page__filter customer-map-page__filter--active' : 'customer-map-page__filter'} aria-pressed={showFollowedVenues} onClick={() => selectNearbyFilter('following')}>
                <Heart aria-hidden="true" />
                {t("feed:map.followed")}
              </button>
            </div>
            <div className="customer-map-page__nearby-empty">
              <span><MapIcon aria-hidden="true" /></span>
              <h3>Venue locations nearby</h3>
              <p>Search for a venue or adjust the map to find places to explore.</p>
            </div>
          </aside>
          <button
            type="button"
            className={isNearbyPanelOpen ? 'customer-map-page__nearby-toggle' : 'customer-map-page__nearby-toggle customer-map-page__nearby-toggle--visible'}
            aria-label="Show nearby panel"
            title="Show nearby panel"
            onClick={() => setIsNearbyPanelOpen(true)}
          >
            <PanelLeftOpen aria-hidden="true" />
          </button>
        </>
      )}

      <div className="customer-map-page__tools" aria-label="Map controls">
        <button type="button" onClick={() => zoomMap('in')} aria-label="Zoom in" title="Zoom in"><Plus aria-hidden="true" /></button>
        <button type="button" onClick={() => zoomMap('out')} aria-label="Zoom out" title="Zoom out"><Minus aria-hidden="true" /></button>
        <span aria-hidden="true" />
        <button type="button" onClick={retryLocation} aria-label="Center on your location" title="Center on your location"><Crosshair aria-hidden="true" /></button>
        <button type="button" onClick={() => setIsLightMapStyle((isLight) => !isLight)} aria-label="Change map style" aria-pressed={isLightMapStyle} title="Change map style"><Layers3 aria-hidden="true" /></button>
      </div>
      <p className="customer-map-page__attribution">Map data &copy; <a href="https://www.mapbox.com/" target="_blank" rel="noreferrer">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</p>

      {/* Bottom Panel - Swipeable for Driver */}
      <AnimatePresence>
        {!isDashboardPresentation && activeTab !== 'explore' && (
          <motion.div 
            className="customer-map-page__bottom-panel"
            style={{ bottom: isMobile ? 'max(4.5rem, env(safe-area-inset-bottom, 0px))' : '0px' }}
            initial={false}
            animate={{ 
              y: activeTab === 'driver' && isDriver && !driverPanelExpanded ? 'calc(100% - 80px)' : 0 
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
          {/* Drag Handle for Driver Tab */}
          {activeTab === 'driver' && isDriver && (
            <div 
              className="flex justify-center py-2 cursor-grab active:cursor-grabbing"
              onClick={() => setDriverPanelExpanded(!driverPanelExpanded)}
            >
              <motion.div 
                className="w-12 h-1.5 bg-white/30 rounded-full"
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                onDragEnd={handleDragEnd}
              />
            </div>
          )}

          <div className="bg-gradient-to-t from-black via-black/95 to-transparent pt-4 pb-4 px-4 max-h-[50vh] overflow-y-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            
            {/* Ride Tab Content */}
            {activeTab === 'ride' && (
              <div className="space-y-4">
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                  <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                    <Car className="w-5 h-5 text-cyan" />
                    {t("feed:map.jv_ride")}
                  </h3>
                  <p className="text-white/60 text-sm mb-4">
                    Drivers keep <span className="text-cyan font-bold">100%</span> of fares!
                  </p>
                  <Button
                    onClick={() => setShowRideBooking(true)}
                    className="w-full bg-gradient-to-r from-cyan to-purple hover:opacity-90"
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    {t("feed:map.book_a_ride")}
                  </Button>
                </div>

                {/* Active Ride Tracking */}
                {trackingOrder && (
                  <div className="bg-gradient-to-r from-green-500/20 to-cyan/20 backdrop-blur-xl rounded-2xl p-4 border border-green-500/30">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-white font-bold flex items-center gap-2">
                        <Navigation className="w-5 h-5 text-green-400 animate-pulse" />
                        {trackingOrder.status === 'pending' ? t("feed:map.finding_driver") : t("feed:map.driver_en_route")}
                      </h4>
                      <span className="text-green-400 text-sm flex items-center gap-1">
                        <Route className="w-4 h-4" />
                        {t("feed:map.route_active")}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-white/80">
                        <span className="text-white/50">{t("feed:map.to")}:</span> {trackingOrder.destination_address}
                      </p>
                      <p className="text-white/80">
                        <span className="text-white/50">{t("feed:map.est_fare")}:</span> ${trackingOrder.estimated_fare?.toFixed(2)}
                      </p>
                      <p className="text-white/80">
                        <span className="text-white/50">{t("feed:map.distance")}:</span> {trackingOrder.distance_km?.toFixed(1)} km
                      </p>
                    </div>
                    <Button
                      onClick={() => setShowTrackingMap(true)}
                      className="w-full mt-3 bg-gradient-to-r from-cyan to-purple hover:opacity-90"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      {t("feed:map.track_driver_live")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Driver Tab Content */}
            {activeTab === 'driver' && (
              <div className="space-y-4">
                {!isDriver ? (
                  <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                      <Navigation className="w-5 h-5 text-purple" />
                      {t("feed:map.become_jv_driver")}
                    </h3>
                    <p className="text-white/60 text-sm mb-4">
                      {t("feed:map.driver_earnings_pitch")}
                    </p>
                    <Button
                      onClick={() => setShowDriverSignup(true)}
                      className="w-full bg-gradient-to-r from-purple to-pink hover:opacity-90"
                    >
                      <Car className="w-4 h-4 mr-2" />
                      {t("feed:map.sign_up_to_drive")}
                    </Button>
                  </div>
                ) : (
                  <motion.div 
                    className="space-y-4"
                    animate={{ opacity: driverPanelExpanded ? 1 : 0.5 }}
                  >
                    {/* Driver Stats with Earnings */}
                    <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                      {/* Header with toggle */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                            activeShift 
                              ? 'bg-green-500/20 ring-2 ring-green-500' 
                              : 'bg-white/10'
                          }`}>
                            <Car className={`w-6 h-6 ${activeShift ? 'text-green-400' : 'text-white/50'}`} />
                          </div>
                          <div>
                            <h4 className="text-white font-bold">{t("feed:map.driver_mode")}</h4>
                            <p className="text-white/50 text-sm">
                              {activeShift ? t("common:status.online") : t("common:status.offline")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => setShowEarningsPopup(true)}
                            className="flex items-center gap-1 bg-green-500/20 px-3 py-1.5 rounded-lg border border-green-500/30 hover:bg-green-500/30 transition-colors"
                          >
                            <DollarSign className="w-4 h-4 text-green-400" />
                            <span className="text-green-400 font-bold text-sm">
                              ${earnings.currentShift.toFixed(2)}
                            </span>
                          </button>
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-400" />
                            <span className="text-white font-bold">{driverProfile?.average_rating?.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Driver Modes management — moved to top so the available-orders area at the bottom has more room. */}
                      {(() => {
                        const ALL_MODES: Array<{ key: 'car' | 'motorcycle' | 'bicycle' | 'runner'; label: string; icon: typeof Car; req: 'license' | 'id' }> = [
                          { key: 'car', label: 'Car', icon: Car, req: 'license' },
                          { key: 'motorcycle', label: 'Moto', icon: Bike, req: 'license' },
                          { key: 'bicycle', label: 'Bike', icon: Bike, req: 'id' },
                          { key: 'runner', label: 'Runner', icon: Navigation2, req: 'id' },
                        ];
                        const enabled = (driverProfile?.vehicle_modes ?? []) as Array<'car' | 'motorcycle' | 'bicycle' | 'runner'>;
                        return (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-white/60 text-xs uppercase tracking-wide">Active modes</span>
                              <button
                                onClick={() => setShowModeManager(true)}
                                className="text-cyan text-xs hover:underline"
                              >
                                Manage
                              </button>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {ALL_MODES.map(({ key, label, icon: Icon, req }) => {
                                const isOn = enabled.includes(key);
                                const unlocked = req === 'license' ? driverVerification.hasLicense : driverVerification.hasId18Plus;
                                const onClick = async () => {
                                  if (activeShift) {
                                    toast.error('End your shift before changing modes');
                                    return;
                                  }
                                  if (!unlocked) {
                                    if (!driverVerification.state.signupVerified && !driverVerification.state.signupPending) {
                                      navigate('/user/id-verification');
                                    } else if (req === 'license') {
                                      setShowLicenseUpload(true);
                                    } else {
                                      setShowIdUpload(true);
                                    }
                                    return;
                                  }
                                  const next = isOn ? enabled.filter((m) => m !== key) : [...enabled, key];
                                  if (next.length === 0) {
                                    toast.error('Keep at least one mode enabled');
                                    return;
                                  }
                                  await updateVehicleModes(next);
                                };
                                return (
                                  <button
                                    key={key}
                                    onClick={onClick}
                                    className={`relative px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                                      isOn
                                        ? 'bg-cyan/20 border-cyan text-cyan'
                                        : unlocked
                                        ? 'bg-white/5 border-white/10 text-white/70 hover:text-white'
                                        : 'bg-white/5 border-white/10 text-white/40'
                                    }`}
                                    title={!unlocked ? 'Verify ID first' : isOn ? 'Tap to disable' : 'Tap to enable'}
                                  >
                                    <Icon className="w-3.5 h-3.5" />
                                    {label}
                                    <span className="ml-0.5 text-[10px]">
                                      {isOn ? '✓' : unlocked ? '+' : '🔒'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-black/30 rounded-xl p-3 text-center">
                          <Package className="w-5 h-5 text-cyan mx-auto mb-1" />
                          <p className="text-white font-bold">{driverProfile?.total_deliveries}</p>
                          <p className="text-white/50 text-xs">{t("feed:map.deliveries")}</p>
                        </div>
                        <div className="bg-black/30 rounded-xl p-3 text-center">
                          <Car className="w-5 h-5 text-purple mx-auto mb-1" />
                          <p className="text-white font-bold">{driverProfile?.total_rides}</p>
                          <p className="text-white/50 text-xs">{t("feed:map.rides")}</p>
                        </div>
                      </div>

                      {/* Quick Earnings Display */}
                      {activeShift && (
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-black/30 rounded-lg p-2 text-center">
                            <p className="text-white/50 text-xs">{t("feed:map.last_drive")}</p>
                            <p className="text-green-400 font-bold text-sm">${earnings.lastDrive.toFixed(2)}</p>
                          </div>
                          <div className="bg-black/30 rounded-lg p-2 text-center">
                            <p className="text-white/50 text-xs">{t("feed:map.this_shift")}</p>
                            <p className="text-cyan font-bold text-sm">${earnings.currentShift.toFixed(2)}</p>
                          </div>
                          <div className="bg-black/30 rounded-lg p-2 text-center">
                            <p className="text-white/50 text-xs">{t("feed:map.this_week")}</p>
                            <p className="text-purple font-bold text-sm">${earnings.thisWeek.toFixed(2)}</p>
                          </div>
                        </div>
                      )}

                      {!activeShift ? (
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            onClick={() => startShift('delivery')}
                            size="sm"
                            className="bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/30"
                          >
                            <Package className="w-4 h-4 mr-1" />
                            {t("feed:map.delivery")}
                          </Button>
                          <Button
                            onClick={() => startShift('ride')}
                            size="sm"
                            className="bg-purple/20 hover:bg-purple/30 text-purple border border-purple/30"
                          >
                            <Car className="w-4 h-4 mr-1" />
                            {t("feed:map.rides")}
                          </Button>
                          <Button
                            onClick={() => startShift('both')}
                            size="sm"
                            className="bg-gradient-to-r from-cyan to-purple hover:opacity-90"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            {t("feed:map.both")}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-green-500/20 rounded-xl p-3 border border-green-500/30">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-green-400 font-medium">
                                {t("feed:map.active_shift_type", { type: activeShift.shift_type === 'both' ? t("feed:map.delivery_and_rides") : activeShift.shift_type })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={toggleSound}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  soundEnabled ? 'bg-cyan/20 text-cyan' : 'bg-white/10 text-white/40'
                                }`}
                                title={soundEnabled ? 'Sound on' : 'Sound off'}
                              >
                                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                              </button>
                              <span className="text-green-400 text-sm font-bold">
                                ${activeShift.earnings?.toFixed(2) || '0.00'} {t("feed:map.earned")}
                              </span>
                            </div>
                          </div>
                          {(() => {
                            const validDeliveries = availableDeliveries.filter(d =>
                              ['pending', 'venue_confirmed', 'ready_for_pickup'].includes(d.status || 'pending') &&
                              !ignoredOrderIds.has(d.id)
                            );
                            const validRides = availableRides.filter(r =>
                              r.status === 'pending' && !ignoredOrderIds.has(r.id)
                            );
                            const total = validDeliveries.length + validRides.length;
                            if (total === 0) return null;
                            return (
                              <button
                                onClick={() => {
                                  document
                                    .getElementById('driver-available-orders')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                className="w-full flex items-center justify-between rounded-xl border border-cyan/40 bg-cyan/10 px-3 py-2.5 animate-pulse"
                              >
                                <span className="flex items-center gap-2 text-cyan text-sm font-bold">
                                  <Package className="w-4 h-4" />
                                  {total} new {total === 1 ? 'order' : 'orders'} waiting
                                </span>
                                <span className="text-cyan/80 text-xs">Tap to view ↓</span>
                              </button>
                            );
                          })()}
                          <Button
                            onClick={endShift}
                            variant="outline"
                            className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                          >
                            <Square className="w-4 h-4 mr-2" />
                            {t("feed:map.end_shift")}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Available Orders List - Filter to valid statuses and not ignored */}
                    {activeShift && (() => {
                      // Filter deliveries: only show pending, venue_confirmed, ready_for_pickup and not ignored
                      const validDeliveries = availableDeliveries.filter(d => 
                        ['pending', 'venue_confirmed', 'ready_for_pickup'].includes(d.status || 'pending') &&
                        !ignoredOrderIds.has(d.id)
                      );
                      // Filter rides: only show pending and not ignored
                      const validRides = availableRides.filter(r => 
                        r.status === 'pending' && 
                        !ignoredOrderIds.has(r.id)
                      );
                      
                      const totalOrders = validDeliveries.length + validRides.length;
                      
                      if (totalOrders === 0) return null;
                      
                      return (
                        <div id="driver-available-orders" className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 max-h-48 overflow-y-auto">
                          <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4 text-cyan" />
                            {t("feed:map.available_orders", { count: totalOrders })}
                          </h4>
                          <div className="space-y-2">
                            {validDeliveries.map((delivery) => (
                              <div
                                key={delivery.id}
                                className="bg-black/30 rounded-xl p-3 border border-cyan/20"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-cyan text-xs font-medium flex items-center gap-1">
                                    <Package className="w-3 h-3" />
                                    {t("feed:map.delivery")}
                                  </span>
                                  <span className="text-green-400 font-bold text-sm">
                                    ${delivery.delivery_fee?.toFixed(2) || '0.00'}
                                  </span>
                                </div>
                                <p className="text-white/70 text-xs truncate mb-1">
                                  <MapPin className="w-3 h-3 inline mr-1 text-green-400" />
                                  {delivery.pickup_address || 'Restaurant'}
                                </p>
                                <p className="text-white/70 text-xs truncate mb-2">
                                  <ArrowRight className="w-3 h-3 inline mr-1 text-red-400" />
                                  {delivery.delivery_address}
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => setIgnoredOrderIds(prev => new Set([...prev, delivery.id]))}
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 border-white/20 text-white/60 hover:bg-white/10 hover:text-white"
                                  >
                                    <X className="w-3 h-3 mr-1" />
                                    {t("feed:map.ignore")}
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      setPendingOrder(delivery);
                                      setPendingOrderType('delivery');
                                      setShowAcceptModal(true);
                                    }}
                                    disabled={acceptingOrderId === delivery.id}
                                    size="sm"
                                    className="flex-1 bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/30"
                                  >
                                    {acceptingOrderId === delivery.id ? (
                                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4 mr-1" />
                                    )}
                                    {t("common:actions.accept")}
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {validRides.map((ride) => (
                              <div
                                key={ride.id}
                                className="bg-black/30 rounded-xl p-3 border border-purple/20"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-purple text-xs font-medium flex items-center gap-1">
                                    <Car className="w-3 h-3" />
                                    {t("feed:map.ride")}
                                  </span>
                                  <span className="text-green-400 font-bold text-sm">
                                    ${ride.estimated_fare?.toFixed(2) || '0.00'}
                                  </span>
                                </div>
                                <p className="text-white/70 text-xs truncate mb-1">
                                  <MapPin className="w-3 h-3 inline mr-1 text-green-400" />
                                  {ride.pickup_address}
                                </p>
                                <p className="text-white/70 text-xs truncate mb-2">
                                  <ArrowRight className="w-3 h-3 inline mr-1 text-red-400" />
                                  {ride.destination_address}
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => setIgnoredOrderIds(prev => new Set([...prev, ride.id]))}
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 border-white/20 text-white/60 hover:bg-white/10 hover:text-white"
                                  >
                                    <X className="w-3 h-3 mr-1" />
                                    {t("feed:map.ignore")}
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      setPendingOrder(ride);
                                      setPendingOrderType('ride');
                                      setShowAcceptModal(true);
                                    }}
                                    disabled={acceptingOrderId === ride.id}
                                    size="sm"
                                    className="flex-1 bg-purple/20 hover:bg-purple/30 text-purple border border-purple/30"
                                  >
                                    {acceptingOrderId === ride.id ? (
                                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4 mr-1" />
                                    )}
                                    {t("common:actions.accept")}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Active Order Display with Chat Button */}
                    {activeOrder && (activeOrder as any).source_type === 'runner_job' ? (
                      <ActiveJobRunnerMode
                        job={(activeOrder as any).runner_job}
                        onUpdated={refreshActiveOrder}
                      />
                    ) : activeOrder ? (
                      <div className="bg-gradient-to-r from-green-500/20 to-cyan/20 rounded-2xl p-4 border border-green-500/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-white font-bold flex items-center gap-2">
                            <Package className="w-5 h-5 text-green-400" />
                            Active {'delivery_address' in activeOrder ? t("feed:map.delivery") : t("feed:map.ride")}
                          </h4>
                          <Button
                            onClick={() => setShowChat(true)}
                            size="sm"
                            className="bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/30"
                          >
                            <MessageCircle className="w-4 h-4 mr-1" />
                            {t("feed:map.chat")}
                          </Button>
                        </div>
                        <div className="space-y-1 text-sm">
                          <p className="text-white/70">
                            <MapPin className="w-3 h-3 inline mr-1 text-green-400" />
                            {activeOrder.pickup_address || 'Pickup'}
                          </p>
                          <p className="text-white/70">
                            <ArrowRight className="w-3 h-3 inline mr-1 text-red-400" />
                            {'delivery_address' in activeOrder ? activeOrder.delivery_address : 'destination_address' in activeOrder ? activeOrder.destination_address : 'Destination'}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {/* No orders message */}
                    {activeShift && !activeOrder && availableDeliveries.length === 0 && availableRides.length === 0 && (
                      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 text-center">
                        <p className="text-white/50 text-sm">{t("feed:map.no_available_orders")}</p>
                        <p className="text-white/30 text-xs mt-1">{t("feed:map.new_orders_appear")}</p>
                      </div>
                    )}

                    {/* Collapse indicator */}
                    <button 
                      onClick={() => setDriverPanelExpanded(!driverPanelExpanded)}
                      className="w-full flex items-center justify-center gap-2 text-white/40 hover:text-white/60 transition-colors py-1"
                    >
                      {driverPanelExpanded ? (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          <span className="text-xs">{t("feed:map.swipe_down_map")}</span>
                          <ChevronDown className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          <span className="text-xs">{t("feed:map.swipe_up_panel")}</span>
                          <ChevronUp className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {/* Explore Tab Content — hidden on lg+ (shown in left panel instead) */}
          </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Earnings Popup Modal */}
      <Dialog open={showEarningsPopup} onOpenChange={setShowEarningsPopup}>
        <DialogContent className="customer-dialog-surface max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[var(--customer-modal-text)] flex items-center gap-2">
              <Wallet className="w-6 h-6 text-green-400" />
              {t("feed:map.your_earnings")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Total Earnings Card */}
            <div className="bg-[var(--customer-modal-raised)] rounded-[6px] p-6 border border-[var(--customer-modal-line)] text-center">
              <p className="text-white/60 text-sm mb-1">{t("feed:map.total_this_week")}</p>
              <p className="text-4xl font-bold text-white">${earnings.thisWeek.toFixed(2)}</p>
              <div className="flex items-center justify-center gap-1 mt-2 text-green-400 text-sm">
                <TrendingUp className="w-4 h-4" />
                <span>{t("feed:map.keep_driving")}</span>
              </div>
            </div>

            {/* Breakdown Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan/20 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-cyan" />
                  </div>
                  <span className="text-white/60 text-sm">{t("feed:map.last_drive")}</span>
                </div>
                <p className="text-white font-bold text-xl">${earnings.lastDrive.toFixed(2)}</p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-white/60 text-sm">{t("feed:map.this_shift")}</span>
                </div>
                <p className="text-white font-bold text-xl">${earnings.currentShift.toFixed(2)}</p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/10 col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-yellow-400" />
                  </div>
                  <span className="text-white/60 text-sm">{t("feed:map.this_week")}</span>
                </div>
                <p className="text-white font-bold text-xl">${earnings.thisWeek.toFixed(2)}</p>
              </div>
            </div>

            {/* Stats Summary */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="text-white font-bold mb-3">{t("feed:map.performance")}</h4>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-white/50 text-xs">{t("feed:map.deliveries")}</p>
                  <p className="text-cyan font-bold">{driverProfile?.total_deliveries || 0}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">{t("feed:map.rides")}</p>
                  <p className="text-purple font-bold">{driverProfile?.total_rides || 0}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">{t("feed:map.rating")}</p>
                  <p className="text-yellow-400 font-bold flex items-center justify-center gap-1">
                    <Star className="w-3 h-3" />
                    {driverProfile?.average_rating?.toFixed(1) || '5.0'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowEarningsPopup(false);
                  navigate('/driver/earnings');
                }}
                variant="outline"
                className="customer-modal-secondary flex-1"
              >
                <History className="w-4 h-4 mr-2" />
                {t("feed:map.view_history")}
              </Button>
              <Button
                onClick={() => setShowEarningsPopup(false)}
                className="customer-modal-primary flex-1"
              >
                {t("common:actions.close")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Driver Navigation Component */}
      {activeOrder && activeShift && (
        <DriverNavigation
          pickupCoords={
            'pickup_latitude' in activeOrder && activeOrder.pickup_latitude
              ? { lat: activeOrder.pickup_latitude, lng: activeOrder.pickup_longitude! }
              : null
          }
          dropoffCoords={
            'delivery_latitude' in activeOrder && activeOrder.delivery_latitude
              ? { lat: activeOrder.delivery_latitude, lng: activeOrder.delivery_longitude! }
              : 'destination_latitude' in activeOrder && activeOrder.destination_latitude
                ? { lat: activeOrder.destination_latitude, lng: activeOrder.destination_longitude! }
                : null
          }
          pickupAddress={activeOrder.pickup_address || 'Pickup Location'}
          dropoffAddress={
            'delivery_address' in activeOrder 
              ? activeOrder.delivery_address 
              : 'destination_address' in activeOrder 
                ? activeOrder.destination_address 
                : 'Destination'
          }
          currentLocation={userLocation}
          isPickedUp={isPickedUp}
          mapboxToken={MAPBOX_TOKEN}
          onArrived={() => {
            if (!isPickedUp) {
              toast.success(t('maps_driver.arrived_pickup'));
            } else {
              toast.success(t('maps_driver.arrived_destination'));
            }
          }}
          onPickedUp={async () => {
            setIsPickedUp(true);
            // Update status in database
            if ('delivery_address' in activeOrder) {
              await updateDeliveryStatus(activeOrder.id, 'picked_up');
            } else {
              await updateRideStatus(activeOrder.id, 'picked_up');
            }
            toast.success(t('maps_driver.order_picked_up'));
          }}
          onDelivered={async () => {
            // Update status in database
            if ('delivery_address' in activeOrder) {
              await updateDeliveryStatus(activeOrder.id, 'delivered');
            } else {
              await updateRideStatus(activeOrder.id, 'completed');
            }
            setIsPickedUp(false);
            toast.success(t('maps_driver.delivery_completed'));
          }}
          onEndNavigation={() => {
            setIsPickedUp(false);
          }}
          onOpenChat={(target) => { setChatTarget(target); setShowChat(true); }}
        />
      )}

      {/* Driver Signup Modal */}
      <Dialog open={showDriverSignup} onOpenChange={setShowDriverSignup}>
        <DialogContent className="customer-dialog-surface max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[var(--customer-modal-text)]">
              {t("feed:map.become_jv_driver")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Perks (left) + Sponsored auto ad slot (right) on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[var(--customer-modal-raised)] rounded-[6px] p-4 border border-[var(--customer-modal-line)]">
                <h4 className="text-white font-bold mb-2">{t("feed:map.why_drive")}</h4>
                <ul className="text-white/70 text-sm space-y-1">
                  <li>{t("feed:map.driver_perk_1")}</li>
                  <li>{t("feed:map.driver_perk_2")}</li>
                  <li>{t("feed:map.driver_perk_3")}</li>
                  <li>{t("feed:map.driver_perk_4")}</li>
                </ul>
              </div>
              {driverSignupAd.ad && (
                <DriverSignupAdCard ad={driverSignupAd.ad} onClick={driverSignupAd.trackClick} />
              )}
            </div>

            {/* Verification status banner — uses signup AWS Textract/Rekognition data */}
            {driverVerification.state.signupVerified ? (
              <div className="rounded-xl p-3 bg-green-500/10 border border-green-500/30 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <p className="text-xs text-green-200">
                  Identity verified at signup
                  {driverVerification.state.idDocumentType === 'drivers_license'
                    ? ' (driver\'s license on file — Car & Motorcycle unlocked)'
                    : ' (Bicycle & JV Runner unlocked — upload a license to unlock Car/Motorcycle)'}
                </p>
              </div>
            ) : driverVerification.state.signupPending ? (
              <div className="rounded-xl p-3 bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs text-yellow-200">
                  Your signup ID is being reviewed — modes are temporarily unlocked but you'll only go active once verification completes.
                </p>
              </div>
            ) : (
              <div className="rounded-xl p-3 bg-cyan/10 border border-cyan/30 flex items-center justify-between gap-2">
                <p className="text-xs text-cyan-100">
                  Verify your ID once and unlock every driver mode in seconds.
                </p>
                <Button
                  size="sm"
                  onClick={() => navigate('/user/id-verification')}
                  className="bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/30 shrink-0"
                >
                  Verify ID
                </Button>
              </div>
            )}

            <div>
              <label className="text-white/70 text-sm mb-2 block">How do you want to operate?</label>
              <VehicleModePicker
                selected={selectedModes}
                onToggle={(mode) =>
                  setSelectedModes((prev) =>
                    prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
                  )
                }
                onLockedClick={(_mode, requiredDoc) => {
                  // If user has zero signup verification, push them to the central
                  // OCR-powered flow instead of the fallback upload sheet.
                  if (!driverVerification.state.signupVerified && !driverVerification.state.signupPending) {
                    navigate('/user/id-verification');
                    return;
                  }
                  if (requiredDoc === 'license') setShowLicenseUpload(true);
                  else setShowIdUpload(true);
                }}
                hasLicense={driverVerification.hasLicense}
                hasId18Plus={driverVerification.hasId18Plus}
                preferCentralVerification={!driverVerification.state.signupVerified && !driverVerification.state.signupPending}
              />
              <p className="text-white/40 text-[11px] mt-2">
                Car / Motorcycle require a driver's license. Bicycle / JV Runner require an 18+ government ID. You can't go active until your required document is at least uploaded.
              </p>
            </div>

            {(selectedModes.includes('car') || selectedModes.includes('motorcycle')) && (
              <>
                <div>
                  <label className="text-white/70 text-sm mb-1 block flex items-center justify-between">
                    <span>{t("feed:map.license_id_label")}</span>
                    {driverVerification.state.extractedDocumentNumber && licenseId === driverVerification.state.extractedDocumentNumber && (
                      <span className="text-[10px] text-green-400 font-normal">
                        ✓ Auto-filled from your verified ID
                      </span>
                    )}
                  </label>
                  <Input
                    value={licenseId}
                    onChange={(e) => setLicenseId(e.target.value)}
                    placeholder={t("feed:map.license_placeholder")}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">{t("feed:map.make")}</label>
                    <Input
                      value={vehicleMake}
                      onChange={(e) => setVehicleMake(e.target.value)}
                      placeholder="Toyota"
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-white/70 text-sm mb-1 block">{t("feed:map.model")}</label>
                    <Input
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      placeholder="Camry"
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-white/70 text-sm mb-1 block">{t("feed:map.license_plate")}</label>
                  <Input
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="ABC123"
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
              </>
            )}

            <Button
              onClick={handleDriverSignup}
              disabled={!driverVerification.canGoActive(selectedModes)}
               className="customer-modal-primary w-full disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {t("feed:map.complete_registration")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LicenseUploadSheet
        open={showLicenseUpload}
        onOpenChange={setShowLicenseUpload}
        onUploaded={() => driverVerification.refresh()}
      />
      <IdUploadSheet
        open={showIdUpload}
        onOpenChange={setShowIdUpload}
        onUploaded={() => driverVerification.refresh()}
      />

      {/* Driver Modes Manager — post-signup full-screen mode picker */}
      <Dialog open={showModeManager} onOpenChange={setShowModeManager}>
        <DialogContent className="customer-dialog-surface max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[var(--customer-modal-text)]">
              Manage Driver Modes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-white/60 text-sm">
              Toggle which modes you're available for. You can enable extra modes anytime — no need to re-register.
            </p>
            <VehicleModePicker
              selected={selectedModes}
              onToggle={(mode) =>
                setSelectedModes((prev) =>
                  prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
                )
              }
              onLockedClick={(_mode, requiredDoc) => {
                if (!driverVerification.state.signupVerified && !driverVerification.state.signupPending) {
                  navigate('/user/id-verification');
                  return;
                }
                if (requiredDoc === 'license') setShowLicenseUpload(true);
                else setShowIdUpload(true);
              }}
              hasLicense={driverVerification.hasLicense}
              hasId18Plus={driverVerification.hasId18Plus}
              preferCentralVerification={!driverVerification.state.signupVerified && !driverVerification.state.signupPending}
            />
            <p className="text-white/40 text-[11px]">
              Car / Motorcycle require a driver's license. Bicycle / JV Runner require an 18+ government ID.
            </p>
            <Button
              onClick={async () => {
                if (activeShift) {
                  toast.error('End your shift before changing modes');
                  return;
                }
                if (selectedModes.length === 0) {
                  toast.error('Select at least one mode');
                  return;
                }
                const result = await updateVehicleModes(selectedModes);
                if (result.success) {
                  toast.success('Modes updated');
                  setShowModeManager(false);
                }
              }}
              disabled={selectedModes.length === 0}
               className="customer-modal-primary w-full disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Save modes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ride Booking Modal */}
      <Dialog open={showRideBooking} onOpenChange={setShowRideBooking}>
        <DialogContent className="customer-dialog-surface max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[var(--customer-modal-text)]">
              {t("feed:map.book_a_jv_ride")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Book for friend toggle - Switch style */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isForFriend ? 'bg-pink-500' : 'bg-white/10'
                }`}>
                  <Gift className={`w-5 h-5 ${isForFriend ? 'text-white' : 'text-pink-400'}`} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-white">{t("feed:map.book_for_friend")}</p>
                  <p className="text-xs text-white/50">{t("feed:map.send_ride_to_someone")}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsForFriend(!isForFriend);
                  setSelectedFriend(null);
                  setFriendSearch('');
                }}
                className={`relative w-14 h-7 rounded-full transition-all ${
                  isForFriend ? 'bg-pink-500' : 'bg-white/20'
                }`}
              >
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all ${
                  isForFriend ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>

            {/* Friend search */}
            {isForFriend && (
              <div className="relative">
                <label className="text-white/70 text-sm mb-1 block flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t("feed:map.search_friend")}
                </label>
                <Input
                  value={friendSearch}
                  onChange={(e) => handleFriendSearch(e.target.value)}
                  placeholder={t("feed:map.friend_name_placeholder")}
                  className="bg-white/5 border-white/10 text-white"
                />
                {friendSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-white/20 rounded-xl overflow-hidden shadow-xl">
                    {friendSuggestions.map((friend) => (
                      <button
                        key={friend.id}
                        onClick={() => {
                          setSelectedFriend(friend);
                          setFriendSearch(friend.display_name);
                          setFriendSuggestions([]);
                        }}
                        className="w-full p-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
                      >
                        <img src={friend.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                        <span className="text-white text-sm">{friend.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedFriend && (
                  <div className="mt-2 p-2 bg-pink-500/20 rounded-lg flex items-center gap-2 border border-pink-400/30">
                    <img src={selectedFriend.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                    <span className="text-pink-300 text-sm font-medium">{selectedFriend.display_name}</span>
                    <button 
                      onClick={() => {
                        setSelectedFriend(null);
                        setFriendSearch('');
                      }}
                      className="ml-auto p-1 hover:bg-white/10 rounded-full"
                    >
                      <X className="w-4 h-4 text-white/60" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Pickup Location with autocomplete */}
            <div className="relative">
              <label className="text-white/70 text-sm mb-1 block flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                {t("feed:map.pickup_location")}
              </label>
              <div className="flex gap-2">
                <Input
                  value={pickupAddress}
                  onChange={(e) => handlePickupSearch(e.target.value)}
                  placeholder={t("feed:map.pickup_placeholder")}
                  className="bg-white/5 border-white/10 text-white flex-1"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={useCurrentLocationForPickup}
                  className="border-cyan/30 hover:bg-cyan/20"
                >
                  <Navigation2 className="w-4 h-4 text-cyan" />
                </Button>
              </div>
              {showPickupSuggestions && pickupSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-white/20 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                  {pickupSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      onClick={() => selectPickupSuggestion(suggestion)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left border-b border-white/5 last:border-0"
                    >
                      <MapPin className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span className="text-white text-sm line-clamp-2">{suggestion.place_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Destination with autocomplete */}
            <div className="relative">
              <label className="text-white/70 text-sm mb-1 block flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                {t("feed:map.destination")}
              </label>
              <Input
                value={destinationAddress}
                onChange={(e) => handleDestinationSearch(e.target.value)}
                placeholder={t("feed:map.destination_placeholder")}
                className="bg-white/5 border-white/10 text-white"
              />
              {showDestinationSuggestions && destinationSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-white/20 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                  {destinationSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      onClick={() => selectDestinationSuggestion(suggestion)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-white/10 transition-colors text-left border-b border-white/5 last:border-0"
                    >
                      <MapPin className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span className="text-white text-sm line-clamp-2">{suggestion.place_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fare Estimate */}
            {fareEstimate && (
              <div className="bg-gradient-to-r from-cyan/10 to-purple/10 rounded-xl p-4 border border-cyan/20">
                <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-400" />
                  {t("feed:map.fare_estimate")}
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-white/50 text-xs">{t("feed:map.fare")}</p>
                    <p className="text-green-400 font-bold text-lg">${fareEstimate.fare.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs">{t("feed:map.distance")}</p>
                    <p className="text-cyan font-bold text-lg">{fareEstimate.distance} km</p>
                  </div>
                  <div>
                    <p className="text-white/50 text-xs">{t("feed:map.duration")}</p>
                    <p className="text-purple font-bold text-lg">{fareEstimate.duration} min</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex justify-between text-xs text-white/50">
                    <span>+ ${fareEstimate.platformFee.toFixed(2)} platform fee</span>
                    <span>Driver receives: <span className="text-green-400 font-medium">${fareEstimate.driverEarnings.toFixed(2)}</span></span>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleBookRide}
              disabled={!pickupAddress || !destinationAddress || (isForFriend && !selectedFriend)}
               className="customer-modal-primary w-full disabled:opacity-50"
            >
              <Car className="w-4 h-4 mr-2" />
              {isForFriend && selectedFriend ? t("feed:map.send_ride_to", { name: selectedFriend.display_name }) : t("feed:map.find_driver")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Order Tracking Map */}
      <AnimatePresence>
        {showTrackingMap && trackingOrder && (
          <OrderTrackingMap
            orderId={trackingOrder.id}
            orderType="ride"
            pickupLat={trackingOrder.pickup_latitude}
            pickupLng={trackingOrder.pickup_longitude}
            dropoffLat={trackingOrder.destination_latitude}
            dropoffLng={trackingOrder.destination_longitude}
            pickupAddress={trackingOrder.pickup_address}
            dropoffAddress={trackingOrder.destination_address}
            onClose={() => setShowTrackingMap(false)}
          />
        )}
      </AnimatePresence>

      {/* Map Overlay Layers */}
      <AllVenuesLayer map={map.current} visible={showAllVenues && (isDashboardPresentation || activeTab === 'explore')} />
      <FriendsOnMapLayer map={map.current} visible={showFriends && (isDashboardPresentation || activeTab === 'explore')} />
      <FollowedVenuesLayer
        map={map.current}
        visible={showFollowedVenues && (isDashboardPresentation || activeTab === 'explore')}
        onVenueClick={(venueId) => navigate(`/app/venue/${venueId}`)}
      />
      <BoostedVenuesLayer map={map.current} visible={isDashboardPresentation || activeTab === 'explore'} />

      {/* Driver-Customer/Venue Chat */}
      {showChat && activeOrder && (
        <DriverCustomerChat
          orderId={activeOrder.id}
          orderType={'delivery_address' in activeOrder ? 'delivery' : 'ride'}
          isDriver={true}
          otherPartyName={chatTarget === 'customer' ? 'Customer' : 'Venue'}
          chatTarget={chatTarget}
          venueId={'venue_id' in activeOrder ? activeOrder.venue_id : undefined}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Accept Order Modal */}
      <AcceptOrderModal
        isOpen={showAcceptModal}
        onClose={() => {
          setShowAcceptModal(false);
          setPendingOrder(null);
        }}
        order={pendingOrder}
        orderType={pendingOrderType}
        onAccept={async (orderId: string) => {
          setAcceptingOrderId(orderId);
          let result;
          if (pendingOrderType === 'delivery') {
            result = await acceptDelivery(orderId);
          } else {
            result = await acceptRide(orderId);
          }
          setAcceptingOrderId(null);
          
          // If accepted successfully, close modal and add to ignored set to ensure it's removed
          if (result.success) {
            setIgnoredOrderIds(prev => new Set([...prev, orderId]));
            setShowAcceptModal(false);
            setPendingOrder(null);
          } else if (result.alreadyTaken) {
            // If order was already taken, remove from available list and close
            setIgnoredOrderIds(prev => new Set([...prev, orderId]));
            setShowAcceptModal(false);
            setPendingOrder(null);
          }
          
          return result;
        }}
      />
    </div>
  );
};

export default Maps;
