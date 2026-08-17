import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import { updateVenueScoreCounter } from "@/hooks/useVenueTier";

export interface DeliveryOrderDetails {
  id: string;
  orderId: string;
  orderNumber: number | null;
  customerName: string;
  deliveryAddress: string;
  deliveryFee: number;
  driverEarnings: number;
  status: string;
  driverId: string | null;
  driverName: string | null;
  estimatedDeliveryTime: string | null;
  specialInstructions: string | null;
}

interface DeliveryOrderRow {
  id: string;
  order_id: string | null;
  delivery_address: string;
  delivery_fee: number | null;
  driver_earnings: number | null;
  status: string;
  driver_id: string | null;
  estimated_delivery_time: string | null;
  special_instructions: string | null;
  orders: {
    order_number: number | null;
    customer_name: string | null;
  } | null;
}

export function useVenueDeliveryOrders(venueId: string | null) {
  const [deliveryOrders, setDeliveryOrders] = useState<Map<string, DeliveryOrderDetails>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchDeliveryOrders = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("food_delivery_orders")
        .select(`
          *,
          orders!food_delivery_orders_order_id_fkey (
            order_number,
            customer_name
          )
        `)
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped = new Map<string, DeliveryOrderDetails>();
      const rows = (data || []) as unknown as DeliveryOrderRow[];
      rows.forEach((d) => {
        if (d.order_id) {
          mapped.set(d.order_id, {
            id: d.id,
            orderId: d.order_id,
            orderNumber: typeof d.orders?.order_number === "number" ? d.orders.order_number : null,
            customerName: d.orders?.customer_name || "Customer",
            deliveryAddress: d.delivery_address,
            deliveryFee: Number(d.delivery_fee) || 0,
            driverEarnings: Number(d.driver_earnings) || 0,
            status: d.status,
            driverId: d.driver_id,
            driverName: null, // Could fetch from driver_profiles if needed
            estimatedDeliveryTime: d.estimated_delivery_time,
            specialInstructions: d.special_instructions,
          });
        }
      });

      setDeliveryOrders(mapped);
    } catch (error) {
      console.error("Error fetching delivery orders:", error);
    }
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    fetchDeliveryOrders();
  }, [fetchDeliveryOrders]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`delivery-orders-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_delivery_orders",
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          fetchDeliveryOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, fetchDeliveryOrders]);

  // Accept delivery order - confirms venue will prepare it
  const acceptDeliveryOrder = useCallback(async (deliveryId: string, orderId: string) => {
    try {
      // Update delivery status to venue_confirmed
      const { error: deliveryError } = await supabase
        .from("food_delivery_orders")
        .update({ status: "venue_confirmed" })
        .eq("id", deliveryId);

      if (deliveryError) throw deliveryError;

      // Update order status to preparing
      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: "preparing" })
        .eq("id", orderId);

      if (orderError) throw orderError;

      toast.success("Delivery order accepted! Drivers are being notified.");
      // Fire-and-forget venue tier counter update
      if (venueId) {
        updateVenueScoreCounter(venueId, "delivery_accepted");
      }
      fetchDeliveryOrders();
    } catch (error) {
      console.error("Error accepting delivery order:", error);
      toast.error("Failed to accept delivery order");
    }
  }, [fetchDeliveryOrders, venueId]);

  // Reject delivery order
  const rejectDeliveryOrder = useCallback(async (deliveryId: string, orderId: string) => {
    try {
      // Update delivery status to cancelled
      const { error: deliveryError } = await supabase
        .from("food_delivery_orders")
        .update({ status: "cancelled" })
        .eq("id", deliveryId);

      if (deliveryError) throw deliveryError;

      // Update order status to cancelled
      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId);

      if (orderError) throw orderError;

      toast.success("Delivery order rejected");
      fetchDeliveryOrders();
    } catch (error) {
      console.error("Error rejecting delivery order:", error);
      toast.error("Failed to reject delivery order");
    }
  }, [fetchDeliveryOrders]);

  // Mark order as ready for pickup (driver can pick it up)
  const markReadyForPickup = useCallback(async (deliveryId: string, orderId: string) => {
    try {
      const { error: deliveryError } = await supabase
        .from("food_delivery_orders")
        .update({ status: "ready_for_pickup" })
        .eq("id", deliveryId);

      if (deliveryError) throw deliveryError;

      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: "ready" })
        .eq("id", orderId);

      if (orderError) throw orderError;

      toast.success("Order marked ready for driver pickup!");
      fetchDeliveryOrders();
    } catch (error) {
      console.error("Error marking ready for pickup:", error);
      toast.error("Failed to update order status");
    }
  }, [fetchDeliveryOrders]);

  return {
    deliveryOrders,
    loading,
    acceptDeliveryOrder,
    rejectDeliveryOrder,
    markReadyForPickup,
    refreshDeliveryOrders: fetchDeliveryOrders,
  };
}
