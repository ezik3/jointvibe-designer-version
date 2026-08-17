import { useEffect, useState, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { Car, Package, Clock, MapPin, Navigation, Phone, MessageCircle, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface OrderTrackingMapProps {
  orderId: string;
  orderType: 'delivery' | 'ride';
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress: string;
  dropoffAddress: string;
  driverId?: string | null;
  onClose: () => void;
  onOpenChat?: () => void;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || 'pk.your_token_here';

const OrderTrackingMap = ({
  orderId,
  orderType,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  pickupAddress,
  dropoffAddress,
  driverId,
  onClose,
  onOpenChat
}: OrderTrackingMapProps) => {
  const { t } = useTranslation('common');
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const driverMarker = useRef<mapboxgl.Marker | null>(null);
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const mapLoadedRef = useRef(false);
  
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<{ minutes: number; distance: string } | null>(null);
  const [driverInfo, setDriverInfo] = useState<{
    name: string;
    rating: number;
    vehicleType: string;
    vehiclePlate: string;
    avatar?: string;
  } | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [currentPhase, setCurrentPhase] = useState<'to_venue' | 'to_customer'>('to_venue');

  // Calculate ETA using Mapbox directions and draw route
  const calculateETAAndDrawRoute = useCallback(async (
    driverLat: number, 
    driverLng: number, 
    destLat: number, 
    destLng: number,
    routeId: string,
    routeColor: string
  ) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${driverLng},${driverLat};${destLng},${destLat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();
      
      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        const durationMinutes = Math.round(route.duration / 60);
        const distanceKm = (route.distance / 1000).toFixed(1);
        
        setEta({ minutes: durationMinutes, distance: `${distanceKm} km` });

        // Update route on map
        if (map.current && mapLoadedRef.current) {
          const source = map.current.getSource(routeId) as mapboxgl.GeoJSONSource;
          if (source) {
            source.setData({
              type: 'Feature',
              properties: {},
              geometry: route.geometry
            });
          }
        }
      }
    } catch (error) {
      console.error('Error calculating ETA:', error);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: [(pickupLng + dropoffLng) / 2, (pickupLat + dropoffLat) / 2],
      zoom: 12,
      pitch: 45,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      mapLoadedRef.current = true;

      // Add driver-to-destination route source (live route)
      map.current.addSource('driver-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        }
      });

      // Add glow effect for driver route
      map.current.addLayer({
        id: 'driver-route-glow',
        type: 'line',
        source: 'driver-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00FFFF',
          'line-width': 12,
          'line-opacity': 0.3,
          'line-blur': 3
        }
      });

      // Driver route layer
      map.current.addLayer({
        id: 'driver-route',
        type: 'line',
        source: 'driver-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00FFFF',
          'line-width': 5,
          'line-opacity': 1
        }
      });

      // Add pickup-to-dropoff route source (static route)
      map.current.addSource('delivery-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] }
        }
      });

      // Delivery route layer (dashed)
      map.current.addLayer({
        id: 'delivery-route',
        type: 'line',
        source: 'delivery-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#F97316',
          'line-width': 4,
          'line-opacity': 0.6,
          'line-dasharray': [2, 2]
        }
      });

      // Add pickup marker
      pickupMarkerRef.current = new mapboxgl.Marker({ color: '#10B981' })
        .setLngLat([pickupLng, pickupLat])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>🏪 Venue</strong><br/>${pickupAddress}`))
        .addTo(map.current);

      // Add dropoff marker
      dropoffMarkerRef.current = new mapboxgl.Marker({ color: '#EF4444' })
        .setLngLat([dropoffLng, dropoffLat])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>📍 Your Location</strong><br/>${dropoffAddress}`))
        .addTo(map.current);

      // Fetch and display static delivery route (venue to customer)
      fetchStaticRoute();

      // Fit bounds to show all points
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([pickupLng, pickupLat]);
      bounds.extend([dropoffLng, dropoffLat]);
      map.current.fitBounds(bounds, { padding: 100 });
    });

    return () => {
      map.current?.remove();
      map.current = null;
      mapLoadedRef.current = false;
    };
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, pickupAddress, dropoffAddress]);

  // Fetch static route (venue to customer)
  const fetchStaticRoute = async () => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();

      if (data.routes && data.routes[0] && map.current && mapLoadedRef.current) {
        const source = map.current.getSource('delivery-route') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'Feature',
            properties: {},
            geometry: data.routes[0].geometry
          });
        }
      }
    } catch (error) {
      console.error('Error fetching static route:', error);
    }
  };

  // Subscribe to order updates and driver location
  useEffect(() => {
    const table = orderType === 'delivery' ? 'food_delivery_orders' : 'ride_bookings';
    
    // Fetch initial order data
    const fetchOrderData = async () => {
      const { data: order } = await supabase
        .from(table)
        .select('*, driver_id')
        .eq('id', orderId)
        .single();

      if (order) {
        setStatus(order.status);
        
        // Determine phase based on status
        if (['picked_up', 'in_transit', 'on_the_way'].includes(order.status)) {
          setCurrentPhase('to_customer');
        } else {
          setCurrentPhase('to_venue');
        }
        
        const currentDriverId = driverId || order.driver_id;
        if (currentDriverId) {
          // Fetch driver info
          const { data: driverProfile } = await supabase
            .from('driver_profiles')
            .select('*')
            .eq('user_id', currentDriverId)
            .single();

          if (driverProfile) {
            // Also fetch profile for name
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, avatar_url')
              .eq('user_id', currentDriverId)
              .single();

            setDriverInfo({
              name: profile?.full_name || 'Your Driver',
              rating: driverProfile.average_rating || 5.0,
              vehicleType: driverProfile.vehicle_type || 'Car',
              vehiclePlate: driverProfile.vehicle_plate || '',
              avatar: profile?.avatar_url || undefined
            });

            // Set initial driver location
            if (driverProfile.current_latitude && driverProfile.current_longitude) {
              const loc = {
                lat: Number(driverProfile.current_latitude),
                lng: Number(driverProfile.current_longitude)
              };
              setDriverLocation(loc);
              
              // Calculate initial ETA
              const destLat = currentPhase === 'to_customer' ? dropoffLat : pickupLat;
              const destLng = currentPhase === 'to_customer' ? dropoffLng : pickupLng;
              calculateETAAndDrawRoute(loc.lat, loc.lng, destLat, destLng, 'driver-route', '#00FFFF');
            }
          }
        }
      }
    };

    fetchOrderData();

    // Subscribe to order status changes
    const orderChannel = supabase
      .channel(createRealtimeChannelTopic(`customer-order-tracking-${orderId}`))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: table,
        filter: `id=eq.${orderId}`
      }, (payload) => {
        const newStatus = payload.new.status;
        setStatus(newStatus);
        
        // Update phase based on status
        if (['picked_up', 'in_transit', 'on_the_way'].includes(newStatus)) {
          setCurrentPhase('to_customer');
        }
        
        if (payload.new.driver_id && !driverInfo) {
          fetchOrderData();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(orderChannel);
    };
  }, [orderId, orderType, driverId, driverInfo, pickupLat, pickupLng, dropoffLat, dropoffLng, calculateETAAndDrawRoute, currentPhase]);

  // Subscribe to driver location updates
  useEffect(() => {
    const currentDriverId = driverId;
    if (!currentDriverId) return;

    const driverLocationChannel = supabase
      .channel(createRealtimeChannelTopic(`customer-driver-location-${currentDriverId}`))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'driver_profiles',
        filter: `user_id=eq.${currentDriverId}`
      }, (payload) => {
        if (payload.new.current_latitude && payload.new.current_longitude) {
          const newLocation = {
            lat: Number(payload.new.current_latitude),
            lng: Number(payload.new.current_longitude)
          };
          setDriverLocation(newLocation);
          
          // Calculate ETA and update route to appropriate destination
          const destLat = currentPhase === 'to_customer' ? dropoffLat : pickupLat;
          const destLng = currentPhase === 'to_customer' ? dropoffLng : pickupLng;
          calculateETAAndDrawRoute(newLocation.lat, newLocation.lng, destLat, destLng, 'driver-route', '#00FFFF');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(driverLocationChannel);
    };
  }, [driverId, currentPhase, pickupLat, pickupLng, dropoffLat, dropoffLng, calculateETAAndDrawRoute]);

  // Update driver marker on map when location changes
  useEffect(() => {
    if (!map.current || !mapLoadedRef.current || !driverLocation) return;

    if (driverMarker.current) {
      driverMarker.current.setLngLat([driverLocation.lng, driverLocation.lat]);
    } else {
      // Create custom driver marker element
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position: relative;">
          <div style="
            width: 48px;
            height: 48px;
            background: #16d9e8;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 0 4px rgba(22,217,232,0.16);
            animation: pulse 2s infinite;
          ">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/>
              <path d="M9 17h6"/>
              <circle cx="17" cy="17" r="2"/>
            </svg>
          </div>
          <div style="
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 10px solid #00FFFF;
          "></div>
        </div>
      `;

      driverMarker.current = new mapboxgl.Marker({ element: el })
        .setLngLat([driverLocation.lng, driverLocation.lat])
        .addTo(map.current);
    }

    // Fit bounds to include driver
    if (map.current) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([driverLocation.lng, driverLocation.lat]);
      if (currentPhase === 'to_venue') {
        bounds.extend([pickupLng, pickupLat]);
      } else {
        bounds.extend([dropoffLng, dropoffLat]);
      }
      map.current.fitBounds(bounds, { padding: 100, maxZoom: 15 });
    }
  }, [driverLocation, currentPhase, pickupLng, pickupLat, dropoffLng, dropoffLat]);

  const getStatusText = () => {
    switch (status) {
      case 'pending': return 'Finding a driver...';
      case 'venue_confirmed': return 'Venue confirmed, waiting for driver...';
      case 'preparing': return 'Order being prepared...';
      case 'ready_for_pickup': return 'Ready! Waiting for driver...';
      case 'driver_assigned': return 'Driver heading to venue';
      case 'picked_up': 
      case 'in_transit':
      case 'on_the_way': return 'Driver on the way to you!';
      case 'arrived': return 'Driver has arrived!';
      case 'delivered':
      case 'completed': return 'Order delivered!';
      default: return status;
    }
  };

  const getPhaseLabel = () => {
    if (currentPhase === 'to_venue') {
      return 'Driver → Venue';
    }
    return 'Driver → You';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Map */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Close Button */}
      <Button
        onClick={onClose}
        variant="ghost"
        className="customer-modal-secondary absolute top-4 right-4 z-10 w-10 h-10 p-0"
      >
        <X className="w-5 h-5" />
      </Button>

      {/* Top Status Bar */}
      <div className="absolute top-4 left-4 right-16 z-10">
        <div className="customer-modal-panel p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full animate-pulse ${
                status === 'pending' || status === 'preparing' ? 'bg-yellow-400' : 
                ['picked_up', 'on_the_way', 'in_transit'].includes(status) ? 'bg-green-400' : 'bg-cyan'
              }`} />
              <div>
                <p className="text-white font-medium">{getStatusText()}</p>
                <p className="text-white/50 text-xs">{getPhaseLabel()}</p>
              </div>
            </div>
            {eta && (
              <div className="text-right">
                <p className="text-cyan font-bold text-lg">{eta.minutes} min</p>
                <p className="text-white/50 text-xs">{eta.distance}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--customer-modal-line)] bg-[rgba(8,11,14,0.94)] p-4 space-y-3">
        {/* Driver Info */}
        {driverInfo && (
          <div className="customer-modal-panel p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] flex items-center justify-center overflow-hidden">
                  {driverInfo.avatar ? (
                    <img src={driverInfo.avatar} alt={driverInfo.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <h4 className="text-white font-bold">{driverInfo.name}</h4>
                  <p className="text-white/60 text-sm">
                    {driverInfo.vehicleType} • {driverInfo.vehiclePlate}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-lg">
                ⭐ {driverInfo.rating.toFixed(1)}
              </div>
            </div>

            {/* Contact Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button
                variant="outline"
                className="customer-modal-secondary"
              >
                <Phone className="w-4 h-4 mr-2" />
                Call
              </Button>
              <Button
                onClick={onOpenChat}
                className="customer-modal-primary"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Message
              </Button>
            </div>
          </div>
        )}

        {/* No driver yet */}
        {!driverInfo && (
          <div className="customer-modal-panel p-4 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-3">
              <Car className="w-6 h-6 text-yellow-400 animate-pulse" />
            </div>
            <p className="text-white font-medium">Looking for a driver...</p>
            <p className="text-white/50 text-sm">You'll see their location once assigned</p>
          </div>
        )}

        {/* Route Legend */}
        <div className="customer-modal-panel p-3 flex items-center justify-around text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-cyan rounded-full" />
            <span className="text-white/70">Driver Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-orange-500 rounded-full border-dashed" style={{ borderTop: '2px dashed #F97316' }} />
            <span className="text-white/70">Delivery Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <span className="text-white/70">Venue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
            <span className="text-white/70">You</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OrderTrackingMap;
