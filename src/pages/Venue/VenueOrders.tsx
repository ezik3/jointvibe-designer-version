import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Check,
  ChefHat,
  CircleCheck,
  Clock,
  Inbox,
  MapPin,
  PackageCheck,
  Radio,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Table2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format, formatDistanceToNow, isToday, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import type { Order } from "@/hooks/useVenueOrdersDB";
import { useVenueDeliveryOrders } from "@/hooks/useVenueDeliveryOrders";
import type { DeliveryOrderDetails } from "@/hooks/useVenueDeliveryOrders";
import { useDeliveryNotification } from "@/hooks/useDeliveryNotification";
import "./venue-orders.css";

type OrderFilter = "active" | "pending" | "preparing" | "ready" | "completed";
type ServiceFilter = "all" | "dine-in" | "delivery" | "upcoming" | "past";
type OrderStatusTone = "new" | "preparing" | "ready" | "completed" | "cancelled";

interface OrderStatusDisplay {
  label: string;
  tone: OrderStatusTone;
}

interface AdvanceAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

const deliveryStatusLabels: Record<string, string> = {
  pending: "Awaiting confirmation",
  venue_confirmed: "Waiting for driver",
  driver_assigned: "Driver assigned",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function formatCurrency(value: number) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function formatOrderTime(dateValue: string) {
  try {
    return formatDistanceToNow(new Date(dateValue), { addSuffix: true });
  } catch {
    return "Just now";
  }
}

function formatScheduledTime(dateValue?: string) {
  if (!dateValue) return null;

  try {
    return format(parseISO(dateValue), "MMM d 'at' h:mm a");
  } catch {
    return null;
  }
}

function formatTableNumber(tableNumber: string) {
  if (!tableNumber) return "Table assignment pending";
  return /^table\b/i.test(tableNumber) ? tableNumber : `Table ${tableNumber}`;
}

function getOrderStatus(order: Order, delivery?: DeliveryOrderDetails): OrderStatusDisplay {
  if (delivery) {
    const label = deliveryStatusLabels[delivery.status] || order.status;

    if (delivery.status === "pending") return { label, tone: "new" };
    if (["venue_confirmed", "driver_assigned"].includes(delivery.status)) return { label, tone: "preparing" };
    if (["ready_for_pickup", "picked_up", "on_the_way"].includes(delivery.status)) return { label, tone: "ready" };
    if (delivery.status === "cancelled") return { label, tone: "cancelled" };
    if (delivery.status === "delivered") return { label, tone: "completed" };
  }

  switch (order.status) {
    case "pending":
      return { label: "New", tone: "new" };
    case "preparing":
      return { label: "Preparing", tone: "preparing" };
    case "ready":
      return { label: "Ready", tone: "ready" };
    case "cancelled":
      return { label: "Cancelled", tone: "cancelled" };
    default:
      return { label: "Completed", tone: "completed" };
  }
}

function getFilterStatus(order: Order, delivery?: DeliveryOrderDetails): Exclude<OrderFilter, "active"> {
  if (delivery) {
    if (delivery.status === "pending") return "pending";
    if (["venue_confirmed", "driver_assigned"].includes(delivery.status)) return "preparing";
    if (["ready_for_pickup", "picked_up", "on_the_way"].includes(delivery.status)) return "ready";
    if (["delivered", "cancelled"].includes(delivery.status)) return "completed";
  }

  if (order.status === "pending") return "pending";
  if (order.status === "preparing") return "preparing";
  if (order.status === "ready") return "ready";
  return "completed";
}

function getOrderContext(order: Order, delivery?: DeliveryOrderDetails) {
  if (delivery) {
    return {
      label: "Delivery",
      location: delivery.deliveryAddress || "Delivery address pending",
      icon: Truck,
    };
  }

  if (order.isPreorder) {
    return {
      label: "Pre-order",
      location: formatTableNumber(order.tableNumber),
      icon: Calendar,
    };
  }

  if (order.tableNumber) {
    return {
      label: "Table service",
      location: formatTableNumber(order.tableNumber),
      icon: Table2,
    };
  }

  return {
    label: "Pickup",
    location: "Collection counter",
    icon: ShoppingBag,
  };
}

function isUpcomingPreOrder(order: Order) {
  if (!order.isPreorder || !order.scheduledFor) return false;

  try {
    return parseISO(order.scheduledFor) > new Date();
  } catch {
    return false;
  }
}

export default function VenueOrders() {
  const [venueId, setVenueId] = useState<string | null>(() => localStorage.getItem("jv_current_venue_id"));
  const [venueLoading, setVenueLoading] = useState(!venueId);
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (venueId) {
      setVenueLoading(false);
      return;
    }

    const resolveVenue = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: venue } = await supabase
          .from("venues")
          .select("id")
          .eq("owner_user_id", user.id)
          .maybeSingle();

        if (venue?.id) {
          localStorage.setItem("jv_current_venue_id", venue.id);
          setVenueId(venue.id);
          return;
        }

        const { data: link } = await supabase
          .from("employee_venue_links")
          .select("venue_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (link?.venue_id) {
          localStorage.setItem("jv_current_venue_id", link.venue_id);
          setVenueId(link.venue_id);
        }
      } finally {
        setVenueLoading(false);
      }
    };

    void resolveVenue();
  }, [venueId]);

  const { orders, stats, updateOrderStatus, loading } = useVenueOrdersDB(venueId);
  const {
    deliveryOrders,
    acceptDeliveryOrder,
    rejectDeliveryOrder,
    markReadyForPickup,
  } = useVenueDeliveryOrders(venueId);

  useDeliveryNotification({ venueId, enabled: true });

  const isFuturePreOrder = useCallback((order: Order) => {
    if (!order.isPreorder || !order.scheduledFor) return false;

    try {
      const scheduledDate = parseISO(order.scheduledFor);
      return !isToday(scheduledDate) && scheduledDate > new Date();
    } catch {
      return false;
    }
  }, []);

  const acceptPreOrder = useCallback(async (orderId: string) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "preparing" })
        .eq("id", orderId);

      if (error) throw error;
      toast.success("Pre-order accepted!");
    } catch (error) {
      console.error("Error accepting pre-order:", error);
      toast.error("Failed to accept pre-order");
    }
  }, []);

  const filterCounts = useMemo(() => {
    const counts: Record<Exclude<OrderFilter, "active">, number> = {
      pending: 0,
      preparing: 0,
      ready: 0,
      completed: 0,
    };

    orders.forEach((order) => {
      counts[getFilterStatus(order, deliveryOrders.get(order.id))] += 1;
    });

    return {
      ...counts,
      active: counts.pending + counts.preparing + counts.ready,
    };
  }, [deliveryOrders, orders]);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    return orders.filter((order) => {
      const delivery = deliveryOrders.get(order.id);
      const orderStatus = getFilterStatus(order, delivery);
      const matchesFilter = filter === "active" ? orderStatus !== "completed" : orderStatus === filter;

      const matchesServiceFilter = (() => {
        switch (serviceFilter) {
          case "dine-in":
            return !delivery && (Boolean(order.tableNumber) || Boolean(order.isPreorder));
          case "delivery":
            return Boolean(delivery);
          case "upcoming":
            return isUpcomingPreOrder(order);
          case "past":
            return order.createdAt < todayIso && (order.status === "served" || order.status === "cancelled");
          default:
            return true;
        }
      })();

      if (!matchesFilter || !matchesServiceFilter) return false;
      if (!query) return true;

      const searchableText = [
        order.orderNumber,
        order.customerName,
        order.tableNumber,
        delivery?.customerName,
        delivery?.deliveryAddress,
        delivery?.status,
        order.isPreorder ? "pre-order" : "",
      ].filter(Boolean).join(" ").toLowerCase();

      return searchableText.includes(query);
    });
  }, [deliveryOrders, filter, orders, searchQuery, serviceFilter]);

  const selectedOrder = filteredOrders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0] ?? null;
  const selectedDelivery = selectedOrder ? deliveryOrders.get(selectedOrder.id) : undefined;

  const selectedNotes = useMemo(() => {
    if (!selectedOrder) return [];

    const itemNotes = selectedOrder.items
      .map((item) => item.notes?.trim())
      .filter((note): note is string => Boolean(note));
    const scheduledTime = formatScheduledTime(selectedOrder.scheduledFor);
    const notes = [
      selectedDelivery?.specialInstructions?.trim(),
      ...itemNotes,
      scheduledTime ? `Scheduled for ${scheduledTime}.` : null,
    ].filter((note): note is string => Boolean(note));

    return [...new Set(notes)];
  }, [selectedDelivery, selectedOrder]);

  const getAdvanceAction = (order: Order, delivery?: DeliveryOrderDetails): AdvanceAction | null => {
    if (delivery) {
      if (delivery.status === "pending") {
        return {
          label: "Accept delivery",
          icon: Check,
          onClick: () => void acceptDeliveryOrder(delivery.id, order.id),
        };
      }

      if (["venue_confirmed", "driver_assigned"].includes(delivery.status)) {
        return {
          label: "Ready for pickup",
          icon: PackageCheck,
          onClick: () => void markReadyForPickup(delivery.id, order.id),
        };
      }

      return null;
    }

    if (order.status === "pending") {
      if (isFuturePreOrder(order)) {
        return {
          label: "Accept pre-order",
          icon: Check,
          onClick: () => void acceptPreOrder(order.id),
        };
      }

      return {
        label: "Start preparing",
        icon: ChefHat,
        onClick: () => void updateOrderStatus(order.id, "preparing"),
      };
    }

    if (order.status === "preparing" && !isFuturePreOrder(order)) {
      return {
        label: "Mark ready",
        icon: PackageCheck,
        onClick: () => void updateOrderStatus(order.id, "ready"),
      };
    }

    if (order.status === "ready") {
      return {
        label: "Complete order",
        icon: CircleCheck,
        onClick: () => void updateOrderStatus(order.id, "served"),
      };
    }

    return null;
  };

  if (venueLoading || (loading && orders.length === 0)) {
    return (
      <div className="venue-orders-page venue-orders-page--loading">
        <div className="venue-orders-loading-state">
          <RefreshCw aria-hidden="true" />
          <p>Loading orders...</p>
        </div>
      </div>
    );
  }

  const filterTabs: { value: OrderFilter; label: string; count?: number }[] = [
    { value: "active", label: "Active", count: filterCounts.active },
    { value: "pending", label: "New", count: filterCounts.pending },
    { value: "preparing", label: "Preparing" },
    { value: "ready", label: "Ready" },
    { value: "completed", label: "Completed" },
  ];
  const selectedAction = selectedOrder ? getAdvanceAction(selectedOrder, selectedDelivery) : null;
  const SelectedActionIcon = selectedAction?.icon;
  const selectedStatus = selectedOrder ? getOrderStatus(selectedOrder, selectedDelivery) : null;
  const selectedContext = selectedOrder ? getOrderContext(selectedOrder, selectedDelivery) : null;

  return (
    <div className="venue-orders-page">
      <header className="venue-orders-heading">
        <div>
          <h1>Orders</h1>
          <p>Monitor and move guest orders through service.</p>
        </div>
        <span className="venue-orders-live">
          <Radio aria-hidden="true" />
          Live service
        </span>
      </header>

      <section className="venue-orders-metrics" aria-label="Today's order summary">
        {[
          { label: "New orders", count: stats.pending, icon: Inbox },
          { label: "Preparing", count: stats.preparing, icon: ChefHat },
          { label: "Ready to serve", count: stats.ready, icon: PackageCheck },
          { label: "Completed today", count: stats.servedToday, icon: CircleCheck },
        ].map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <article key={metric.label} className="venue-orders-metric">
              <span className="venue-orders-metric__icon">
                <MetricIcon aria-hidden="true" />
              </span>
              <div>
                <strong>{metric.count}</strong>
                <span>{metric.label}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="venue-orders-tools" aria-label="Order filters">
        <div className="venue-orders-tabs" role="tablist" aria-label="Order status">
          {filterTabs.map((tab) => {
            const isActive = filter === tab.value;
            return (
              <button
                key={tab.value}
                className={`venue-orders-tab${isActive ? " venue-orders-tab--active" : ""}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter(tab.value)}
              >
                {tab.label}
                {tab.count !== undefined && <b>{tab.count}</b>}
              </button>
            );
          })}
        </div>
        <div className="venue-orders-tools__actions">
          <label className="venue-orders-service-filter" htmlFor="venue-orders-service-filter">
            <SlidersHorizontal aria-hidden="true" />
            <select
              id="venue-orders-service-filter"
              aria-label="Filter by service type"
              value={serviceFilter}
              onChange={(event) => {
                const nextFilter = event.target.value as ServiceFilter;
                setServiceFilter(nextFilter);
                if (nextFilter === "past") setFilter("completed");
              }}
            >
              <option value="all">All service</option>
              <option value="dine-in">Dine-in</option>
              <option value="delivery">Delivery</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past orders</option>
            </select>
          </label>
          <label className="venue-orders-search" htmlFor="venue-orders-search">
            <Search aria-hidden="true" />
            <input
              id="venue-orders-search"
              type="search"
              placeholder="Find order or guest"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="venue-orders-workspace">
        <section className="venue-orders-card venue-orders-list" aria-labelledby="venue-order-queue-title">
          <div className="venue-orders-list__heading">
            <div>
              <p className="venue-orders-eyebrow">SERVICE QUEUE</p>
              <h2 id="venue-order-queue-title">
                {filter === "active" ? "Active orders" : `${filterTabs.find((tab) => tab.value === filter)?.label} orders`}
                <span>{filteredOrders.length}</span>
              </h2>
            </div>
            <span>{filteredOrders.length ? `${filteredOrders.length} ${filteredOrders.length === 1 ? "order" : "orders"} in view` : "No orders in view"}</span>
          </div>

          {filteredOrders.length > 0 ? (
            <div className="venue-orders-list__rows">
              <div className="venue-orders-list__columns" aria-hidden="true">
                <span>Order</span>
                <span>Amount</span>
                <span>Status</span>
              </div>
              {filteredOrders.map((order) => {
                const delivery = deliveryOrders.get(order.id);
                const context = getOrderContext(order, delivery);
                const ContextIcon = context.icon;
                const status = getOrderStatus(order, delivery);
                const isSelected = order.id === selectedOrder?.id;
                const guestName = delivery?.customerName || order.customerName || "Guest";

                return (
                  <article key={order.id} className={`venue-orders-row${isSelected ? " venue-orders-row--selected" : ""}`}>
                    <button
                      className="venue-orders-row__main"
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Open order ${order.orderNumber} for ${guestName}`}
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <span className="venue-orders-row__number">#{order.orderNumber}</span>
                      <span className="venue-orders-row__guest">
                        <strong>{guestName}</strong>
                        <small>
                          <ContextIcon aria-hidden="true" />
                          {context.location}
                          <span aria-hidden="true">.</span>
                          {formatOrderTime(order.createdAt)}
                        </small>
                      </span>
                    </button>
                    <span className="venue-orders-row__summary">
                      <strong>{formatCurrency(order.total)}</strong>
                      <small>{order.items.length} {order.items.length === 1 ? "item" : "items"}</small>
                    </span>
                    <span className={`venue-orders-status venue-orders-status--${status.tone}`}>{status.label}</span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="venue-orders-empty-state">
              <Inbox aria-hidden="true" />
              <h3>No orders in this view</h3>
              <p>Orders from the POS and guest checkout will appear here.</p>
            </div>
          )}
        </section>

        <aside className="venue-orders-card venue-orders-detail" aria-live="polite" aria-labelledby="venue-order-detail-title">
          {selectedOrder && selectedStatus && selectedContext ? (
            <>
              <div className="venue-orders-detail__heading">
                <div>
                  <p className="venue-orders-eyebrow">SELECTED ORDER</p>
                  <h2 id="venue-order-detail-title">#{selectedOrder.orderNumber}</h2>
                </div>
                <span className={`venue-orders-status venue-orders-status--${selectedStatus.tone}`}>{selectedStatus.label}</span>
              </div>

              <div className="venue-orders-detail__customer">
                <span><UserRound aria-hidden="true" /></span>
                <div>
                  <strong>{selectedDelivery?.customerName || selectedOrder.customerName || "Guest"}</strong>
                  <small>{selectedContext.label} <span aria-hidden="true">.</span> {selectedContext.location}</small>
                </div>
              </div>

              <dl className="venue-orders-detail__meta">
                <div>
                  <dt>Placed</dt>
                  <dd>{formatOrderTime(selectedOrder.createdAt)}</dd>
                </div>
                <div>
                  <dt>Items</dt>
                  <dd>{selectedOrder.items.length}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatCurrency(selectedOrder.total)}</dd>
                </div>
              </dl>

              {selectedDelivery && (
                <div className="venue-orders-detail__delivery">
                  <MapPin aria-hidden="true" />
                  <div>
                    <strong>{selectedDelivery.deliveryAddress || "Delivery address pending"}</strong>
                    <span>
                      {selectedDelivery.driverId ? "Driver assigned" : "Waiting for driver"}
                      {selectedDelivery.deliveryFee > 0 && ` - ${formatCurrency(selectedDelivery.deliveryFee)} delivery`}
                    </span>
                  </div>
                </div>
              )}

              <section className="venue-orders-detail__items" aria-label="Order items">
                <div>
                  <strong>Order items</strong>
                  <span>{selectedOrder.items.length} {selectedOrder.items.length === 1 ? "item" : "items"}</span>
                </div>
                <ul>
                  {selectedOrder.items.map((item) => (
                    <li key={item.id}>
                      <b>{item.quantity}</b>
                      <span>{item.name}</span>
                      <strong>{formatCurrency(item.price * item.quantity)}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              {selectedNotes.length > 0 && (
                <div className="venue-orders-note">
                  <Clock aria-hidden="true" />
                  <p>{selectedNotes.join(" ")}</p>
                </div>
              )}

              {selectedAction && SelectedActionIcon ? (
                <div className="venue-orders-detail__actions">
                  <button className="venue-orders-primary-button" type="button" onClick={selectedAction.onClick}>
                    <SelectedActionIcon aria-hidden="true" />
                    <span>{selectedAction.label}</span>
                  </button>
                  {selectedDelivery?.status === "pending" && (
                    <button
                      className="venue-orders-secondary-button venue-orders-secondary-button--danger"
                      type="button"
                      onClick={() => void rejectDeliveryOrder(selectedDelivery.id, selectedOrder.id)}
                    >
                      <X aria-hidden="true" />
                      <span>Reject</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="venue-orders-detail__complete-state">
                  <CircleCheck aria-hidden="true" />
                  <span>{selectedStatus.tone === "completed" ? "Order closed" : "Order is awaiting the next service update"}</span>
                </div>
              )}
            </>
          ) : (
            <div className="venue-orders-detail__empty">
              <UserRound aria-hidden="true" />
              <h2 id="venue-order-detail-title">No order selected</h2>
              <p>Choose an order from the queue to review its details.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
