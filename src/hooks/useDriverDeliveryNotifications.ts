import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useDriverShiftSound } from './useDriverShiftSound';
import {
  approxRouteKm,
  haversineKm,
  getEligibleModes,
  getDriverMaxRadiusKm,
  resolveDriverModes,
  type DriverMode,
} from '@/utils/driverJobFilter';

/**
 * Hook to listen for new delivery orders that are ready for driver pickup
 * Only shows notifications when driver is on shift
 */
export function useDriverDeliveryNotifications(
  isOnShift: boolean, 
  shiftType: 'delivery' | 'ride' | 'both' | null,
  onNewDelivery?: (order: any) => void,
  onNewRide?: (ride: any) => void
) {
  const { user } = useAuth();
  const { soundEnabled, playNotificationSound } = useDriverShiftSound();
  
  // Use refs to track latest values without resubscribing
  const isOnShiftRef = useRef(isOnShift);
  const shiftTypeRef = useRef(shiftType);
  const soundEnabledRef = useRef(soundEnabled);

  // Keep refs in sync with props
  useEffect(() => {
    isOnShiftRef.current = isOnShift;
    shiftTypeRef.current = shiftType;
  }, [isOnShift, shiftType]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Show browser notification
  const showBrowserNotification = useCallback((title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `driver-notification-${Date.now()}`,
          requireInteraction: true,
        });
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
  }, []);

  const showDeliveryNotification = useCallback((payload: any) => {
    console.log('Delivery notification payload:', payload, 'isOnShift:', isOnShiftRef.current, 'shiftType:', shiftTypeRef.current);
    
    // Check if this is a venue_confirmed order with no driver assigned
    // OR if status changed to ready_for_pickup (venue marked ready)
    const isNewDeliveryAvailable = 
      (payload.new.status === 'venue_confirmed' || payload.new.status === 'ready_for_pickup') &&
      !payload.new.driver_id;
    
    if (
      isNewDeliveryAvailable &&
      isOnShiftRef.current &&
      (shiftTypeRef.current === 'delivery' || shiftTypeRef.current === 'both')
    ) {
      console.log('Showing delivery notification!');
      
      if (soundEnabledRef.current) {
        playNotificationSound();
      }
      
      const statusLabel = payload.new.status === 'ready_for_pickup' ? '🟢 READY NOW' : '📦 New Order';
      
      // Toast notification with View button that opens modal
      toast.info(`${statusLabel} - Food Delivery Available!`, {
        description: `Pickup: ${payload.new.pickup_address || 'Restaurant'}\nDeliver to: ${payload.new.delivery_address || 'Customer'}`,
        duration: 20000,
        action: {
          label: 'View',
          onClick: () => {
            // Only trigger modal when user clicks View
            onNewDelivery?.(payload.new);
          }
        }
      });

      // Browser push notification (no modal trigger)
      showBrowserNotification(
        `${statusLabel} - Delivery Available!`,
        `Pickup: ${payload.new.pickup_address || 'Restaurant'}`
      );
      
      // NOTE: Removed auto-trigger of onNewDelivery - modal only opens on View click
    }
  }, [playNotificationSound, showBrowserNotification, onNewDelivery]);

  const showRideNotification = useCallback((payload: any) => {
    console.log('Ride notification payload:', payload, 'isOnShift:', isOnShiftRef.current, 'shiftType:', shiftTypeRef.current);
    
    if (
      payload.new.status === 'pending' &&
      !payload.new.driver_id &&
      isOnShiftRef.current &&
      (shiftTypeRef.current === 'ride' || shiftTypeRef.current === 'both')
    ) {
      console.log('Showing ride notification!');
      
      if (soundEnabledRef.current) {
        playNotificationSound();
      }
      
      toast.info('🚕 New Ride Request!', {
        description: `Pickup: ${payload.new.pickup_address}\nDestination: ${payload.new.destination_address}`,
        duration: 20000,
        action: {
          label: 'View',
          onClick: () => {
            // Only trigger modal when user clicks View
            onNewRide?.(payload.new);
          }
        }
      });

      // Browser push notification (no modal trigger)
      showBrowserNotification(
        '🚕 New Ride Request!',
        `Pickup: ${payload.new.pickup_address}`
      );
      
      // NOTE: Removed auto-trigger of onNewRide - modal only opens on View click
    }
  }, [playNotificationSound, showBrowserNotification, onNewRide]);

  // De-dup runner-job alerts so escalation re-fetches don't double-notify.
  const notifiedRunnerIdsRef = useRef<Set<string>>(new Set());

  const evaluateAndNotifyRunnerJob = useCallback(
    async (job: any) => {
      if (!isOnShiftRef.current) return;
      if (job.status !== 'pending' || job.runner_id) return;
      if (notifiedRunnerIdsRef.current.has(job.id)) return;

      // Pull driver profile (vehicle modes + current location).
      const { data: dp } = await supabase
        .from('driver_profiles')
        .select('vehicle_modes, vehicle_type, current_latitude, current_longitude')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (!dp) return;
      const modes = resolveDriverModes(dp as any);
      if (!modes.length) return;

      const now = Date.now();
      const ageMin = (now - new Date(job.created_at).getTime()) / 60000;

      // Classify by actual pickup → drop-off distance. If the errand is already
      // car/moto/bike distance, that matching mode gets alerted immediately.
      let jobTier: DriverMode = 'runner';
      if (
        job.pickup_latitude != null &&
        job.pickup_longitude != null &&
        job.dropoff_latitude != null &&
        job.dropoff_longitude != null
      ) {
        const routeKm = approxRouteKm(
          haversineKm(
            Number(job.pickup_latitude),
            Number(job.pickup_longitude),
            Number(job.dropoff_latitude),
            Number(job.dropoff_longitude),
          ),
        );
        if (routeKm > 10) jobTier = 'car';
        else if (routeKm > 3) jobTier = 'motorcycle';
        else if (routeKm > 0.5) jobTier = 'bicycle';
      }
      const eligible = getEligibleModes(jobTier, ageMin);
      if (!modes.some((m: DriverMode) => eligible.includes(m))) return;

      // Distance check vs pickup (or drop-off if pickup unknown).
      const dLat = dp.current_latitude;
      const dLng = dp.current_longitude;
      if (dLat == null || dLng == null) return;
      const pLat = job.pickup_latitude ?? job.dropoff_latitude;
      const pLng = job.pickup_longitude ?? job.dropoff_longitude;
      let pickupKm = 0;
      if (pLat != null && pLng != null) {
        pickupKm = approxRouteKm(haversineKm(dLat, dLng, pLat, pLng));
      } else if (ageMin < 3) {
        return;
      }
      const maxRadius = getDriverMaxRadiusKm(modes, ageMin);
      if (pickupKm > maxRadius) return;

      notifiedRunnerIdsRef.current.add(job.id);

      if (soundEnabledRef.current) playNotificationSound();
      const fee =
        Number(job.runner_fee_usd ?? 0) +
        Number(job.distance_surcharge_usd ?? 0) +
        Number(job.tip_usd ?? 0);
      toast.info(`🏃 New Runner Errand — $${fee.toFixed(2)} fee`, {
        description: `${job.task_description?.slice(0, 80) ?? 'Errand'}\nDrop-off: ${job.dropoff_address ?? ''}`,
        duration: 20000,
        action: {
          label: 'View',
          onClick: () => onNewDelivery?.({
            id: job.id,
            customer_id: job.customer_id,
            venue_id: 'runner',
            source_type: 'runner_job',
            runner_job: job,
            status: job.status,
            pickup_address: job.pickup_address ?? 'Runner errand',
            pickup_latitude: job.pickup_latitude,
            pickup_longitude: job.pickup_longitude,
            delivery_address: job.dropoff_address,
            delivery_latitude: job.dropoff_latitude,
            delivery_longitude: job.dropoff_longitude,
            delivery_fee: fee,
            driver_earnings: fee,
            platform_fee: 0,
            special_instructions: `[JV Runner] ${job.task_description ?? ''}`,
            created_at: job.created_at,
          }),
        },
      });
      showBrowserNotification(
        '🏃 New Runner Errand',
        `Fee $${fee.toFixed(2)} — ${job.task_description?.slice(0, 60) ?? ''}`,
      );
    },
    [user, playNotificationSound, showBrowserNotification, onNewDelivery],
  );

  useEffect(() => {
    if (!user) return;

    console.log('Setting up driver notification subscriptions, isOnShift:', isOnShift, 'shiftType:', shiftType);

    // Subscribe to ALL food_delivery_orders changes (not filtered by status)
    // This ensures we catch when status changes TO venue_confirmed or ready_for_pickup
    const deliveryChannel = supabase
      .channel(createRealtimeChannelTopic('driver-delivery-notifications'))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'food_delivery_orders',
      }, showDeliveryNotification)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'food_delivery_orders',
      }, showDeliveryNotification)
      .subscribe((status) => {
        console.log('Delivery notification channel status:', status);
      });

    // Subscribe to ride_bookings
    const rideChannel = supabase
      .channel(createRealtimeChannelTopic('driver-ride-notifications'))
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_bookings',
      }, showRideNotification)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ride_bookings',
      }, showRideNotification)
      .subscribe((status) => {
        console.log('Ride notification channel status:', status);
      });

    // Subscribe to runner_jobs (NEW)
    const runnerChannel = supabase
      .channel(createRealtimeChannelTopic('driver-runner-notifications'))
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'runner_jobs',
      }, (payload) => evaluateAndNotifyRunnerJob(payload.new))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'runner_jobs',
      }, (payload) => evaluateAndNotifyRunnerJob(payload.new))
      .subscribe((status) => {
        console.log('Runner notification channel status:', status);
      });

    // Backfill: when the hook mounts (login or shift start), pull recent
    // pending unassigned runner_jobs + delivery orders so a late-login
    // driver still gets pinged about jobs created while they were offline.
    const backfillMissed = async () => {
      if (!isOnShiftRef.current) return;
      const { data: runnerRows } = await supabase
        .from('runner_jobs' as any)
        .select('*')
        .eq('status', 'pending')
        .is('runner_id', null)
        .order('created_at', { ascending: false })
        .limit(50);
      for (const j of (runnerRows ?? []) as any[]) {
        await evaluateAndNotifyRunnerJob(j);
      }
    };
    backfillMissed();

    // Periodic re-check so jobs that age past escalation thresholds
    // (2 / 3 / 5 min) become visible without requiring a DB change.
    const tick = window.setInterval(() => {
      backfillMissed();
    }, 60_000);

    return () => {
      console.log('Cleaning up notification channels');
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(rideChannel);
      supabase.removeChannel(runnerChannel);
      window.clearInterval(tick);
    };
  }, [user, showDeliveryNotification, showRideNotification, evaluateAndNotifyRunnerJob]);
}
