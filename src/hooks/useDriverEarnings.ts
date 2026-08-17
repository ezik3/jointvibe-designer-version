import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';

interface DriverEarnings {
  lastDrive: number;
  currentShift: number;
  thisWeek: number;
}

export function useDriverEarnings(activeShiftId: string | null) {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<DriverEarnings>({
    lastDrive: 0,
    currentShift: 0,
    thisWeek: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchEarnings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Get current week start (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      // Fetch all completed deliveries this week
      const { data: deliveries } = await supabase
        .from('food_delivery_orders')
        .select('driver_earnings, created_at')
        .eq('driver_id', user.id)
        .eq('status', 'delivered')
        .gte('created_at', weekStart.toISOString())
        .order('created_at', { ascending: false });

      // Fetch all completed rides this week
      const { data: rides } = await supabase
        .from('ride_bookings')
        .select('driver_earnings, created_at')
        .eq('driver_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', weekStart.toISOString())
        .order('created_at', { ascending: false });

      // Calculate this week's earnings
      const deliveryEarnings = deliveries?.reduce((sum, d) => sum + (d.driver_earnings || 0), 0) || 0;
      const rideEarnings = rides?.reduce((sum, r) => sum + (r.driver_earnings || 0), 0) || 0;
      const weekTotal = deliveryEarnings + rideEarnings;

      // Get last completed order for "Last Drive"
      const allOrders = [
        ...(deliveries || []).map(d => ({ ...d, type: 'delivery' })),
        ...(rides || []).map(r => ({ ...r, type: 'ride' })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const lastOrder = allOrders[0];
      const lastDrive = lastOrder?.driver_earnings || 0;

      // Get current shift earnings
      let shiftEarnings = 0;
      if (activeShiftId) {
        const { data: shiftData } = await supabase
          .from('driver_shifts')
          .select('earnings, started_at')
          .eq('id', activeShiftId)
          .single();

        if (shiftData) {
          // Calculate earnings during this shift
          const shiftStart = shiftData.started_at;
          
          const { data: shiftDeliveries } = await supabase
            .from('food_delivery_orders')
            .select('driver_earnings')
            .eq('driver_id', user.id)
            .eq('status', 'delivered')
            .gte('created_at', shiftStart);

          const { data: shiftRides } = await supabase
            .from('ride_bookings')
            .select('driver_earnings')
            .eq('driver_id', user.id)
            .eq('status', 'completed')
            .gte('created_at', shiftStart);

          shiftEarnings = 
            (shiftDeliveries?.reduce((sum, d) => sum + (d.driver_earnings || 0), 0) || 0) +
            (shiftRides?.reduce((sum, r) => sum + (r.driver_earnings || 0), 0) || 0);
        }
      }

      setEarnings({
        lastDrive,
        currentShift: shiftEarnings,
        thisWeek: weekTotal,
      });
    } catch (error) {
      console.error('Error fetching driver earnings:', error);
    } finally {
      setLoading(false);
    }
  }, [user, activeShiftId]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  // Subscribe to realtime updates for completed orders
  useEffect(() => {
    if (!user) return;

    const deliveryChannel = supabase
      .channel(createRealtimeChannelTopic('driver-earnings-deliveries'))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'food_delivery_orders',
        filter: `driver_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new.status === 'delivered') {
          fetchEarnings();
        }
      })
      .subscribe();

    const rideChannel = supabase
      .channel(createRealtimeChannelTopic('driver-earnings-rides'))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ride_bookings',
        filter: `driver_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new.status === 'completed') {
          fetchEarnings();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(rideChannel);
    };
  }, [user, fetchEarnings]);

  return { earnings, loading, refresh: fetchEarnings };
}
