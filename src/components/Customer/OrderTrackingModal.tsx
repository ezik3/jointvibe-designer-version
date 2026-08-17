import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, CheckCircle2, Truck, ChefHat, Package, MapPin, User, MessageCircle, Navigation, Car, Calendar, Store, Timer, Bell, Lock, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import OrderTrackingMap from "./OrderTrackingMap";
import { format, differenceInDays, differenceInHours, differenceInMinutes, parseISO, isToday, isTomorrow } from "date-fns";
import { useTranslation } from 'react-i18next';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  deliveryOrderId?: string | null;
  orderType: "pickup" | "delivery" | "dine-in";
  onOpenChat?: () => void;
}

// Dine-in pre-orders use the same flow as pickup (tracking orders table)
const getEffectiveOrderType = (orderType: "pickup" | "delivery" | "dine-in") => {
  return orderType === "dine-in" ? "pickup" : orderType;
};

type DeliveryStatus = 
  | "pending" 
  | "venue_confirmed" 
  | "preparing" 
  | "ready_for_pickup" 
  | "driver_assigned"
  | "picked_up"
  | "on_the_way" 
  | "delivered" 
  | "completed"
  | "cancelled";

interface OrderDetails {
  id: string;
  order_number: number;
  status: DeliveryStatus;
  total: number;
  created_at: string;
  venue_name?: string;
  delivery_address?: string;
  estimated_time?: string;
  driver_name?: string;
  driver_id?: string;
  driver_avatar?: string;
  driver_rating?: number;
  driver_vehicle?: string;
  pickup_address?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  delivery_latitude?: number;
  delivery_longitude?: number;
  // Dine-in pre-order specific
  reservation_id?: string;
  reservation_date?: string;
  reservation_time?: string;
  is_preorder?: boolean;
  scheduled_for?: string;
  // Deposit tracking
  deposit_paid?: boolean;
  deposit_deadline?: string;
  deposit_amount?: number;
}

interface StatusEvent {
  status: string;
  timestamp: string;
  label: string;
}

// Delivery order steps (labels resolved at render time via t())
const deliverySteps: { status: DeliveryStatus; labelKey: string; icon: React.ReactNode }[] = [
  { status: "pending", labelKey: "order_tracking.step_order_placed", icon: <Clock className="w-5 h-5" /> },
  { status: "venue_confirmed", labelKey: "order_tracking.step_venue_confirmed", icon: <CheckCircle2 className="w-5 h-5" /> },
  { status: "preparing", labelKey: "order_tracking.step_preparing", icon: <ChefHat className="w-5 h-5" /> },
  { status: "ready_for_pickup", labelKey: "order_tracking.step_ready", icon: <Package className="w-5 h-5" /> },
  { status: "on_the_way", labelKey: "order_tracking.step_on_the_way", icon: <Truck className="w-5 h-5" /> },
  { status: "delivered", labelKey: "order_tracking.step_delivered", icon: <MapPin className="w-5 h-5" /> },
];

const pickupSteps = deliverySteps.filter(s => 
  ["pending", "venue_confirmed", "preparing", "ready_for_pickup", "completed"].includes(s.status)
);

// Simplified steps for dine-in pre-orders (only show Order Placed and Venue Confirmed for future bookings)
const dineInPreOrderSteps: { status: DeliveryStatus; labelKey: string; icon: React.ReactNode }[] = [
  { status: "pending", labelKey: "order_tracking.step_order_placed", icon: <Clock className="w-5 h-5" /> },
  { status: "venue_confirmed", labelKey: "order_tracking.step_venue_confirmed", icon: <CheckCircle2 className="w-5 h-5" /> },
];

// Get step completion status
// Returns: which step INDEX is currently IN PROGRESS (0-based)
// Steps before this index are COMPLETE, steps after are PENDING
// 
// STEP INDICES:
// 0 = Order Placed
// 1 = Venue Confirmed  
// 2 = Preparing
// 3 = Ready
// 4 = On The Way
// 5 = Delivered
//
// STATUS FLOW:
// pending → venue_confirmed → preparing → ready_for_pickup → picked_up → delivered
// driver_assigned can happen at any point after venue_confirmed
const getActiveStepIndex = (status: string): number => {
  switch (status) {
    case 'pending':
      // Order placed, waiting for venue confirmation
      // Step 0 (Order Placed) = COMPLETE
      // Step 1 (Venue Confirmed) = IN PROGRESS
      return 1;
      
    case 'venue_confirmed':
      // Venue confirmed, now preparing (or waiting to prepare)
      // Steps 0-1 = COMPLETE
      // Step 2 (Preparing) = IN PROGRESS
      return 2;
      
    case 'preparing':
      // Kitchen is preparing the order
      // Steps 0-1 = COMPLETE
      // Step 2 (Preparing) = IN PROGRESS (still cooking)
      return 2;
      
    case 'driver_assigned':
      // Driver assigned, but venue hasn't marked ready yet
      // Steps 0-1 = COMPLETE
      // Step 2 (Preparing) = IN PROGRESS 
      // (Driver can be assigned while food is still being prepared)
      return 2;
      
    case 'ready_for_pickup':
    case 'ready':
      // Venue marked order as ready, waiting for driver pickup
      // Steps 0-2 = COMPLETE
      // Step 3 (Ready) = IN PROGRESS (waiting for driver to pick up)
      return 3;
      
    case 'picked_up':
    case 'in_transit':
    case 'on_the_way':
      // Driver has picked up, on the way to customer
      // Steps 0-3 = COMPLETE
      // Step 4 (On The Way) = IN PROGRESS
      return 4;
      
    case 'delivered':
    case 'completed':
      // All done
      // Steps 0-5 = COMPLETE
      return 6;
      
    default:
      return 1;
  }
};

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  orderId,
  deliveryOrderId,
  orderType,
  onOpenChat
}) => {
  const { t } = useTranslation('common');
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliveryStatus, setDeliveryStatus] = useState<string>('pending');
  const [driverInfo, setDriverInfo] = useState<{name: string; avatar: string; rating: number; vehicle: string} | null>(null);
  const [driverAssignedAt, setDriverAssignedAt] = useState<string | null>(null);
  const [estimatedArrival, setEstimatedArrival] = useState<{distance: string; time: string} | null>(null);
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([]);
  const [showLiveMap, setShowLiveMap] = useState(false);

  // Use effective order type for data fetching (dine-in uses orders table like pickup)
  const effectiveOrderType = getEffectiveOrderType(orderType);

  // Check if this is a future dine-in pre-order (reservation is not today)
  const isFutureDineInPreOrder = useMemo(() => {
    if (orderType !== 'dine-in' || !order?.reservation_date) return false;
    try {
      const reservationDate = parseISO(order.reservation_date);
      return !isToday(reservationDate);
    } catch {
      return false;
    }
  }, [orderType, order?.reservation_date]);

  // Calculate countdown for dine-in reservations
  const reservationCountdown = useMemo(() => {
    if (orderType !== 'dine-in' || !order?.reservation_date || !order?.reservation_time) return null;
    try {
      const dateTimeStr = `${order.reservation_date}T${order.reservation_time}`;
      const reservationDateTime = parseISO(dateTimeStr);
      const now = new Date();
      
      if (reservationDateTime <= now) return null;
      
      const days = differenceInDays(reservationDateTime, now);
      const hours = differenceInHours(reservationDateTime, now) % 24;
      const minutes = differenceInMinutes(reservationDateTime, now) % 60;
      
      if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''}, ${hours} hr${hours !== 1 ? 's' : ''}`;
      } else if (hours > 0) {
        return `${hours} hr${hours !== 1 ? 's' : ''}, ${minutes} min`;
      } else {
        return `${minutes} min`;
      }
    } catch {
      return null;
    }
  }, [orderType, order?.reservation_date, order?.reservation_time]);

  // Calculate deposit deadline countdown (only if deposit not paid)
  const depositDeadlineCountdown = useMemo(() => {
    if (orderType !== 'dine-in' || order?.deposit_paid || !order?.deposit_deadline) return null;
    try {
      const deadlineDateTime = parseISO(order.deposit_deadline);
      const now = new Date();
      
      if (deadlineDateTime <= now) return { expired: true, text: t('order_tracking.deposit_overdue') };
      
      const days = differenceInDays(deadlineDateTime, now);
      const hours = differenceInHours(deadlineDateTime, now) % 24;
      const minutes = differenceInMinutes(deadlineDateTime, now) % 60;
      
      let text = "";
      if (days > 0) {
        text = t('order_tracking.duration_days_hours', { days, hours });
      } else if (hours > 0) {
        text = t('order_tracking.duration_hours_minutes', { hours, minutes });
      } else {
        text = t('order_tracking.duration_minutes', { minutes });
      }
      
      return { expired: false, text };
    } catch {
      return null;
    }
  }, [orderType, order?.deposit_paid, order?.deposit_deadline]);

  // Reminder toggle states (30m is always on and locked)
  const [reminderToggles, setReminderToggles] = useState<Record<string, boolean>>({
    "1d": true,
    "8h": true,
    "1h": true,
    "30m": true, // always on, locked
  });

  // Reservation reminder schedule (customer-facing)
  const reminderSchedule = useMemo(() => {
    if (orderType !== "dine-in" || !order?.reservation_date || !order?.reservation_time) return [] as { key: string; label: string; timeLabel: string; locked: boolean }[];

    try {
      const reservationDateTime = parseISO(`${order.reservation_date}T${order.reservation_time}`);
      const now = new Date();

      const intervals = [
        { key: "1d", label: "1 day before", ms: 24 * 60 * 60 * 1000, locked: false },
        { key: "8h", label: "8 hours before", ms: 8 * 60 * 60 * 1000, locked: false },
        { key: "1h", label: "1 hour before", ms: 60 * 60 * 1000, locked: false },
        { key: "30m", label: "30 minutes before", ms: 30 * 60 * 1000, locked: true },
      ];

      return intervals
        .map((i) => ({
          key: i.key,
          label: i.label,
          at: new Date(reservationDateTime.getTime() - i.ms),
          locked: i.locked,
        }))
        .filter((i) => i.at > now)
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map((i) => ({
          key: i.key,
          label: i.label,
          timeLabel: format(i.at, "MMM d, h:mm a"),
          locked: i.locked,
        }));
    } catch {
      return [];
    }
  }, [orderType, order?.reservation_date, order?.reservation_time]);

  const handleReminderToggle = (key: string, checked: boolean) => {
    if (key === "30m") return; // 30m is locked
    setReminderToggles(prev => ({ ...prev, [key]: checked }));
  };

  // Use simplified steps for future dine-in pre-orders
  const steps = isFutureDineInPreOrder 
    ? dineInPreOrderSteps 
    : (effectiveOrderType === "delivery" ? deliverySteps : pickupSteps);
  const currentStepIndex = getActiveStepIndex(deliveryStatus);

  // Fetch driver info
  const fetchDriverInfo = async (driverId: string) => {
    try {
      const { data: driverProfile } = await supabase
        .from('driver_profiles')
        .select('*, profiles!driver_profiles_user_id_fkey(full_name, avatar_url)')
        .eq('user_id', driverId)
        .single();
      
      if (driverProfile) {
        const profile = (driverProfile as any).profiles;
        setDriverInfo({
          name: profile?.full_name || 'Your Driver',
          avatar: profile?.avatar_url || '',
          rating: driverProfile.average_rating || 5.0,
          vehicle: `${driverProfile.vehicle_make || ''} ${driverProfile.vehicle_model || ''}`.trim() || 'Vehicle'
        });
      }
    } catch (error) {
      console.error('Error fetching driver info:', error);
    }
  };

  // Calculate ETA using Mapbox
  const calculateETA = async (
    fromLat: number, 
    fromLng: number, 
    toLat: number, 
    toLng: number
  ) => {
    try {
      const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
      if (!token) return;

      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?access_token=${token}`
      );
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        const distanceKm = (route.distance / 1000).toFixed(1);
        const durationMin = Math.round(route.duration / 60);
        
        setEstimatedArrival({
          distance: `${distanceKm} km`,
          time: `${durationMin} min`
        });
      }
    } catch (error) {
      console.error('Error calculating ETA:', error);
    }
  };

  // Track driver location for ETA updates
  useEffect(() => {
    if (!order?.driver_id || !['driver_assigned', 'picked_up', 'on_the_way'].includes(deliveryStatus)) return;

    // Subscribe to driver location updates
    const channel = supabase
      .channel(createRealtimeChannelTopic(`driver-location-${order.driver_id}`))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'driver_profiles',
        filter: `user_id=eq.${order.driver_id}`
      }, async (payload) => {
        const driverLat = payload.new.current_latitude;
        const driverLng = payload.new.current_longitude;

        if (driverLat && driverLng) {
          // Calculate ETA based on current phase
          if (deliveryStatus === 'driver_assigned' || deliveryStatus === 'picked_up') {
            // Driver heading to venue
            if (order.pickup_latitude && order.pickup_longitude) {
              await calculateETA(driverLat, driverLng, order.pickup_latitude, order.pickup_longitude);
            }
          } else if (deliveryStatus === 'on_the_way') {
            // Driver heading to customer
            if (order.delivery_latitude && order.delivery_longitude) {
              await calculateETA(driverLat, driverLng, order.delivery_latitude, order.delivery_longitude);
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order?.driver_id, deliveryStatus, order?.pickup_latitude, order?.pickup_longitude, order?.delivery_latitude, order?.delivery_longitude]);

  // Subscribe to reservation status changes so the customer updates instantly when venue confirms.
  useEffect(() => {
    if (!isOpen) return;
    if (orderType !== "dine-in") return;
    if (!order?.reservation_id) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`reservation-tracking-${order.reservation_id}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "table_reservations",
          filter: `id=eq.${order.reservation_id}`,
        },
        (payload) => {
          const newStatus = (payload.new as any)?.status as string | undefined;
          if (newStatus === "confirmed") setDeliveryStatus("venue_confirmed");
          if (newStatus === "cancelled") setDeliveryStatus("cancelled");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, orderType, order?.reservation_id]);

  useEffect(() => {
    if (!isOpen) return;
    if (!orderId && !deliveryOrderId) return;

    const fetchOrderData = async () => {
      setLoading(true);
      
      try {
        if (effectiveOrderType === "delivery") {
          let deliveryData = null;
          
          if (deliveryOrderId) {
            const { data } = await supabase
              .from("food_delivery_orders")
              .select("*, orders!food_delivery_orders_order_id_fkey(order_number, total, created_at)")
              .eq("id", deliveryOrderId)
              .single();
            deliveryData = data;
          } else if (orderId) {
            const { data } = await supabase
              .from("food_delivery_orders")
              .select("*, orders!food_delivery_orders_order_id_fkey(order_number, total, created_at)")
              .eq("order_id", orderId)
              .single();
            deliveryData = data;
          }

          if (deliveryData) {
            const orderInfo = (deliveryData as any).orders;
            setOrder({
              id: deliveryData.id,
              order_number: orderInfo?.order_number || 0,
              status: deliveryData.status as DeliveryStatus,
              total: orderInfo?.total || 0,
              created_at: orderInfo?.created_at || deliveryData.created_at || "",
              delivery_address: deliveryData.delivery_address,
              driver_id: deliveryData.driver_id,
              pickup_address: deliveryData.pickup_address,
              pickup_latitude: deliveryData.pickup_latitude,
              pickup_longitude: deliveryData.pickup_longitude,
              delivery_latitude: deliveryData.delivery_latitude,
              delivery_longitude: deliveryData.delivery_longitude,
            });
            setDeliveryStatus(deliveryData.status || 'pending');

            // Fetch driver info if assigned
            if (deliveryData.driver_id) {
              await fetchDriverInfo(deliveryData.driver_id);
              setDriverAssignedAt(deliveryData.updated_at);
            }

            // Initialize status events
            const events: StatusEvent[] = [
              { status: 'pending', timestamp: orderInfo?.created_at || deliveryData.created_at, label: 'Order Placed' }
            ];
            if (deliveryData.status !== 'pending') {
              events.push({ status: 'venue_confirmed', timestamp: '', label: 'Venue Confirmed' });
            }
            setStatusEvents(events);
          }
        } else {
          if (orderId) {
            // For dine-in pre-orders, fetch from orders table, then join reservation separately
            const { data, error } = await supabase
              .from("orders")
              .select("*")
              .eq("id", orderId)
              .single();

            if (data && !error) {
              let venueName: string | undefined;
              let reservationDate: string | undefined;
              let reservationTime: string | undefined;
              let reservationId: string | undefined;

              let derivedStatus: DeliveryStatus = (data.status || "pending") as DeliveryStatus;

              // If this is a pre-order with a reservation_id, fetch reservation details
              if (data.reservation_id) {
                const { data: resData } = await supabase
                  .from("table_reservations")
                  .select("id, reservation_date, start_time, status, venue_id, deposit_paid, deposit_deadline, deposit_amount, venues(name)")
                  .eq("id", data.reservation_id)
                  .single();

                if (resData) {
                  reservationId = resData.id;
                  reservationDate = resData.reservation_date;
                  reservationTime = resData.start_time;
                  venueName = (resData.venues as any)?.name;
                  
                  // Deposit info
                  const depositPaid = resData.deposit_paid;
                  const depositDeadline = resData.deposit_deadline;
                  const depositAmount = resData.deposit_amount;

                  // If venue already confirmed the reservation, reflect that immediately.
                  if (orderType === "dine-in" && resData.status === "confirmed") {
                    derivedStatus = "venue_confirmed";
                  }
                  
                  // Store deposit info to set in order later
                  (data as any)._depositPaid = depositPaid;
                  (data as any)._depositDeadline = depositDeadline;
                  (data as any)._depositAmount = depositAmount;
                }
              }

              // If no reservation but we have venue_id, fetch venue name
              if (!venueName && data.venue_id) {
                const { data: venueData } = await supabase
                  .from("venues")
                  .select("name")
                  .eq("id", data.venue_id)
                  .single();
                venueName = venueData?.name;
              }

              setOrder({
                id: data.id,
                order_number: data.order_number,
                status: derivedStatus as DeliveryStatus,
                total: data.total || 0,
                created_at: data.created_at || "",
                venue_name: venueName,
                reservation_id: reservationId,
                reservation_date: reservationDate,
                reservation_time: reservationTime,
                is_preorder: data.is_preorder || false,
                scheduled_for: data.scheduled_for,
                deposit_paid: (data as any)._depositPaid,
                deposit_deadline: (data as any)._depositDeadline,
                deposit_amount: (data as any)._depositAmount,
              });
              setDeliveryStatus(derivedStatus || "pending");
            }
          }
        }
      } catch (error) {
        console.error("Error fetching order:", error);
      }
      
      setLoading(false);
    };

    fetchOrderData();

    // Subscribe to real-time updates
    const channels: ReturnType<typeof supabase.channel>[] = [];

    if (effectiveOrderType === "delivery") {
      const filterColumn = deliveryOrderId ? 'id' : 'order_id';
      const filterValue = deliveryOrderId || orderId;

      if (filterValue) {
        const deliveryChannel = supabase
          .channel(createRealtimeChannelTopic(`delivery-order-tracking-${filterValue}`))
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'food_delivery_orders',
            filter: `${filterColumn}=eq.${filterValue}`
          }, async (payload) => {
            console.log('Delivery order update:', payload.new);
            const newStatus = payload.new.status || 'pending';
            setDeliveryStatus(newStatus);
            setOrder(prev => prev ? {
              ...prev,
              status: newStatus as DeliveryStatus,
              driver_id: payload.new.driver_id,
            } : null);

            // Fetch driver info when assigned
            if (payload.new.driver_id && !driverInfo) {
              await fetchDriverInfo(payload.new.driver_id);
              setDriverAssignedAt(payload.new.updated_at);
            }
          })
          .subscribe();
        channels.push(deliveryChannel);
      }
    } else {
      if (orderId) {
        const orderChannel = supabase
          .channel(createRealtimeChannelTopic(`order-tracking-${orderId}`))
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`
          }, (payload) => {
            if (payload.new) {
              setDeliveryStatus(payload.new.status || 'pending');
              setOrder(prev => prev ? {
                ...prev,
                status: payload.new.status as DeliveryStatus,
              } : null);
            }
          })
          .subscribe();
        channels.push(orderChannel);
      }
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [orderId, deliveryOrderId, isOpen, effectiveOrderType]);

  if (!isOpen) return null;

  // Show live tracking map
  if (showLiveMap && order && order.pickup_latitude && order.pickup_longitude && order.delivery_latitude && order.delivery_longitude) {
    return (
      <OrderTrackingMap
        orderId={deliveryOrderId || orderId || ''}
        orderType="delivery"
        pickupLat={order.pickup_latitude}
        pickupLng={order.pickup_longitude}
        dropoffLat={order.delivery_latitude}
        dropoffLng={order.delivery_longitude}
        pickupAddress={order.pickup_address || t('order_tracking.venue_fallback')}
        dropoffAddress={order.delivery_address || t('order_tracking.your_location_fallback')}
        driverId={order.driver_id}
        onClose={() => setShowLiveMap(false)}
        onOpenChat={onOpenChat}
      />
    );
  }

  const getStatusMessage = () => {
    // For future dine-in pre-orders, show friendlier message
    if (isFutureDineInPreOrder) {
      switch (deliveryStatus) {
        case "pending":
          return t('order_tracking.msg_waiting_reservation');
        case "venue_confirmed":
        case "preparing":
          return t('order_tracking.msg_venue_accepted_reservation');
        default:
          return t('order_tracking.msg_venue_accepted_reservation');
      }
    }

    switch (deliveryStatus) {
      case "pending":
        return t('order_tracking.msg_waiting_order');
      case "venue_confirmed":
        return t('order_tracking.msg_venue_accepted_order');
      case "preparing":
        return t('order_tracking.msg_preparing');
      case "ready_for_pickup":
        return orderType === "pickup" || orderType === "dine-in"
          ? (orderType === "dine-in" ? t('order_tracking.msg_dine_in_ready') : t('order_tracking.msg_pickup_ready'))
          : t('order_tracking.msg_ready_waiting_driver');
      case "driver_assigned":
        return t('order_tracking.msg_driver_assigned');
      case "picked_up":
      case "in_transit":
      case "on_the_way":
        return t('order_tracking.msg_on_the_way');
      case "delivered":
      case "completed":
        return t('order_tracking.msg_completed');
      case "cancelled":
        return t('order_tracking.msg_cancelled');
      default:
        return t('order_tracking.msg_status_default', { status: deliveryStatus });
    }
  };

  const getStatusStyle = () => {
    if (deliveryStatus === "delivered" || deliveryStatus === "completed") {
      return "bg-green-500/10 border border-green-500/30 text-green-500";
    }
    if (deliveryStatus === "cancelled") {
      return "bg-red-500/10 border border-red-500/30 text-red-500";
    }
    if (deliveryStatus === "ready_for_pickup" && (orderType === "pickup" || orderType === "dine-in")) {
      return "bg-green-500/10 border border-green-500/30 text-green-500 font-bold";
    }
    return "bg-primary/10 border border-primary/30";
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="customer-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="customer-modal-panel w-full max-w-md max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 border-b border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] p-4 text-[var(--customer-modal-text)]">
            <div className="flex justify-between items-center">
              <div>
              <h2 className="font-bold text-lg">
                  {orderType === "delivery" ? t('order_tracking.title_delivery') : orderType === "dine-in" ? t('order_tracking.title_dine_in') : t('order_tracking.title_pickup')}
                </h2>
                {order && (
                  <p className="text-[var(--customer-modal-muted)] text-sm">{t('order_tracking.order_number', { number: order.order_number })}</p>
                )}
              </div>
              <button onClick={onClose} className="customer-modal-secondary h-8 w-8 p-0">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : order ? (
              <>
                {/* Driver Info Card - Show when driver is assigned */}
                {order.driver_id && driverInfo && orderType === "delivery" && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[6px] border border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] flex items-center justify-center overflow-hidden">
                        {driverInfo.avatar ? (
                          <img src={driverInfo.avatar} alt={driverInfo.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-7 h-7" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-foreground font-bold">{driverInfo.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Car className="w-3 h-3" />
                          <span>{driverInfo.vehicle}</span>
                          <span>•</span>
                          <span>⭐ {driverInfo.rating.toFixed(1)}</span>
                        </div>
                        {driverAssignedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('order_tracking.assigned_at', { time: formatTime(driverAssignedAt) })}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ETA Display */}
                    {estimatedArrival && (
                      <div className="mt-3 pt-3 border-t border-[var(--customer-modal-line)] flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <Navigation className="w-4 h-4 text-cyan" />
                          <span className="text-muted-foreground">
                            {['picked_up', 'in_transit', 'on_the_way'].includes(deliveryStatus) ? t('order_tracking.to_you') : t('order_tracking.to_venue')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-cyan font-bold">{estimatedArrival.time}</span>
                          <span className="text-muted-foreground text-sm ml-2">({estimatedArrival.distance})</span>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-3 flex gap-2">
                      {onOpenChat && (
                        <Button
                          onClick={onOpenChat}
                          variant="outline"
                          size="sm"
                          className="customer-modal-secondary flex-1"
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          {t('order_tracking.chat')}
                        </Button>
                      )}
                      {order.pickup_latitude && order.pickup_longitude && order.delivery_latitude && order.delivery_longitude && (
                        <Button
                          onClick={() => setShowLiveMap(true)}
                          size="sm"
                          className="customer-modal-primary flex-1"
                        >
                          <MapPin className="w-4 h-4 mr-2" />
                          {t('order_tracking.track_live')}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Dine-In Reservation Info Card */}
                {orderType === 'dine-in' && order?.reservation_date && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[6px] border border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] p-4"
                  >
                    {/* Venue Name */}
                    {order.venue_name && (
                      <div className="flex items-center gap-3 mb-3">
                        <Store className="w-5 h-5 text-emerald-500" />
                        <span className="font-bold text-foreground">{order.venue_name}</span>
                      </div>
                    )}
                    
                    {/* Reservation Date & Time */}
                    <div className="flex items-center gap-3 mb-3">
                      <Calendar className="w-5 h-5 text-teal-500" />
                      <div>
                        <span className="font-medium text-foreground">
                          {(() => {
                            try {
                              const date = parseISO(order.reservation_date);
                              if (isToday(date)) return t('order_tracking.today');
                              if (isTomorrow(date)) return t('order_tracking.tomorrow');
                              return format(date, "EEE, MMM d");
                            } catch {
                              return order.reservation_date;
                            }
                          })()}
                        </span>
                        {order.reservation_time && (
                          <span className="text-muted-foreground ml-2">
                            {t('order_tracking.at_time', { time: order.reservation_time.slice(0, 5) })}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Countdown Timer */}
                    {reservationCountdown && (
                      <div className="flex items-center gap-3 pt-3 border-t border-emerald-500/20">
                        <Timer className="w-5 h-5 text-amber-500" />
                        <div>
                          <span className="text-sm text-muted-foreground">{t('order_tracking.time_until_reservation')}</span>
                          <span className="ml-2 font-bold text-amber-500">{reservationCountdown}</span>
                        </div>
                      </div>
                    )}

                    {/* Deposit Deadline Countdown - Only show if deposit not paid */}
                    {depositDeadlineCountdown && !order.deposit_paid && (
                      <div className={`flex items-center gap-3 pt-3 border-t ${depositDeadlineCountdown.expired ? 'border-red-500/20' : 'border-orange-500/20'}`}>
                        {depositDeadlineCountdown.expired ? (
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                        ) : (
                          <CreditCard className="w-5 h-5 text-orange-500" />
                        )}
                        <div className="flex-1">
                          <div className="text-sm text-muted-foreground">
                            {depositDeadlineCountdown.expired ? (
                              <span className="text-red-500 font-bold">{t('order_tracking.deposit_overdue')}</span>
                            ) : (
                              <>
                                <span>{t('order_tracking.deposit_due_in')}</span>
                                <span className="ml-2 font-bold text-orange-500">{depositDeadlineCountdown.text}</span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {order.deposit_amount && (
                              <span className="text-orange-400 font-semibold">${order.deposit_amount.toFixed(2)}</span>
                            )}
                            {' '}{t('order_tracking.deposit_required')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Reminder schedule */}
                    {reminderSchedule.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-emerald-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Bell className="w-5 h-5 text-primary" />
                          <span className="font-medium text-foreground">{t('order_tracking.reservation_reminders')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t('order_tracking.reminders_hint')}
                        </p>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {reminderSchedule.map((r) => (
                            <li key={r.key} className="flex items-center justify-between gap-2">
                              <span className="flex-1">{r.label}</span>
                              <span className="font-medium text-foreground text-xs">{r.timeLabel}</span>
                              <div className="flex items-center gap-1">
                                {r.locked ? (
                                  <Lock className="w-3 h-3 text-muted-foreground" />
                                ) : null}
                                <Switch
                                  checked={reminderToggles[r.key] ?? true}
                                  onCheckedChange={(checked) => handleReminderToggle(r.key, checked)}
                                  disabled={r.locked}
                                  className="scale-75"
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Status Timeline */}
                <div className="space-y-4">
                  {steps.map((step, index) => {
                    // Special logic: "Order Placed" (index 0) is always complete once order exists
                    // For other steps, check if we've passed this step based on current status
                    let isCompleted = false;
                    let isCurrent = false;

                    if (index === 0) {
                      // Order Placed is always complete once order exists
                      isCompleted = true;
                    } else {
                      // For other steps, use the mapped index
                      isCompleted = index < currentStepIndex;
                      isCurrent = index === currentStepIndex;
                    }

                    const isCurrentGreen =
                      isCurrent && (step.status === "preparing" || step.status === "ready_for_pickup");

                    const currentSubtext =
                      isCurrent && step.status === "ready_for_pickup" && orderType === "delivery"
                        ? t('order_tracking.subtext_waiting_driver')
                        : t('order_tracking.subtext_in_progress');

                    return (
                      <div key={step.status} className="flex items-center gap-4">
                        <div
                          className={`
                           w-10 h-10 rounded-full flex items-center justify-center
                           ${isCompleted
                             ? "bg-green-500 text-white"
                             : isCurrent
                               ? isCurrentGreen
                                 ? "bg-green-500 text-white ring-2 ring-green-500 ring-offset-2 ring-offset-background"
                                 : "bg-primary text-white ring-2 ring-primary ring-offset-2 ring-offset-background"
                               : "bg-muted text-muted-foreground"
                           }
                         `}
                        >
                          {step.icon}
                        </div>
                        <div className="flex-1">
                          <p
                            className={`font-medium ${isCompleted || isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {t(step.labelKey)}
                          </p>
                          {isCurrent && (
                            <p className="text-sm text-muted-foreground animate-pulse">
                              {currentSubtext}
                            </p>
                          )}
                        </div>
                        {isCompleted && (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Order Info */}
                <div className="rounded-[6px] border border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)] p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('order_tracking.order_total')}</span>
                    <span className="font-bold">${order.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('order_tracking.placed_at')}</span>
                    <span className="text-sm">
                      {new Date(order.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {order.delivery_address && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('order_tracking.delivering_to')}</span>
                      <span className="text-sm text-right max-w-[60%] truncate">
                        {order.delivery_address}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status Message */}
                <div className={`rounded-xl p-4 text-center ${getStatusStyle()}`}>
                  <p>{getStatusMessage()}</p>
                </div>

                {/* Track Live Button - show when we have coordinates but driver card might not show */}
                {orderType === 'delivery' && order.pickup_latitude && order.pickup_longitude && order.delivery_latitude && order.delivery_longitude && !driverInfo && (
                  <Button
                    onClick={() => setShowLiveMap(true)}
                  className="customer-modal-primary w-full"
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    {t('order_tracking.track_on_map')}
                  </Button>
                )}

                {/* Legacy Chat button for when driver card isn't shown */}
                {order.driver_id && !driverInfo && onOpenChat && (
                  <Button
                    onClick={onOpenChat}
                    variant="outline"
                  className="customer-modal-secondary w-full"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    {t('order_tracking.chat_with_driver')}
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {t('order_tracking.order_not_found')}
              </div>
            )}

            <Button onClick={onClose} variant="outline" className="customer-modal-secondary w-full">
              {t('order_tracking.close')}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
