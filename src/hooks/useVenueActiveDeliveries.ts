import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";

export type ActiveDeliveryStatus =
  | "pending"
  | "venue_confirmed"
  | "driver_assigned"
  | "ready_for_pickup"
  | "picked_up"
  | "on_the_way";

export interface VenueActiveDelivery {
  id: string;
  order_id: string | null;
  venue_id: string;
  status: string | null;
  created_at: string | null;

  pickup_address: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;

  delivery_address: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;

  driver_id: string | null;
  driver_earnings: number | null;
  delivery_fee: number | null;
}

export interface DriverLocation {
  user_id: string;
  current_latitude: number | null;
  current_longitude: number | null;
  vehicle_type: string | null;
}

const ACTIVE_STATUSES: ActiveDeliveryStatus[] = [
  "pending",
  "venue_confirmed",
  "driver_assigned",
  "ready_for_pickup",
  "picked_up",
  "on_the_way",
];

export function useVenueActiveDeliveries(venueId: string | null) {
  const [deliveries, setDeliveries] = useState<VenueActiveDelivery[]>([]);
  const [driverLocations, setDriverLocations] = useState<Map<string, DriverLocation>>(new Map());
  const [loading, setLoading] = useState(true);

  const refreshDeliveries = useCallback(async () => {
    if (!venueId) {
      setDeliveries([]);
      setDriverLocations(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("food_delivery_orders")
      .select(
        "id, order_id, venue_id, status, created_at, pickup_address, pickup_latitude, pickup_longitude, delivery_address, delivery_latitude, delivery_longitude, driver_id, driver_earnings, delivery_fee"
      )
      .eq("venue_id", venueId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDeliveries(data as VenueActiveDelivery[]);
    } else {
      setDeliveries([]);
    }

    setLoading(false);
  }, [venueId]);

  const refreshDriverLocations = useCallback(async () => {
    const ids = Array.from(new Set(deliveries.map((d) => d.driver_id).filter(Boolean))) as string[];
    if (ids.length === 0) {
      setDriverLocations(new Map());
      return;
    }

    const { data } = await supabase
      .from("driver_profiles")
      .select("user_id, current_latitude, current_longitude, vehicle_type")
      .in("user_id", ids);

    const next = new Map<string, DriverLocation>();
    (data || []).forEach((row) => {
      next.set(row.user_id, row as DriverLocation);
    });
    setDriverLocations(next);
  }, [deliveries]);

  useEffect(() => {
    refreshDeliveries();
  }, [refreshDeliveries]);

  // Realtime delivery updates
  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`venue-delivery-map-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_delivery_orders",
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          refreshDeliveries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, refreshDeliveries]);

  // Lightweight polling for driver location (keeps things simple + reliable)
  useEffect(() => {
    refreshDriverLocations();

    const id = window.setInterval(() => {
      refreshDriverLocations();
    }, 15000);

    return () => window.clearInterval(id);
  }, [refreshDriverLocations]);

  const stats = useMemo(() => {
    const activeCount = deliveries.length;
    const assignedCount = deliveries.filter((d) => !!d.driver_id).length;
    return { activeCount, assignedCount };
  }, [deliveries]);

  return {
    deliveries,
    driverLocations,
    loading,
    stats,
    refreshDeliveries,
  };
}
