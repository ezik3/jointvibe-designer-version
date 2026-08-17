import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { filterAndSortJobs, resolveDriverModes } from '@/utils/driverJobFilter';

// Constants for localStorage keys
const ACTIVE_SHIFT_KEY = 'jv-driver-active-shift';

interface DriverProfile {
  id: string;
  user_id: string;
  drivers_license_id?: string;
  license_verified: boolean;
  vehicle_type?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_modes?: string[];
  is_available: boolean;
  current_latitude?: number;
  current_longitude?: number;
  total_deliveries: number;
  total_rides: number;
  average_rating: number;
}

interface DeliveryOrder {
  id: string;
  customer_id: string;
  venue_id: string;
  source_type?: 'food_delivery' | 'runner_job';
  runner_job?: any;
  driver_id?: string;
  status: string;
  pickup_address?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  delivery_address: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_fee: number;
  driver_earnings?: number;
  platform_fee: number;
  estimated_delivery_time?: string;
  special_instructions?: string;
  created_at: string;
}

interface RideBooking {
  id: string;
  customer_id: string;
  driver_id?: string;
  status: string;
  pickup_address: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  destination_address: string;
  destination_latitude?: number;
  destination_longitude?: number;
  estimated_fare?: number;
  actual_fare?: number;
  platform_fee: number;
  distance_km?: number;
  estimated_duration_minutes?: number;
  created_at: string;
}

interface DriverShift {
  id: string;
  driver_id: string;
  shift_type: 'delivery' | 'ride' | 'both';
  started_at: string;
  ended_at?: string;
  status: string;
  deliveries_completed: number;
  rides_completed: number;
  earnings: number;
}

export const useDriverSystem = () => {
  const { user } = useAuth();
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [activeShift, setActiveShift] = useState<DriverShift | null>(() => {
    // Initialize from localStorage on first render
    const stored = localStorage.getItem(ACTIVE_SHIFT_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as DriverShift;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [availableDeliveries, setAvailableDeliveries] = useState<DeliveryOrder[]>([]);
  const [availableRides, setAvailableRides] = useState<RideBooking[]>([]);
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | RideBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDriver, setIsDriver] = useState(false);
  const hasVerifiedShift = useRef(false);

  const mapRunnerJobToDelivery = useCallback((r: any): DeliveryOrder => ({
    id: r.id,
    customer_id: r.customer_id,
    venue_id: 'runner',
    source_type: 'runner_job',
    runner_job: r,
    driver_id: r.runner_id ?? undefined,
    status: r.status,
    pickup_address: r.pickup_address ?? 'Runner errand',
    pickup_latitude: r.pickup_latitude,
    pickup_longitude: r.pickup_longitude,
    delivery_address: r.dropoff_address,
    delivery_latitude: r.dropoff_latitude,
    delivery_longitude: r.dropoff_longitude,
    delivery_fee:
      Number(r.runner_fee_usd ?? 0) +
      Number(r.distance_surcharge_usd ?? 0) +
      Number(r.tip_usd ?? 0),
    driver_earnings:
      Number(r.runner_fee_usd ?? 0) +
      Number(r.distance_surcharge_usd ?? 0) +
      Number(r.tip_usd ?? 0),
    platform_fee: 0,
    special_instructions: `[JV Runner] ${r.task_description}`,
    created_at: r.created_at,
  }), []);

  // Verify stored shift is still valid in database
  const verifyStoredShift = useCallback(async () => {
    if (!user || hasVerifiedShift.current) return;
    
    const storedShift = localStorage.getItem(ACTIVE_SHIFT_KEY);
    if (!storedShift) {
      setActiveShift(null);
      return;
    }

    hasVerifiedShift.current = true;

    try {
      const parsedShift = JSON.parse(storedShift);
      
      // Verify the shift is still active in the database
      const { data, error } = await supabase
        .from('driver_shifts')
        .select('*')
        .eq('id', parsedShift.id)
        .eq('driver_id', user.id)
        .eq('status', 'active')
        .single();

      if (data && !error) {
        setActiveShift(data as DriverShift);
        // Update driver availability
        await supabase
          .from('driver_profiles')
          .update({ is_available: true })
          .eq('user_id', user.id);
        setDriverProfile(prev => prev ? { ...prev, is_available: true } : null);
      } else {
        // Shift no longer active, clear localStorage and state
        localStorage.removeItem(ACTIVE_SHIFT_KEY);
        setActiveShift(null);
      }
    } catch (e) {
      localStorage.removeItem(ACTIVE_SHIFT_KEY);
      setActiveShift(null);
    }
  }, [user]);

  // Save shift to localStorage when it changes
  useEffect(() => {
    if (activeShift) {
      localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(activeShift));
    } else {
      localStorage.removeItem(ACTIVE_SHIFT_KEY);
    }
  }, [activeShift]);

  // Fetch available orders based on shift type, with tier+radius+escalation filtering
  const fetchAvailableOrders = useCallback(async () => {
    if (!activeShift || !driverProfile?.is_available) return;

    const shiftType = activeShift.shift_type;
    const driverModes = resolveDriverModes(driverProfile as any);
    const driverLat = driverProfile.current_latitude ?? null;
    const driverLng = driverProfile.current_longitude ?? null;

    // Fetch deliveries if applicable
    if (shiftType === 'delivery' || shiftType === 'both') {
      const { data } = await supabase
        .from('food_delivery_orders')
        .select('*')
        .eq('status', 'venue_confirmed')
        .is('driver_id', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        const filtered = filterAndSortJobs(
          data as any[],
          driverLat,
          driverLng,
          driverModes,
        ).map((f) => f.job as DeliveryOrder);
        setAvailableDeliveries(filtered.slice(0, 20));
      }
    }

    // Fetch rides if applicable
    if (shiftType === 'ride' || shiftType === 'both') {
      const { data } = await supabase
        .from('ride_bookings')
        .select('*')
        .eq('status', 'pending')
        .is('driver_id', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        // Rides are always car-tier (motorcycle gets them via 2-min escalation)
        const ridesWithTier = (data as any[]).map((r) => ({ ...r, forceTier: 'car' as const }));
        const filtered = filterAndSortJobs(
          ridesWithTier,
          driverLat,
          driverLng,
          driverModes,
        ).map((f) => {
          const { forceTier, ...rest } = f.job as any;
          return rest as RideBooking;
        });
        setAvailableRides(filtered.slice(0, 20));
      }
    }

    // Fetch runner jobs: classify by pickup → drop-off distance so long-distance
    // errands appear immediately to car/moto/bike drivers instead of waiting on
    // runner-tier escalation.
    const { data: runnerData } = await supabase
      .from('runner_jobs' as any)
      .select('*')
      .eq('status', 'pending')
      .is('runner_id', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (runnerData) {
      const normalized = (runnerData as any[]).map((r) => ({
        ...r,
        delivery_latitude: r.dropoff_latitude,
        delivery_longitude: r.dropoff_longitude,
      }));
      const asDeliveries = filterAndSortJobs(normalized, driverLat, driverLng, driverModes)
        .slice(0, 10)
        .map((f) => mapRunnerJobToDelivery(f.job as any));
      setAvailableDeliveries((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...asDeliveries.filter((d) => !ids.has(d.id))];
      });
    }
  }, [activeShift, driverProfile, mapRunnerJobToDelivery]);

  // Fetch driver profile
  const fetchDriverProfile = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('driver_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setDriverProfile(data as DriverProfile);
      setIsDriver(true);
      // Verify active shift after profile is loaded
      verifyStoredShift();
    }
    setLoading(false);
  }, [user, verifyStoredShift]);

  // Register as driver
  const registerAsDriver = async (
    licenseId: string | null,
    vehicleType: string,
    vehicleDetails?: { make?: string; model?: string; plate?: string },
    modes?: Array<'car' | 'motorcycle' | 'bicycle' | 'runner'>
  ) => {
    if (!user) return { success: false, error: 'Not logged in' };

    // Upsert by user_id so existing rows (e.g. from license/ID upload) get filled in
    const { data: existing } = await supabase
      .from('driver_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const payload: any = {
      user_id: user.id,
      drivers_license_id: licenseId,
      vehicle_type: vehicleType,
      vehicle_make: vehicleDetails?.make,
      vehicle_model: vehicleDetails?.model,
      vehicle_plate: vehicleDetails?.plate,
    };
    if (modes && modes.length > 0) payload.vehicle_modes = modes;

    const { data, error } = existing
      ? await supabase
          .from('driver_profiles')
          .update(payload)
          .eq('user_id', user.id)
          .select()
          .single()
      : await supabase
          .from('driver_profiles')
          .insert(payload)
          .select()
          .single();

    if (error) {
      toast.error('Failed to register as driver');
      return { success: false, error: error.message };
    }

    setDriverProfile(data as DriverProfile);
    setIsDriver(true);
    toast.success('Successfully registered as a JV Driver!');
    return { success: true, data };
  };

  // Start shift
  const startShift = async (shiftType: 'delivery' | 'ride' | 'both') => {
    if (!user || !driverProfile) return { success: false };

    // Update driver availability
    await supabase
      .from('driver_profiles')
      .update({ is_available: true })
      .eq('user_id', user.id);

    const { data, error } = await supabase
      .from('driver_shifts')
      .insert({
        driver_id: user.id,
        shift_type: shiftType,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to start shift');
      return { success: false };
    }

    setActiveShift(data as DriverShift);
    setDriverProfile(prev => prev ? { ...prev, is_available: true } : null);
    toast.success(`Shift started - ready for ${shiftType === 'both' ? 'deliveries & rides' : shiftType}!`);
    return { success: true };
  };

  // End shift
  const endShift = async () => {
    if (!user || !activeShift) return { success: false };

    // Update driver availability
    await supabase
      .from('driver_profiles')
      .update({ is_available: false })
      .eq('user_id', user.id);

    const { error } = await supabase
      .from('driver_shifts')
      .update({
        ended_at: new Date().toISOString(),
        status: 'ended',
      })
      .eq('id', activeShift.id);

    if (error) {
      toast.error('Failed to end shift');
      return { success: false };
    }

    const shiftSummary = { ...activeShift };
    setActiveShift(null);
    setDriverProfile(prev => prev ? { ...prev, is_available: false } : null);
    toast.success('Shift ended!');
    return { success: true, summary: shiftSummary };
  };

  // Update driver location
  const updateLocation = async (latitude: number, longitude: number) => {
    if (!user || !driverProfile) return;

    await supabase
      .from('driver_profiles')
      .update({
        current_latitude: latitude,
        current_longitude: longitude,
        last_location_update: new Date().toISOString(),
      })
      .eq('user_id', user.id);
  };

  // Accept delivery order with race condition handling
  const acceptDelivery = async (orderId: string) => {
    if (!user) return { success: false };

    const pendingDelivery = availableDeliveries.find((d) => d.id === orderId);
    const shouldCheckRunnerJob = !pendingDelivery || pendingDelivery.source_type === 'runner_job';
    if (shouldCheckRunnerJob) {
      const { data: runnerJob } = await supabase
        .from('runner_jobs' as any)
        .select('id')
        .eq('id', orderId)
        .maybeSingle();

      if (runnerJob || pendingDelivery?.source_type === 'runner_job') {
        const { data, error } = await supabase
        .from('runner_jobs' as any)
        .update({
          runner_id: user.id,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        } as any)
        .eq('id', orderId)
        .eq('status', 'pending')
        .is('runner_id', null)
        .select('*')
        .single();

        if (error || !data) {
          toast.error('Runner job already accepted by another driver');
          return { success: false, alreadyTaken: true };
        }

        const mapped = mapRunnerJobToDelivery(data);
        setActiveOrder(mapped);
        setAvailableDeliveries(prev => prev.filter(d => d.id !== orderId));
        toast.success('Runner job accepted!');
        return { success: true, order: mapped };
      }
    }

    // First check if order is still available (not already assigned)
    const { data: existingOrder, error: checkError } = await supabase
      .from('food_delivery_orders')
      .select('driver_id, status')
      .eq('id', orderId)
      .single();

    if (checkError) {
      toast.error('Order no longer available');
      return { success: false, alreadyTaken: true };
    }

    // If already assigned to another driver, reject
    if (existingOrder?.driver_id && existingOrder.driver_id !== user.id) {
      toast.error('Order already accepted by another driver');
      return { success: false, alreadyTaken: true };
    }

    // If status has progressed beyond available states
    if (!['pending', 'venue_confirmed', 'preparing', 'ready_for_pickup'].includes(existingOrder?.status || '')) {
      toast.error('Order is no longer available');
      return { success: false, alreadyTaken: true };
    }

    const { data, error } = await supabase
      .from('food_delivery_orders')
      .update({
        driver_id: user.id,
        status: 'driver_assigned',
      })
      .eq('id', orderId)
      .is('driver_id', null) // Only update if driver_id is still null (race protection)
      .select()
      .single();

    if (error || !data) {
      toast.error('Failed to accept delivery - may have been taken');
      return { success: false, alreadyTaken: true };
    }

    setActiveOrder(data as DeliveryOrder);
    // Remove from available list immediately
    setAvailableDeliveries(prev => prev.filter(d => d.id !== orderId));
    toast.success('Delivery accepted!');
    return { success: true, order: data };
  };

  // Accept ride with race condition handling
  const acceptRide = async (rideId: string) => {
    if (!user) return { success: false };

    // First check if ride is still available
    const { data: existingRide, error: checkError } = await supabase
      .from('ride_bookings')
      .select('driver_id, status')
      .eq('id', rideId)
      .single();

    if (checkError) {
      toast.error('Ride no longer available');
      return { success: false, alreadyTaken: true };
    }

    // If already assigned to another driver
    if (existingRide?.driver_id && existingRide.driver_id !== user.id) {
      toast.error('Ride already accepted by another driver');
      return { success: false, alreadyTaken: true };
    }

    // If status has progressed
    if (existingRide?.status !== 'pending') {
      toast.error('Ride is no longer available');
      return { success: false, alreadyTaken: true };
    }

    const { data, error } = await supabase
      .from('ride_bookings')
      .update({
        driver_id: user.id,
        status: 'driver_assigned',
      })
      .eq('id', rideId)
      .is('driver_id', null) // Only update if driver_id is still null
      .select()
      .single();

    if (error || !data) {
      toast.error('Failed to accept ride - may have been taken');
      return { success: false, alreadyTaken: true };
    }

    setActiveOrder(data as RideBooking);
    // Remove from available list immediately
    setAvailableRides(prev => prev.filter(r => r.id !== rideId));
    toast.success('Ride accepted!');
    return { success: true, ride: data };
  };

  const refreshActiveOrder = useCallback(async () => {
    const current = activeOrder as any;
    if (!current?.id || current.source_type !== 'runner_job') return;
    const { data } = await supabase
      .from('runner_jobs' as any)
      .select('*')
      .eq('id', current.id)
      .maybeSingle();
    if (data) setActiveOrder(mapRunnerJobToDelivery(data));
  }, [activeOrder, mapRunnerJobToDelivery]);

  // Update delivery status
  const updateDeliveryStatus = async (orderId: string, status: string) => {
    const { error } = await supabase
      .from('food_delivery_orders')
      .update({ status })
      .eq('id', orderId);

    if (error) {
      toast.error('Failed to update status');
      return { success: false };
    }

    if (status === 'delivered') {
      setActiveOrder(null);
      toast.success('Delivery completed!');
    }

    return { success: true };
  };

  // Update ride status
  const updateRideStatus = async (rideId: string, status: string) => {
    const { error } = await supabase
      .from('ride_bookings')
      .update({ status })
      .eq('id', rideId);

    if (error) {
      toast.error('Failed to update status');
      return { success: false };
    }

    if (status === 'completed') {
      setActiveOrder(null);
      toast.success('Ride completed!');
    }

    return { success: true };
  };

  // Book a ride (for customers)
  const bookRide = async (
    pickup: {
      address: string;
      latitude: number;
      longitude: number;
    }, 
    destination: {
      address: string;
      latitude: number;
      longitude: number;
    },
    fareEstimate?: {
      fare: number;
      distance: number;
      duration: number;
      driverEarnings: number;
      platformFee: number;
    }
  ) => {
    if (!user) return { success: false };

    // Use pre-calculated fare if provided, otherwise calculate basic estimate
    let estimatedFare: number;
    let distance: number;
    let duration: number;
    let driverEarnings: number;

    if (fareEstimate) {
      estimatedFare = fareEstimate.fare;
      distance = fareEstimate.distance;
      duration = fareEstimate.duration;
      driverEarnings = fareEstimate.driverEarnings;
    } else {
      // Fallback calculation
      distance = calculateDistance(
        pickup.latitude, pickup.longitude,
        destination.latitude, destination.longitude
      );
      estimatedFare = 3 + (distance * 1.5) + (Math.round(distance * 3) * 0.2);
      duration = Math.round(distance * 3);
      driverEarnings = estimatedFare - 0.10;
    }

    const { data, error } = await supabase
      .from('ride_bookings')
      .insert({
        customer_id: user.id,
        pickup_address: pickup.address,
        pickup_latitude: pickup.latitude,
        pickup_longitude: pickup.longitude,
        destination_address: destination.address,
        destination_latitude: destination.latitude,
        destination_longitude: destination.longitude,
        estimated_fare: estimatedFare,
        distance_km: distance,
        estimated_duration_minutes: duration,
        platform_fee: 0.10,
        driver_earnings: driverEarnings,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to book ride');
      return { success: false };
    }

    toast.success('Ride requested! Finding a driver...');
    return { success: true, booking: data };
  };

  // Helper: Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 10) / 10;
  };

  // Subscribe to real-time updates and fetch available orders
  useEffect(() => {
    if (!user) return;

    fetchDriverProfile();

    // Subscribe to available deliveries
    const deliveryChannel = supabase
      .channel(createRealtimeChannelTopic('available-deliveries'))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'food_delivery_orders',
        filter: 'status=eq.venue_confirmed'
      }, (payload) => {
        // Refresh available orders when changes occur
        fetchAvailableOrders();
      })
      .subscribe();

    // Subscribe to available runner jobs as well as normal deliveries so late
    // logins and immediate car/moto/bike-matched runner errands refresh the list.
    const runnerChannel = supabase
      .channel(createRealtimeChannelTopic('available-runner-jobs'))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'runner_jobs',
      }, () => {
        fetchAvailableOrders();
      })
      .subscribe();

    // Subscribe to available rides
    const rideChannel = supabase
      .channel(createRealtimeChannelTopic('available-rides'))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ride_bookings',
        filter: 'status=eq.pending'
      }, (payload) => {
        // Refresh available orders when changes occur
        fetchAvailableOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(runnerChannel);
      supabase.removeChannel(rideChannel);
    };
  }, [user, fetchDriverProfile, fetchAvailableOrders]);

  // Fetch available orders when shift becomes active
  useEffect(() => {
    if (activeShift && driverProfile?.is_available) {
      fetchAvailableOrders();
    }
  }, [activeShift, driverProfile?.is_available, fetchAvailableOrders]);

  // Re-tick every 30s so escalation thresholds (2/3/5 min) re-evaluate
  // without waiting for a realtime event.
  useEffect(() => {
    if (!activeShift || !driverProfile?.is_available) return;
    const interval = setInterval(() => {
      fetchAvailableOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeShift, driverProfile?.is_available, fetchAvailableOrders]);

  // Update which vehicle modes the driver has enabled (post-signup mode swap)
  const updateVehicleModes = async (
    modes: Array<'car' | 'motorcycle' | 'bicycle' | 'runner'>
  ) => {
    if (!user) return { success: false, error: 'Not logged in' };
    if (modes.length === 0) {
      toast.error('Keep at least one mode enabled');
      return { success: false, error: 'empty' };
    }
    const primary = modes[0];
    const { data, error } = await supabase
      .from('driver_profiles')
      .update({ vehicle_modes: modes, vehicle_type: primary } as any)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) {
      toast.error('Failed to update modes');
      return { success: false, error: error.message };
    }
    setDriverProfile(data as DriverProfile);
    return { success: true, data };
  };

  return {
    isDriver,
    driverProfile,
    activeShift,
    activeOrder,
    availableDeliveries,
    availableRides,
    loading,
    registerAsDriver,
    startShift,
    endShift,
    updateLocation,
    acceptDelivery,
    acceptRide,
    refreshActiveOrder,
    updateDeliveryStatus,
    updateRideStatus,
    bookRide,
    calculateDistance,
    fetchAvailableOrders,
    updateVehicleModes,
  };
};
