import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  Navigation, MapPin, Clock, 
  ChevronUp, ChevronDown, Volume2, VolumeX,
  RotateCcw, MessageSquare, Package, CheckCircle2, Maximize2, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useTranslation } from 'react-i18next';

interface NavigationStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
  };
}

interface DriverNavigationProps {
  pickupCoords: { lat: number; lng: number } | null;
  dropoffCoords: { lat: number; lng: number } | null;
  pickupAddress: string;
  dropoffAddress: string;
  currentLocation: { lat: number; lng: number } | null;
  isPickedUp: boolean;
  onStartNavigation?: () => void;
  onArrived?: () => void;
  onPickedUp?: () => void;
  onDelivered?: () => void;
  onEndNavigation?: () => void;
  onOpenChat?: (target: 'customer' | 'venue') => void;
  mapboxToken: string;
}

const DriverNavigation = ({
  pickupCoords,
  dropoffCoords,
  pickupAddress,
  dropoffAddress,
  currentLocation,
  isPickedUp,
  onStartNavigation,
  onArrived,
  onPickedUp,
  onDelivered,
  onEndNavigation,
  onOpenChat,
  mapboxToken,
}: DriverNavigationProps) => {
  const { t } = useTranslation('common');
  const [steps, setSteps] = useState<NavigationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingDuration, setRemainingDuration] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [arrivedAtPickup, setArrivedAtPickup] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const lastSpokenStep = useRef(-1);
  
  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  
  // Wake lock for keeping screen on during navigation
  const { isSupported: wakeLockSupported, isActive: wakeLockActive, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  // Get the destination based on pickup status
  const destination = isPickedUp ? dropoffCoords : pickupCoords;
  const destinationAddress = isPickedUp ? dropoffAddress : pickupAddress;
  const destinationLabel = isPickedUp ? 'Drop-off' : 'Pickup';

  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const mapLoadedRef = useRef(false);

  // Initialize fullscreen map
  useEffect(() => {
    if (!isFullscreen || !mapContainerRef.current) return;
    if (!mapboxToken || mapboxToken === 'pk.your_token_here') return;

    // If map already exists, just show it
    if (mapRef.current) {
      mapRef.current.resize();
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: currentLocation ? [currentLocation.lng, currentLocation.lat] : [153.0251, -27.4698],
      zoom: 15,
      pitch: 60,
      bearing: 0,
    });

    mapRef.current.on('load', () => {
      if (!mapRef.current) return;
      mapLoadedRef.current = true;

      // Add route source
      mapRef.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });

      // Add route outline (glow effect)
      mapRef.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00FFFF',
          'line-width': 16,
          'line-opacity': 0.3,
          'line-blur': 3
        }
      });

      // Add route outline
      mapRef.current.addLayer({
        id: 'route-outline',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#8B5CF6',
          'line-width': 10,
          'line-opacity': 0.6
        }
      });

      // Add main route layer
      mapRef.current.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00FFFF',
          'line-width': 5,
          'line-opacity': 1
        }
      });

      // Add driver marker
      if (currentLocation) {
        const el = document.createElement('div');
        el.className = 'driver-marker';
        el.innerHTML = `
          <div style="
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #00FFFF, #8B5CF6);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 20px rgba(0,255,255,0.6);
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <path d="M12 2L19 21L12 17L5 21L12 2Z"/>
            </svg>
          </div>
        `;
        
        driverMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([currentLocation.lng, currentLocation.lat])
          .addTo(mapRef.current);
      }

      // Add destination marker
      if (destination) {
        destinationMarkerRef.current = new mapboxgl.Marker({ color: isPickedUp ? '#EF4444' : '#22C55E' })
          .setLngLat([destination.lng, destination.lat])
          .addTo(mapRef.current);
      }

      // Update route if we have coordinates
      if (routeCoordinates.length > 0) {
        updateRouteOnMap(routeCoordinates);
      }
    });

    return () => {
      // Don't remove the map when going to minimized, only on unmount
    };
  }, [isFullscreen, mapboxToken]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        driverMarkerRef.current = null;
        destinationMarkerRef.current = null;
        mapLoadedRef.current = false;
      }
    };
  }, []);

  // Function to update route on map
  const updateRouteOnMap = useCallback((coords: [number, number][]) => {
    if (!mapRef.current || !mapLoadedRef.current || coords.length === 0) return;

    const source = mapRef.current.getSource('route') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords
        }
      });

      // Fit map to show the route
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach(coord => bounds.extend(coord as [number, number]));
      if (currentLocation) {
        bounds.extend([currentLocation.lng, currentLocation.lat]);
      }
      mapRef.current.fitBounds(bounds, { 
        padding: { top: 150, bottom: 200, left: 50, right: 50 },
        pitch: 60,
        duration: 1000
      });
    }
  }, [currentLocation]);

  // Update map when route changes
  useEffect(() => {
    if (routeCoordinates.length > 0) {
      updateRouteOnMap(routeCoordinates);
    }
  }, [routeCoordinates, updateRouteOnMap]);

  // Update destination marker when pickup status changes
  useEffect(() => {
    if (!mapRef.current || !mapLoadedRef.current || !destination) return;

    // Remove old destination marker
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
    }

    // Add new destination marker
    destinationMarkerRef.current = new mapboxgl.Marker({ color: isPickedUp ? '#EF4444' : '#22C55E' })
      .setLngLat([destination.lng, destination.lat])
      .addTo(mapRef.current);
  }, [isPickedUp, destination]);

  // Update driver marker position
  useEffect(() => {
    if (!mapRef.current || !currentLocation || !driverMarkerRef.current) return;

    driverMarkerRef.current.setLngLat([currentLocation.lng, currentLocation.lat]);
    
    // Center map on driver
    mapRef.current.easeTo({
      center: [currentLocation.lng, currentLocation.lat],
      duration: 1000
    });
  }, [currentLocation]);

  // Fetch directions from Mapbox
  const fetchDirections = useCallback(async () => {
    if (!currentLocation || !destination || !mapboxToken) return;

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation.lng},${currentLocation.lat};${destination.lng},${destination.lat}?steps=true&voice_instructions=true&banner_instructions=true&geometries=geojson&overview=full&access_token=${mapboxToken}`
      );
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        const legs = route.legs[0];
        
        setTotalDistance(route.distance);
        setTotalDuration(route.duration);
        setRemainingDistance(route.distance);
        setRemainingDuration(route.duration);
        setRouteCoordinates(route.geometry.coordinates);

        const navigationSteps: NavigationStep[] = legs.steps.map((step: any) => ({
          instruction: step.maneuver.instruction,
          distance: step.distance,
          duration: step.duration,
          maneuver: {
            type: step.maneuver.type,
            modifier: step.maneuver.modifier,
          },
        }));

        setSteps(navigationSteps);
      }
    } catch (error) {
      console.error('Error fetching directions:', error);
    }
  }, [currentLocation, destination, mapboxToken]);

  // Start navigation
  const startNavigation = async () => {
    setIsNavigating(true);
    setIsFullscreen(true);
    setCurrentStepIndex(0);
    lastSpokenStep.current = -1;
    fetchDirections();
    onStartNavigation?.();
    
    // Request wake lock to keep screen on
    if (wakeLockSupported) {
      await requestWakeLock();
    }
  };

  // End navigation
  const endNavigation = async () => {
    setIsNavigating(false);
    setIsFullscreen(false);
    setArrivedAtPickup(false);
    onEndNavigation?.();
    
    // Release wake lock
    await releaseWakeLock();
  };

  // Recalculate route
  const recalculateRoute = () => {
    fetchDirections();
  };

  // Handle pickup confirmation
  const handleConfirmPickup = () => {
    setArrivedAtPickup(false);
    onPickedUp?.();
    // Refetch directions for dropoff
    setTimeout(fetchDirections, 500);
  };

  // Handle delivery confirmation
  const handleConfirmDelivery = () => {
    onDelivered?.();
    endNavigation();
  };

  // Update navigation as driver moves
  useEffect(() => {
    if (!isNavigating || !currentLocation || steps.length === 0) return;

    // Recalculate route periodically
    const interval = setInterval(fetchDirections, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isNavigating, currentLocation, fetchDirections, steps.length]);

  // Voice instructions
  useEffect(() => {
    if (!voiceEnabled || !isNavigating || steps.length === 0) return;
    if (currentStepIndex === lastSpokenStep.current) return;

    const currentStep = steps[currentStepIndex];
    if (currentStep && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(currentStep.instruction);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      speechSynthesis.speak(utterance);
      lastSpokenStep.current = currentStepIndex;
    }
  }, [currentStepIndex, voiceEnabled, isNavigating, steps]);

  // Check if arrived at destination
  useEffect(() => {
    if (!isNavigating || !currentLocation || !destination) return;

    const distanceToDestination = calculateDistance(
      currentLocation.lat, currentLocation.lng,
      destination.lat, destination.lng
    );

    // Within 50 meters of destination
    if (distanceToDestination < 0.05) {
      if (voiceEnabled && 'speechSynthesis' in window) {
        const message = isPickedUp 
          ? 'You have arrived at the drop-off location' 
          : 'You have arrived at the pickup location';
        const utterance = new SpeechSynthesisUtterance(message);
        speechSynthesis.speak(utterance);
      }
      
      if (!isPickedUp) {
        setArrivedAtPickup(true);
      }
      onArrived?.();
    }
  }, [currentLocation, destination, isNavigating, isPickedUp, voiceEnabled, onArrived]);

  // Helper: Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Get maneuver icon
  const getManeuverIcon = (maneuver: { type: string; modifier?: string }) => {
    const { type, modifier } = maneuver;
    
    if (type === 'arrive') return '🏁';
    if (type === 'depart') return '🚗';
    if (type === 'turn') {
      if (modifier === 'left') return '⬅️';
      if (modifier === 'right') return '➡️';
      if (modifier === 'slight left') return '↖️';
      if (modifier === 'slight right') return '↗️';
      if (modifier === 'sharp left') return '↩️';
      if (modifier === 'sharp right') return '↪️';
    }
    if (type === 'continue' || type === 'new name') return '⬆️';
    if (type === 'roundabout' || type === 'rotary') return '🔄';
    if (type === 'merge') return '↗️';
    if (type === 'fork') return modifier === 'left' ? '↖️' : '↗️';
    
    return '➡️';
  };

  // Format distance
  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  if (!destination) return null;

  // Fullscreen navigation overlay with actual map
  if (isFullscreen && isNavigating) {
    return (
      <motion.div
        className="fixed inset-0 z-50 bg-background"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Actual Mapbox Map */}
        <div 
          ref={mapContainerRef} 
          className="absolute inset-0"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Close/minimize button */}
        <button
          onClick={() => setIsFullscreen(false)}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-md bg-background flex items-center justify-center border border-border"
        >
          <ChevronDown className="w-5 h-5 text-foreground" />
        </button>

        {/* Top status bar */}
        <div className="absolute top-4 left-4 right-16 z-10">
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-md flex items-center justify-center ${
                  isPickedUp ? 'bg-red-500/20' : 'bg-green-500/20'
                }`}>
                  {isPickedUp ? (
                    <MapPin className="w-6 h-6 text-red-400" />
                  ) : (
                    <Package className="w-6 h-6 text-green-400" />
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{destinationLabel}</p>
                  <p className="text-foreground font-medium text-sm truncate max-w-[200px]">
                    {destinationAddress}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-cyan font-bold text-xl">{formatDistance(remainingDistance)}</p>
                <p className="text-muted-foreground text-sm">{formatDuration(remainingDuration)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Current instruction - large and prominent */}
        {steps.length > 0 && (
          <div className="absolute top-28 left-4 right-4 z-10">
            <motion.div 
              className="bg-card rounded-lg p-6 border border-primary/30"
              key={currentStepIndex}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <div className="flex items-center gap-6">
                <span className="text-5xl">
                  {getManeuverIcon(steps[currentStepIndex]?.maneuver || { type: 'continue' })}
                </span>
                <div className="flex-1">
                  <p className="text-foreground font-bold text-xl">
                    {steps[currentStepIndex]?.instruction || 'Follow the route'}
                  </p>
                  <p className="text-cyan text-lg mt-1">
                    {formatDistance(steps[currentStepIndex]?.distance || 0)}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-background border-t border-border">
          {/* Show pickup button when driver is navigating to pickup (not yet picked up) */}
          {/* Available only when arrivedAtPickup (within ~50m) */}
          {!isPickedUp && arrivedAtPickup && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mb-4"
            >
              <Button
                onClick={handleConfirmPickup}
                className="w-full h-14 font-bold text-lg"
              >
                <CheckCircle2 className="w-6 h-6 mr-2" />
                Received Order
              </Button>
            </motion.div>
          )}

          {/* Arrived at dropoff - show deliver button */}
          {/* Available when remaining distance < 200m for flexibility */}
          {isPickedUp && remainingDistance < 200 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mb-4"
            >
              <Button
                onClick={handleConfirmDelivery}
                className="w-full h-14 font-bold text-lg"
              >
                <CheckCircle2 className="w-6 h-6 mr-2" />
                Confirm Delivery
              </Button>
            </motion.div>
          )}

          {/* Control buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              variant="outline"
              size="lg"
              className={`h-14 px-6 ${voiceEnabled ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
            >
              {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>
            <Button
              onClick={recalculateRoute}
              variant="outline"
              size="lg"
              className="h-14 px-6 text-muted-foreground"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
            <div className="relative">
              <Button
                onClick={() => setShowChatOptions(!showChatOptions)}
                variant="outline"
                size="lg"
                className="h-14 px-6 text-primary"
              >
                <MessageSquare className="w-5 h-5" />
              </Button>
              {showChatOptions && (
                <div className="absolute bottom-full mb-2 right-0 bg-card rounded-md border border-border overflow-hidden shadow-lg min-w-[160px]">
                  <button
                    onClick={() => { onOpenChat?.('customer'); setShowChatOptions(false); }}
                    className="w-full px-4 py-3 text-left text-foreground hover:bg-muted flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    Message Customer
                  </button>
                  <button
                    onClick={() => { onOpenChat?.('venue'); setShowChatOptions(false); }}
                    className="w-full px-4 py-3 text-left text-foreground hover:bg-muted flex items-center gap-2 border-t border-border"
                  >
                    <Package className="w-4 h-4" />
                    Message Venue
                  </button>
                </div>
              )}
            </div>
            <Button
              onClick={endNavigation}
              variant="outline"
              size="lg"
              className="flex-1 h-14 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              End Navigation
            </Button>
          </div>

          {/* Wake lock indicator */}
          {wakeLockSupported && (
            <p className="text-center text-muted-foreground text-xs mt-3">
              {wakeLockActive ? '🔓 Screen will stay on' : '🔒 Screen may turn off'}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // Collapsed panel (when not fullscreen)
  return (
    <motion.div
      className="fixed bottom-20 left-4 right-4 z-30"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
    >
      <div className="bg-card rounded-lg border border-border overflow-hidden shadow-lg">
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${
              isPickedUp ? 'bg-red-500/20' : 'bg-green-500/20'
            }`}>
              <MapPin className={`w-5 h-5 ${isPickedUp ? 'text-red-400' : 'text-green-400'}`} />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{destinationLabel}</p>
              <p className="text-foreground font-medium text-sm truncate max-w-[200px]">
                {destinationAddress}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isNavigating && (
              <div className="text-right mr-2">
                <p className="text-cyan font-bold">{formatDistance(remainingDistance)}</p>
                <p className="text-muted-foreground text-xs">{formatDuration(remainingDuration)}</p>
              </div>
            )}
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                {/* Current Step */}
                {isNavigating && steps.length > 0 && (
                  <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">
                        {getManeuverIcon(steps[currentStepIndex]?.maneuver || { type: 'continue' })}
                      </span>
                      <div className="flex-1">
                        <p className="text-foreground font-medium">
                          {steps[currentStepIndex]?.instruction || 'Follow the route'}
                        </p>
                        <p className="text-cyan text-sm">
                          {formatDistance(steps[currentStepIndex]?.distance || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upcoming Steps */}
                {isNavigating && steps.length > 1 && (
                  <div className="bg-muted rounded-md p-3 max-h-32 overflow-y-auto">
                    <p className="text-muted-foreground text-xs mb-2">Upcoming</p>
                    <div className="space-y-2">
                      {steps.slice(currentStepIndex + 1, currentStepIndex + 4).map((step, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-sm">
                          <span className="text-lg">{getManeuverIcon(step.maneuver)}</span>
                          <span className="text-foreground flex-1 truncate">{step.instruction}</span>
                          <span className="text-muted-foreground text-xs">{formatDistance(step.distance)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div className="flex items-center gap-2">
                  {!isNavigating ? (
                    <Button
                      onClick={startNavigation}
                      className="flex-1"
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      Start Navigation
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() => setVoiceEnabled(!voiceEnabled)}
                        variant="outline"
                        size="icon"
                        className={voiceEnabled ? 'text-primary bg-primary/10' : 'text-muted-foreground'}
                      >
                        {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </Button>
                      <Button
                        onClick={recalculateRoute}
                        variant="outline"
                        size="icon"
                        className="text-muted-foreground"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <div className="relative">
                        <Button
                          onClick={() => setShowChatOptions(!showChatOptions)}
                          variant="outline"
                          size="icon"
                          className="text-primary"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        {showChatOptions && (
                          <div className="absolute bottom-full mb-2 right-0 bg-card rounded-md border border-border overflow-hidden shadow-lg min-w-[150px]">
                            <button
                              onClick={() => { onOpenChat?.('customer'); setShowChatOptions(false); }}
                              className="w-full px-3 py-2 text-left text-foreground hover:bg-muted flex items-center gap-2 text-sm"
                            >
                              <User className="w-3 h-3" />
                              Customer
                            </button>
                            <button
                              onClick={() => { onOpenChat?.('venue'); setShowChatOptions(false); }}
                              className="w-full px-3 py-2 text-left text-foreground hover:bg-muted flex items-center gap-2 border-t border-border text-sm"
                            >
                              <Package className="w-3 h-3" />
                              Venue
                            </button>
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => setIsFullscreen(true)}
                        variant="outline"
                        className="flex-1 border-cyan/30 text-cyan hover:bg-cyan/10"
                      >
                        <Maximize2 className="w-4 h-4 mr-2" />
                        Full Screen
                      </Button>
                      <Button
                        onClick={endNavigation}
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        End
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default DriverNavigation;
