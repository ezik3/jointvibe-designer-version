import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Car, Bike, Package, MapPin, Clock, DollarSign, 
  Navigation, Phone, CheckCircle, XCircle, Play, Square,
  TrendingUp, Star, AlertCircle, Truck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverSystem } from "@/hooks/useDriverSystem";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface AvailableDelivery {
  id: string;
  order_id: string;
  venue_id: string;
  customer_id: string;
  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  delivery_fee: number;
  driver_earnings: number;
  platform_fee: number;
  special_instructions: string;
  status: string;
  created_at: string;
  venue?: {
    name: string;
  };
}

const DriverDashboard = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { 
    isDriver, 
    driverProfile, 
    activeShift, 
    loading,
    startShift, 
    endShift, 
    registerAsDriver,
    acceptDelivery,
    updateDeliveryStatus,
    updateLocation
  } = useDriverSystem();
  
  const [availableDeliveries, setAvailableDeliveries] = useState<AvailableDelivery[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<AvailableDelivery | null>(null);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayDeliveries, setTodayDeliveries] = useState(0);

  // Fetch available deliveries
  const fetchAvailableDeliveries = async () => {
    const { data, error } = await supabase
      .from('food_delivery_orders')
      .select('*')
      .eq('status', 'venue_confirmed')
      .is('driver_id', null)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch venue names separately
      const venueIds = [...new Set(data.map(d => d.venue_id))];
      const { data: venues } = await supabase
        .from('venues')
        .select('id, name')
        .in('id', venueIds);
      
      const venueMap = new Map(venues?.map(v => [v.id, v.name]) || []);
      
      const deliveriesWithVenues = data.map(d => ({
        ...d,
        venue: { name: venueMap.get(d.venue_id) || 'Restaurant' }
      }));
      
      setAvailableDeliveries(deliveriesWithVenues as AvailableDelivery[]);
    }
  };

  // Fetch driver's active delivery
  const fetchActiveDelivery = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('food_delivery_orders')
      .select('*')
      .eq('driver_id', user.id)
      .in('status', ['driver_assigned', 'picked_up', 'on_the_way'])
      .single();

    if (!error && data) {
      // Fetch venue name
      const { data: venue } = await supabase
        .from('venues')
        .select('name')
        .eq('id', data.venue_id)
        .single();
      
      setActiveDelivery({
        ...data,
        venue: { name: venue?.name || 'Restaurant' }
      } as AvailableDelivery);
    }
  };

  // Fetch today's stats
  const fetchTodayStats = async () => {
    if (!user) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('food_delivery_orders')
      .select('driver_earnings, status')
      .eq('driver_id', user.id)
      .gte('created_at', today.toISOString())
      .in('status', ['delivered', 'completed']);

    if (!error && data) {
      const earnings = data.reduce((sum, d) => sum + (Number(d.driver_earnings) || 0), 0);
      setTodayEarnings(earnings);
      setTodayDeliveries(data.length);
    }
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user || !activeShift) return;

    fetchAvailableDeliveries();
    fetchActiveDelivery();
    fetchTodayStats();

    // Subscribe to new deliveries
    const channel = supabase
      .channel(createRealtimeChannelTopic('driver-deliveries'))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'food_delivery_orders'
      }, (payload) => {
        console.log('Delivery update:', payload);
        fetchAvailableDeliveries();
        fetchActiveDelivery();
        fetchTodayStats();
        
        if (payload.eventType === 'INSERT' && payload.new.status === 'venue_confirmed') {
          toast.info('New delivery available!', {
            description: `$${Number(payload.new.driver_earnings).toFixed(2)} earnings`,
            duration: 10000
          });
        }
      })
      .subscribe();

    // Update location every 30 seconds when on shift
    const locationInterval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
          () => {}
        );
      }
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(locationInterval);
    };
  }, [user, activeShift]);

  const handleAcceptDelivery = async (delivery: AvailableDelivery) => {
    const result = await acceptDelivery(delivery.id);
    if (result.success) {
      setActiveDelivery(delivery);
      setAvailableDeliveries(prev => prev.filter(d => d.id !== delivery.id));
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!activeDelivery) return;
    
    const result = await updateDeliveryStatus(activeDelivery.id, newStatus);
    if (result.success) {
      if (newStatus === 'delivered') {
        setActiveDelivery(null);
        fetchTodayStats();
        toast.success('Delivery completed!', {
          description: `You earned $${Number(activeDelivery.driver_earnings).toFixed(2)}`
        });
      } else {
        setActiveDelivery(prev => prev ? { ...prev, status: newStatus } : null);
      }
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 10) / 10;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Registration screen for non-drivers
  if (!isDriver) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-md mx-auto pt-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Car className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Become a JV Driver</h1>
            <p className="text-muted-foreground">Deliver food and earn money on your schedule</p>
          </div>

          <Card className="bg-card border-border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-foreground font-medium">Keep 90% of delivery fees</p>
                <p className="text-muted-foreground text-sm">Only $0.10 platform fee per delivery</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-foreground font-medium">Flexible hours</p>
                <p className="text-muted-foreground text-sm">Work when you want</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-foreground font-medium">Real-time navigation</p>
                <p className="text-muted-foreground text-sm">Optimized routes for faster deliveries</p>
              </div>
            </div>

            <Button 
              className="w-full mt-6"
              onClick={() => registerAsDriver('LICENSE123', 'car', { make: 'Toyota', model: 'Camry', plate: 'ABC123' })}
            >
              Register as Driver
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">JV Driver</h1>
            <p className="text-muted-foreground text-sm">
              {activeShift ? 'On Shift' : 'Off Duty'}
            </p>
          </div>
          
          <Button
            onClick={() => activeShift ? endShift() : startShift('delivery')}
            variant={activeShift ? "destructive" : "default"}
          >
            {activeShift ? (
              <><Square className="w-4 h-4 mr-2" /> End Shift</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Start Shift</>
            )}
          </Button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Today's Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-card border-border p-4">
            <div className="flex items-center gap-2 text-primary mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">Today's Earnings</span>
            </div>
            <p className="text-2xl font-bold text-foreground">${todayEarnings.toFixed(2)}</p>
          </Card>
          <Card className="bg-card border-border p-4">
            <div className="flex items-center gap-2 text-primary mb-1">
              <Package className="w-4 h-4" />
              <span className="text-sm">Deliveries</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{todayDeliveries}</p>
          </Card>
        </div>

        {/* Active Delivery */}
        {activeDelivery && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="bg-card border-primary/30 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Truck className="w-5 h-5 text-primary" />
                  Active Delivery
                </h3>
                <Badge className="bg-primary text-primary-foreground">{activeDelivery.status.replace('_', ' ')}</Badge>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                    <MapPin className="w-3 h-3 text-green-400" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">PICKUP</p>
                    <p className="text-foreground text-sm">{activeDelivery.pickup_address}</p>
                    <p className="text-primary text-sm font-medium">{activeDelivery.venue?.name}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
                    <MapPin className="w-3 h-3 text-red-400" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">DELIVERY</p>
                    <p className="text-foreground text-sm">{activeDelivery.delivery_address}</p>
                  </div>
                </div>

                {activeDelivery.special_instructions && (
                  <div className="bg-muted rounded-lg p-3">
                    <p className="text-muted-foreground text-xs mb-1">NOTES</p>
                    <p className="text-foreground text-sm">{activeDelivery.special_instructions}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
                <span className="text-muted-foreground">Your Earnings</span>
                <span className="text-2xl font-bold text-green-400">
                  ${Number(activeDelivery.driver_earnings).toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {activeDelivery.status === 'driver_assigned' && (
                  <Button 
                    onClick={() => handleUpdateStatus('picked_up')}
                  >
                    <Package className="w-4 h-4 mr-2" /> Picked Up
                  </Button>
                )}
                {activeDelivery.status === 'picked_up' && (
                  <Button 
                    onClick={() => handleUpdateStatus('on_the_way')}
                  >
                    <Navigation className="w-4 h-4 mr-2" /> On The Way
                  </Button>
                )}
                {(activeDelivery.status === 'on_the_way' || activeDelivery.status === 'picked_up') && (
                  <Button 
                    onClick={() => handleUpdateStatus('delivered')}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Delivered
                  </Button>
                )}
                <Button variant="outline">
                  <Phone className="w-4 h-4 mr-2" /> Call Customer
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Available Deliveries */}
        {activeShift && !activeDelivery && (
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Available Deliveries
              {availableDeliveries.length > 0 && (
                <Badge className="bg-primary">{availableDeliveries.length}</Badge>
              )}
            </h3>

            {availableDeliveries.length === 0 ? (
              <Card className="bg-card border-border p-8 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No deliveries available</p>
                <p className="text-muted-foreground text-sm">New orders will appear here</p>
              </Card>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {availableDeliveries.map((delivery) => (
                    <motion.div
                      key={delivery.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                    >
                      <Card className="bg-card border-border p-4 hover:bg-muted transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-foreground font-semibold">{delivery.venue?.name || 'Restaurant'}</p>
                            <p className="text-muted-foreground text-sm flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(delivery.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-green-400">
                              ${Number(delivery.driver_earnings).toFixed(2)}
                            </p>
                            <p className="text-muted-foreground text-xs">Your Earnings</p>
                          </div>
                        </div>

                        <div className="space-y-2 mb-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                            <span className="truncate">{delivery.pickup_address}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="truncate">{delivery.delivery_address}</span>
                          </div>
                        </div>

                        {delivery.pickup_latitude && delivery.delivery_latitude && (
                          <p className="text-muted-foreground text-xs mb-3">
                            {calculateDistance(
                              delivery.pickup_latitude, 
                              delivery.pickup_longitude, 
                              delivery.delivery_latitude, 
                              delivery.delivery_longitude
                            )} km delivery distance
                          </p>
                        )}

                        <div className="flex gap-2">
                          <Button 
                            className="flex-1"
                            onClick={() => handleAcceptDelivery(delivery)}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" /> Accept
                          </Button>
                          <Button variant="outline">
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* Off Duty Message */}
        {!activeShift && (
          <Card className="bg-card border-border p-8 text-center">
            <Car className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">You're Off Duty</h3>
            <p className="text-muted-foreground mb-4">Start your shift to see available deliveries</p>
            <Button 
              onClick={() => startShift('delivery')}
            >
              <Play className="w-4 h-4 mr-2" /> Start Shift
            </Button>
          </Card>
        )}

        {/* Driver Stats */}
        {driverProfile && (
          <Card className="bg-card border-border p-4">
            <h3 className="text-foreground font-semibold mb-3">Your Stats</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{driverProfile.total_deliveries}</p>
                <p className="text-muted-foreground text-xs">Total Deliveries</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 text-yellow-400" />
                  {Number(driverProfile.average_rating).toFixed(1)}
                </p>
                <p className="text-muted-foreground text-xs">Rating</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{driverProfile.total_rides}</p>
                <p className="text-muted-foreground text-xs">Total Rides</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
