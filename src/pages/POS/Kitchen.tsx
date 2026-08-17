import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair,
  CheckCheck,
  ChefHat,
  CircleCheck,
  Clock3,
  MessageSquare,
  Monitor,
  MonitorOff,
  Radio,
  ShoppingBag,
  Truck,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { type Order, useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import { useWakeLock } from "@/hooks/useWakeLock";
import { sortByUrgency } from "@/utils/orderUrgency";
import "./kitchen.css";

type KitchenFilter = "all" | "pending" | "preparing" | "ready";

interface TicketAction {
  label: string;
  nextStatus: "preparing" | "ready" | "served";
  Icon: LucideIcon;
  variant: "primary" | "secondary";
}

const kitchenFilters: Array<{ value: KitchenFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
];

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function getStoredVenueId() {
  const storedVenueIdRaw = localStorage.getItem("jv_current_venue_id");
  const storedVenueId = storedVenueIdRaw && isUuid(storedVenueIdRaw) ? storedVenueIdRaw : null;

  if (storedVenueIdRaw && !storedVenueId) {
    localStorage.removeItem("jv_current_venue_id");
  }

  return storedVenueId;
}

function getStatusPresentation(status: Order["status"]) {
  switch (status) {
    case "pending":
      return { label: "New", className: "pos-kitchen-status--new" };
    case "preparing":
      return { label: "Preparing", className: "pos-kitchen-status--preparing" };
    case "ready":
      return { label: "Ready", className: "pos-kitchen-status--ready" };
    case "served":
      return { label: "Completed", className: "pos-kitchen-status--completed" };
    case "cancelled":
      return { label: "Cancelled", className: "pos-kitchen-status--cancelled" };
  }
}

function getServicePresentation(order: Order): { label: string; Icon: LucideIcon } {
  const tableNumber = order.tableNumber.trim();

  if (/delivery/i.test(tableNumber)) {
    return { label: "Delivery", Icon: Truck };
  }

  if (/takeaway|pickup|collection/i.test(tableNumber)) {
    return { label: "Takeaway", Icon: ShoppingBag };
  }

  if (tableNumber) {
    return {
      label: tableNumber.startsWith("Table") ? tableNumber : `Table ${tableNumber}`,
      Icon: Armchair,
    };
  }

  return { label: "Walk-in", Icon: ShoppingBag };
}

function getTicketAction(status: Order["status"]): TicketAction | null {
  if (status === "pending") {
    return { label: "Start preparing", nextStatus: "preparing", Icon: ChefHat, variant: "primary" };
  }

  if (status === "preparing") {
    return { label: "Mark ready", nextStatus: "ready", Icon: CircleCheck, variant: "primary" };
  }

  if (status === "ready") {
    return { label: "Complete ticket", nextStatus: "served", Icon: CheckCheck, variant: "secondary" };
  }

  return null;
}

function getWaitMinutes(createdAt: string, now: number) {
  const createdAtTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdAtTime)) {
    return 0;
  }

  return Math.max(0, Math.floor((now - createdAtTime) / 60000));
}

function formatTicketTime(createdAt: string, now: number) {
  const minutes = getWaitMinutes(createdAt, now);

  if (minutes < 1) {
    return "Placed just now";
  }

  if (minutes < 60) {
    return `Placed ${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `Placed ${hours}h ${remainingMinutes}m ago`;
}

function KitchenTicket({
  order,
  now,
  onAdvance,
}: {
  order: Order;
  now: number;
  onAdvance: (order: Order, nextStatus: TicketAction["nextStatus"]) => void;
}) {
  const status = getStatusPresentation(order.status);
  const service = getServicePresentation(order);
  const action = getTicketAction(order.status);
  const ServiceIcon = service.Icon;
  const ActionIcon = action?.Icon;
  const notes = order.items
    .filter((item) => item.notes?.trim())
    .map((item) => `${item.name}: ${item.notes?.trim()}`);

  return (
    <article className="pos-kitchen-ticket">
      <header className="pos-kitchen-ticket__header">
        <div>
          <span className="pos-kitchen-ticket__number">#{order.orderNumber}</span>
          <span className="pos-kitchen-ticket__service">
            <ServiceIcon aria-hidden="true" />
            {service.label}
          </span>
        </div>
        <span className={`pos-kitchen-status ${status.className}`}>{status.label}</span>
      </header>

      <p className="pos-kitchen-ticket__meta">
        <Clock3 aria-hidden="true" />
        {formatTicketTime(order.createdAt, now)}
      </p>

      <ul>
        {order.items.length === 0 ? (
          <li>
            <span>Order details unavailable</span>
          </li>
        ) : (
          order.items.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <b>x{item.quantity}</b>
            </li>
          ))
        )}
      </ul>

      {notes.length > 0 && (
        <p className="pos-kitchen-ticket__note">
          <MessageSquare aria-hidden="true" />
          <span>{notes.join(" / ")}</span>
        </p>
      )}

      {action && ActionIcon && (
        <button
          className={`pos-kitchen-button pos-kitchen-ticket__action pos-kitchen-button--${action.variant}`}
          type="button"
          onClick={() => onAdvance(order, action.nextStatus)}
        >
          <ActionIcon aria-hidden="true" />
          <span>{action.label}</span>
        </button>
      )}
    </article>
  );
}

export default function Kitchen() {
  const [venueId] = useState<string | null>(getStoredVenueId);
  const [venueName, setVenueName] = useState("JointVibe");
  const [filter, setFilter] = useState<KitchenFilter>("all");
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [pinnedOrders, setPinnedOrders] = useState<Map<string, number>>(new Map());
  const pinnedTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const { isSupported: wakeLockSupported, isActive: wakeLockActive, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
  const { orders, updateOrderStatus, loading, stats } = useVenueOrdersDB(venueId);

  useEffect(() => {
    const storedVenueName = localStorage.getItem("jv_current_venue_name");
    if (storedVenueName) {
      setVenueName(storedVenueName);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const pinnedTimers = pinnedTimersRef.current;

    return () => {
      pinnedTimers.forEach((timer) => clearInterval(timer));
    };
  }, []);

  const pinOrder = useCallback((orderId: string) => {
    setPinnedOrders((current) => new Map(current).set(orderId, 10));

    const existingTimer = pinnedTimersRef.current.get(orderId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const timer = setInterval(() => {
      setPinnedOrders((current) => {
        const next = new Map(current);
        const remaining = (next.get(orderId) || 0) - 1;

        if (remaining <= 0) {
          next.delete(orderId);
          clearInterval(timer);
          pinnedTimersRef.current.delete(orderId);
        } else {
          next.set(orderId, remaining);
        }

        return next;
      });
    }, 1000);

    pinnedTimersRef.current.set(orderId, timer);
  }, []);

  const activeOrders = useMemo(
    () => orders.filter((order) => ["pending", "preparing", "ready"].includes(order.status)),
    [orders],
  );

  const filteredOrders = useMemo(
    () => (filter === "all" ? activeOrders : activeOrders.filter((order) => order.status === filter)),
    [activeOrders, filter],
  );

  const tickets = useMemo(() => {
    const sortedOrders = sortByUrgency(filteredOrders);

    if (pinnedOrders.size === 0) {
      return sortedOrders;
    }

    return [
      ...sortedOrders.filter((order) => pinnedOrders.has(order.id)),
      ...sortedOrders.filter((order) => !pinnedOrders.has(order.id)),
    ];
  }, [filteredOrders, pinnedOrders]);

  const counts = useMemo(
    () => ({
      all: activeOrders.length,
      pending: activeOrders.filter((order) => order.status === "pending").length,
      preparing: activeOrders.filter((order) => order.status === "preparing").length,
      ready: activeOrders.filter((order) => order.status === "ready").length,
    }),
    [activeOrders],
  );

  const averageWait = useMemo(() => {
    if (activeOrders.length === 0) {
      return 0;
    }

    const totalMinutes = activeOrders.reduce((total, order) => total + getWaitMinutes(order.createdAt, now), 0);
    return Math.round(totalMinutes / activeOrders.length);
  }, [activeOrders, now]);

  const handleAdvance = (order: Order, nextStatus: TicketAction["nextStatus"]) => {
    if (nextStatus === "ready") {
      pinOrder(order.id);
    }

    void updateOrderStatus(order.id, nextStatus);
    toast.success(`Order #${order.orderNumber} marked ${nextStatus}`);
  };

  const toggleWakeLock = async () => {
    if (wakeLockActive) {
      await releaseWakeLock();
      toast.info("Screen will now turn off normally");
      return;
    }

    const enabled = await requestWakeLock();
    if (enabled) {
      toast.success("Screen will stay on");
    } else {
      toast.error("Could not keep screen on");
    }
  };

  const queueDescription = loading
    ? "Loading kitchen tickets..."
    : tickets.length === 0
      ? "No tickets in this view."
      : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} ${filter === "all" ? "waiting for attention" : `in ${filter}`}.`;

  return (
    <div className="pos-kitchen-page">
      <header className="pos-kitchen-topbar">
        <div>
          <span>{venueName.toUpperCase()}</span>
          <strong>Point of Sale</strong>
        </div>
        <p className={loading ? "is-syncing" : undefined}>
          <Radio aria-hidden="true" />
          {loading ? "Syncing tickets" : "Kitchen online"}
        </p>
      </header>

      <section className="pos-kitchen-heading">
        <div className="pos-kitchen-heading__copy">
          <div className="pos-kitchen-heading__title-row">
            <h1>Kitchen queue</h1>
            <section className="pos-kitchen-summary" aria-label="Kitchen overview">
              <article className="pos-kitchen-summary__metric"><span>Open tickets</span><strong>{counts.all}</strong></article>
              <article className="pos-kitchen-summary__metric"><span>Average wait</span><strong>{averageWait} min</strong></article>
              <article className="pos-kitchen-summary__metric"><span>Completed today</span><strong>{stats.servedToday}</strong></article>
            </section>
          </div>
          <p>Prioritize open tickets and keep service moving.</p>
        </div>

        <div className="pos-kitchen-heading__actions">
          {wakeLockSupported && (
            <button
              className={`pos-kitchen-icon-button${wakeLockActive ? " is-active" : ""}`}
              type="button"
              onClick={() => void toggleWakeLock()}
              aria-label={wakeLockActive ? "Allow screen to sleep" : "Keep screen on"}
              aria-pressed={wakeLockActive}
              title={wakeLockActive ? "Allow screen to sleep" : "Keep screen on"}
            >
              {wakeLockActive ? <Monitor aria-hidden="true" /> : <MonitorOff aria-hidden="true" />}
            </button>
          )}
          <button
            className="pos-kitchen-button pos-kitchen-button--secondary"
            type="button"
            onClick={() => setIsSoundOn((enabled) => !enabled)}
            aria-pressed={isSoundOn}
          >
            {isSoundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            <span>{isSoundOn ? "Sound on" : "Sound off"}</span>
          </button>
        </div>
      </section>

      <section className="pos-kitchen-queue" aria-labelledby="pos-kitchen-queue-title">
        <div className="pos-kitchen-queue__header">
          <div>
            <h2 id="pos-kitchen-queue-title">Active tickets</h2>
            <p aria-live="polite">{queueDescription}</p>
          </div>
          <div className="pos-kitchen-tabs" role="tablist" aria-label="Kitchen ticket status">
            {kitchenFilters.map(({ value, label }) => (
              <button
                className={filter === value ? "is-active" : undefined}
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
                <span>{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && tickets.length === 0 ? (
          <div className="pos-kitchen-empty" role="status">
            <Radio aria-hidden="true" />
            <strong>Loading tickets</strong>
            <p>Waiting for the live kitchen queue.</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="pos-kitchen-empty">
            <CircleCheck aria-hidden="true" />
            <strong>No tickets in this view</strong>
            <p>New kitchen tickets will appear here automatically.</p>
          </div>
        ) : (
          <div className="pos-kitchen-grid">
            {tickets.map((order) => (
              <KitchenTicket key={order.id} order={order} now={now} onAdvance={handleAdvance} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
