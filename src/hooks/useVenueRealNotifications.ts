import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { triggerVenueNotification } from "@/components/Venue/VenueNotificationToast";

interface UseVenueRealNotificationsOptions {
  venueId: string | null;
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time venue events and trigger notifications
 * - New orders (INSERT for POS-created, UPDATE for paid remote orders)
 * - Customer check-ins
 * - Sales milestones
 */
export function useVenueRealNotifications({ venueId, enabled = true }: UseVenueRealNotificationsOptions) {
  const totalSalesRef = useRef(0);
  const lastMilestoneRef = useRef(0);

  useEffect(() => {
    if (!venueId || !enabled) return;

    // Subscribe to new POS-created orders (INSERT with status=pending)
    const ordersChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-orders-notif-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          const order = payload.new as { 
            id?: string;
            order_number?: number; 
            total?: number; 
            table_number?: string;
            is_preorder?: boolean;
            customer_name?: string;
            status?: string;
            order_type?: string;
            items?: any[];
            scheduled_for?: string;
          };
          
          // Only notify for orders that are immediately pending (POS-created)
          if (order.status === 'pending') {
            const isPreorder = order.is_preorder;
            const title = isPreorder 
              ? `🍽️ New Dine-In Pre-Order #${order.order_number || "?"}` 
              : `📦 New Order #${order.order_number || "?"}`;
            const message = isPreorder
              ? `${order.customer_name || "Customer"} - $${(order.total || 0).toFixed(2)}`
              : `Table ${order.table_number || "?"} - $${(order.total || 0).toFixed(2)}`;
            
            triggerVenueNotification({
              type: "new_order",
              title,
              message,
              orderData: {
                orderId: order.id,
                orderNumber: order.order_number,
                total: order.total,
                orderType: order.order_type || (order.table_number ? 'dine-in' : undefined),
                itemCount: Array.isArray(order.items) ? order.items.length : undefined,
                customerName: order.customer_name,
                eta: order.scheduled_for ? new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
              },
            });
          }

          // Track sales for milestones
          if (order.total && order.status === 'pending') {
            totalSalesRef.current += order.total;
            checkSalesMilestone();
          }
        }
      )
      .subscribe();

    // Subscribe to order status changes (awaiting_payment → pending = paid remote order)
    const paidOrdersChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-paid-orders-notif-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          const oldOrder = payload.old as { status?: string };
          const newOrder = payload.new as {
            id?: string;
            order_number?: number;
            total?: number;
            table_number?: string;
            customer_name?: string;
            status?: string;
            order_type?: string;
            items?: any[];
            scheduled_for?: string;
          };

          // Paid remote order: awaiting_payment → pending
          if (oldOrder.status === 'awaiting_payment' && newOrder.status === 'pending') {
            const orderType = newOrder.order_type || 'pickup';
            const typeLabel = orderType.charAt(0).toUpperCase() + orderType.slice(1);
            
            triggerVenueNotification({
              type: "new_order",
              title: `📦 New ${typeLabel} Order #${newOrder.order_number || "?"}`,
              message: `${newOrder.customer_name || "Customer"} - $${(newOrder.total || 0).toFixed(2)}`,
              orderData: {
                orderId: newOrder.id,
                orderNumber: newOrder.order_number,
                total: newOrder.total,
                orderType,
                itemCount: Array.isArray(newOrder.items) ? newOrder.items.length : undefined,
                customerName: newOrder.customer_name,
                eta: newOrder.scheduled_for ? new Date(newOrder.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
              },
            });
          }

          // Sales milestone tracking for served orders
          if (newOrder.status === "served" && newOrder.total) {
            totalSalesRef.current += newOrder.total;
            checkSalesMilestone();
          }
        }
      )
      .subscribe();

    // Subscribe to check-ins
    const checkInsChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-checkins-notif-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "check_ins",
          filter: `venue_id=eq.${venueId}`,
        },
        async (payload) => {
          const checkIn = payload.new as { user_id: string; table_number?: string };
          
          const { data: profile } = await supabase
            .from("customer_profiles")
            .select("display_name")
            .eq("user_id", checkIn.user_id)
            .maybeSingle();

          const displayName = profile?.display_name || "A customer";
          
          triggerVenueNotification({
            type: "checkin",
            title: `${displayName} checked in!`,
            message: checkIn.table_number ? `Seated at Table ${checkIn.table_number}` : "Welcome to the venue",
          });
        }
      )
      .subscribe();

    // Check for sales milestones
    const checkSalesMilestone = () => {
      const milestones = [100, 500, 1000, 2500, 5000, 10000];
      const current = totalSalesRef.current;
      
      for (const milestone of milestones) {
        if (current >= milestone && lastMilestoneRef.current < milestone) {
          lastMilestoneRef.current = milestone;
          triggerVenueNotification({
            type: "sale",
            title: `$${milestone} Milestone!`,
            message: `You've reached $${milestone} in sales today! 🎉`,
          });
          break;
        }
      }
    };

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(paidOrdersChannel);
      supabase.removeChannel(checkInsChannel);
    };
  }, [venueId, enabled]);
}
