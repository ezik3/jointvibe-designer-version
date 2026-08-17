import { useState, useEffect, useCallback } from "react";

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
  status: "pending_payment" | "pending" | "preparing" | "ready" | "served" | "cancelled";
  paymentStatus?: "unpaid" | "paid" | "cash";
  paymentMethod?: "qr_scan" | "nfc_tap" | "cash" | "wallet_direct";
  createdAt: string;
  customerName?: string;
  source: "pos" | "ai" | "customer";
  priority: "normal" | "rush";
}

const ORDERS_STORAGE_KEY = "venue_orders";

// Generate unique order number
const generateOrderNumber = (existingOrders: Order[]): number => {
  const maxNumber = existingOrders.reduce((max, o) => Math.max(max, o.orderNumber), 1000);
  return maxNumber + 1;
};

export function useVenueOrders() {
  const [orders, setOrders] = useState<Order[]>([]);

  // Load orders from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (stored) {
      try {
        setOrders(JSON.parse(stored));
      } catch {
        setOrders([]);
      }
    }
  }, []);

  // Listen for order updates from other components
  useEffect(() => {
    const handleOrderUpdate = () => {
      const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (stored) {
        try {
          setOrders(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("orders-updated", handleOrderUpdate);
    return () => window.removeEventListener("orders-updated", handleOrderUpdate);
  }, []);

  // Save orders to localStorage and dispatch event
  const saveOrders = useCallback((newOrders: Order[]) => {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(newOrders));
    setOrders(newOrders);
    window.dispatchEvent(new CustomEvent("orders-updated"));
  }, []);

  // Add a new order
  const addOrder = useCallback((orderData: Omit<Order, "id" | "orderNumber" | "createdAt">) => {
    const newOrder: Order = {
      ...orderData,
      id: crypto.randomUUID(),
      orderNumber: generateOrderNumber(orders),
      createdAt: new Date().toISOString(),
    };
    const newOrders = [newOrder, ...orders];
    saveOrders(newOrders);
    
    // Dispatch notification event for venue home
    window.dispatchEvent(new CustomEvent("new-order-notification", { 
      detail: { order: newOrder } 
    }));
    
    return newOrder;
  }, [orders, saveOrders]);

  // Update order status
  const updateOrderStatus = useCallback((orderId: string, status: Order["status"]) => {
    const newOrders = orders.map(o => 
      o.id === orderId ? { ...o, status } : o
    );
    saveOrders(newOrders);
  }, [orders, saveOrders]);

  // Update order payment
  const updateOrderPayment = useCallback((
    orderId: string, 
    paymentStatus: Order["paymentStatus"], 
    paymentMethod?: Order["paymentMethod"]
  ) => {
    const newOrders = orders.map(o => {
      if (o.id === orderId) {
        // When payment is complete, move to pending (ready for kitchen)
        const newStatus = paymentStatus === "paid" || paymentStatus === "cash" 
          ? "pending" as const 
          : o.status;
        return { 
          ...o, 
          paymentStatus, 
          paymentMethod,
          status: newStatus
        };
      }
      return o;
    });
    saveOrders(newOrders);
  }, [orders, saveOrders]);

  // Get orders by status
  const getOrdersByStatus = useCallback((status: Order["status"]) => {
    return orders.filter(o => o.status === status);
  }, [orders]);

  // Get recent orders (last 24 hours)
  const getRecentOrders = useCallback((limit: number = 10) => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return orders
      .filter(o => o.createdAt > dayAgo)
      .slice(0, limit);
  }, [orders]);

  // Get kitchen orders (pending + preparing)
  const getKitchenOrders = useCallback(() => {
    return orders.filter(o => o.status === "pending" || o.status === "preparing");
  }, [orders]);

  // Stats
  const stats = {
    pending: orders.filter(o => o.status === "pending").length,
    preparing: orders.filter(o => o.status === "preparing").length,
    ready: orders.filter(o => o.status === "ready").length,
    served: orders.filter(o => o.status === "served").length,
    total: orders.length,
    todayRevenue: orders
      .filter(o => o.status === "served" && o.createdAt > new Date().toISOString().split("T")[0])
      .reduce((sum, o) => sum + o.total, 0),
  };

  // Get orders needing payment
  const getOrdersNeedingPayment = useCallback(() => {
    return orders.filter(o => o.status === "pending_payment");
  }, [orders]);

  return {
    orders,
    addOrder,
    updateOrderStatus,
    updateOrderPayment,
    getOrdersByStatus,
    getRecentOrders,
    getKitchenOrders,
    getOrdersNeedingPayment,
    stats,
  };
}
