import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  size?: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  tableNumber: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "preparing" | "ready" | "served" | "cancelled";
  createdAt: string;
  customerName?: string;
  source: "pos" | "ai" | "customer";
  priority: "normal" | "rush";
  isPreorder?: boolean;
  scheduledFor?: string;
  reservationId?: string;
}

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

function getOrderStatus(status: string | null): Order["status"] {
  if (status === "pending" || status === "preparing" || status === "ready" || status === "served" || status === "cancelled") {
    return status;
  }
  return "pending";
}

export async function persistVenueOrderStatus(
  orderId: string,
  status: Order["status"],
) {
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) throw error;
}

export function useVenueOrdersDB(venueId: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(venueId);

  // Resolve venue id (so Orders works even after hard refresh)
  useEffect(() => {
    if (venueId) {
      setResolvedVenueId(venueId);
      localStorage.setItem("jv_current_venue_id", venueId);
      return;
    }

    const storedVenueId = localStorage.getItem("jv_current_venue_id");
    if (storedVenueId) setResolvedVenueId(storedVenueId);
  }, [venueId]);

  // Fetch orders from database
  const fetchOrders = useCallback(async () => {
    if (!resolvedVenueId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // NOTE: Keep this query simple (no nested selects) to avoid relationship/RLS edge-cases
      // that can silently break the Orders pages.
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("venue_id", resolvedVenueId)
        .neq("status", "awaiting_payment")
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      const orders = (ordersData ?? []) as OrderRow[];
      const orderIds = orders.map((order) => order.id);

      // Fetch items in a second query (safe + explicit)
      const { data: itemsData, error: itemsError } = orderIds.length
        ? await supabase
            .from("order_items")
            .select("*")
            .in("order_id", orderIds)
        : { data: [], error: null };

      if (itemsError) throw itemsError;

      const itemsByOrderId = new Map<string, OrderItemRow[]>();
      ((itemsData ?? []) as OrderItemRow[]).forEach((item) => {
        const orderItems = itemsByOrderId.get(item.order_id) ?? [];
        orderItems.push(item);
        itemsByOrderId.set(item.order_id, orderItems);
      });

      const mappedOrders: Order[] = orders.map((order) => {
        const items = itemsByOrderId.get(order.id) ?? [];
        return {
          id: order.id,
          orderNumber: order.order_number,
          tableNumber: order.table_number ?? "",
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            notes: item.notes,
          })),
          total: order.total ?? 0,
          status: getOrderStatus(order.status),
          createdAt: order.created_at ?? new Date(0).toISOString(),
          customerName: order.customer_name ?? undefined,
          source: "pos",
          priority: order.priority === "rush" ? "rush" : "normal",
          isPreorder: order.is_preorder ?? false,
          scheduledFor: order.scheduled_for ?? undefined,
          reservationId: order.reservation_id ?? undefined,
        };
      });

      setOrders(mappedOrders);
    } catch (error: unknown) {
      console.error("Error fetching orders:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedVenueId]);

  // Load on mount / when venue changes
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!resolvedVenueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`orders-${resolvedVenueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `venue_id=eq.${resolvedVenueId}`,
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedVenueId, fetchOrders]);
  // Add a new order
  const addOrder = useCallback(
    async (
      orderData: Omit<Order, "id" | "orderNumber" | "createdAt">
    ): Promise<Order | null> => {
      if (!resolvedVenueId) return null;

      try {
        // Create order
        const { data: newOrder, error: orderError } = await supabase
          .from("orders")
          .insert({
            venue_id: resolvedVenueId,
            table_number: orderData.tableNumber,
            customer_name: orderData.customerName,
            status: orderData.status,
            priority: orderData.priority,
            total: orderData.total,
            subtotal: orderData.total * 0.9, // Approximate subtotal
            tax: orderData.total * 0.1,
          })
          .select()
          .single();

        if (orderError) throw orderError;

        // Create order items
        if (orderData.items.length > 0) {
          const itemsToInsert = orderData.items.map((item) => ({
            order_id: newOrder.id,
            menu_item_id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            notes: item.notes,
          }));

          const { error: itemsError } = await supabase
            .from("order_items")
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;
        }

        toast.success(`Order #${newOrder.order_number} created!`);
        fetchOrders();

        return {
          ...orderData,
          id: newOrder.id,
          orderNumber: newOrder.order_number,
          createdAt: newOrder.created_at,
        };
      } catch (error) {
        console.error("Error creating order:", error);
        toast.error("Failed to create order");
        return null;
      }
    },
    [resolvedVenueId, fetchOrders]
  );

  // Update order status
  const updateOrderStatus = useCallback(
    async (orderId: string, status: Order["status"]) => {
      try {
        await persistVenueOrderStatus(orderId, status);
        fetchOrders();
      } catch (error) {
        console.error("Error updating order status:", error);
        toast.error("Failed to update order status");
      }
    },
    [fetchOrders]
  );

  // Get orders by status
  const getOrdersByStatus = useCallback(
    (status: Order["status"]) => {
      return orders.filter((o) => o.status === status);
    },
    [orders]
  );

  // Get recent orders (last 24 hours OR any pre-orders)
  const getRecentOrders = useCallback(
    (limit: number = 10) => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      return orders
        .filter((o) => o.createdAt > dayAgo || o.isPreorder)
        .slice(0, limit);
    },
    [orders]
  );

  // Get kitchen orders (pending + preparing)
  const getKitchenOrders = useCallback(() => {
    return orders.filter(
      (o) => o.status === "pending" || o.status === "preparing"
    );
  }, [orders]);

  // Get today's date at midnight for filtering
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Stats - "Served Today" only counts orders served today
  const stats = {
    pending: orders.filter((o) => o.status === "pending").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    servedToday: orders.filter((o) => o.status === "served" && o.createdAt >= todayIso).length,
    total: orders.length,
    todayRevenue: orders
      .filter(
        (o) =>
          ["preparing", "ready", "served"].includes(o.status) &&
          o.createdAt >= todayIso
      )
      .reduce((sum, o) => sum + o.total, 0),
  };

  // Get past orders (served/cancelled, not from today)
  const getPastOrders = useCallback(() => {
    return orders.filter(
      (o) => (o.status === "served" || o.status === "cancelled") && o.createdAt < todayIso
    );
  }, [orders, todayIso]);

  // Get today's orders only
  const getTodaysOrders = useCallback(() => {
    return orders.filter((o) => o.createdAt >= todayIso);
  }, [orders, todayIso]);

  return {
    orders,
    loading,
    addOrder,
    updateOrderStatus,
    getOrdersByStatus,
    getRecentOrders,
    getKitchenOrders,
    getPastOrders,
    getTodaysOrders,
    stats,
    refreshOrders: fetchOrders,
  };
}
