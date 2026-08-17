import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Armchair,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarIcon,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClockAlert,
  FileClock,
  PackageCheck,
  Plus,
  Radio,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Timer,
  TrendingUp,
} from "lucide-react";
import {
  endOfDay,
  format,
  formatDistanceToNow,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type Order, useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import { getUrgencyBadge } from "@/utils/orderUrgency";
import "./pos-dashboard.css";

type DatePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "custom";

const ACTIVE_STATUSES: Order["status"][] = ["pending", "preparing", "ready"];

function getTicketContext(order: Order) {
  if (order.tableNumber) {
    return { label: `Table ${order.tableNumber}`, service: "Dine-in", Icon: Armchair };
  }

  return {
    label: order.customerName || "Walk-in",
    service: "Walk-in",
    Icon: ShoppingBag,
  };
}

function getTicketStatus(order: Order) {
  switch (order.status) {
    case "pending":
      return { label: "New", className: "pos-dashboard-status--new" };
    case "preparing":
      return { label: "Preparing", className: "pos-dashboard-status--preparing" };
    case "ready":
      return { label: "Ready", className: "pos-dashboard-status--ready" };
    case "served":
      return { label: "Completed", className: "pos-dashboard-status--completed" };
    case "cancelled":
      return { label: "Cancelled", className: "pos-dashboard-status--cancelled" };
  }
}

function getActivity(order: Order) {
  switch (order.status) {
    case "ready":
      return { label: `Order #${order.orderNumber} marked ready`, Icon: CircleCheck };
    case "preparing":
      return { label: `Kitchen started order #${order.orderNumber}`, Icon: ChefHat };
    case "served":
      return { label: `Order #${order.orderNumber} completed`, Icon: CircleCheck };
    case "cancelled":
      return { label: `Order #${order.orderNumber} cancelled`, Icon: ClockAlert };
    default:
      return { label: `New order #${order.orderNumber} received`, Icon: ReceiptText };
  }
}

function formatOrderAge(createdAt: string) {
  try {
    return formatDistanceToNow(new Date(createdAt), { addSuffix: true });
  } catch {
    return "Just now";
  }
}

function formatActivityTime(createdAt: string) {
  try {
    return format(new Date(createdAt), "h:mm a");
  } catch {
    return "Now";
  }
}

export default function Dashboard() {
  const { t } = useTranslation("pos");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("JointVibe");
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    const storedVenueId = localStorage.getItem("jv_current_venue_id");
    const storedVenueName = localStorage.getItem("jv_current_venue_name");

    if (storedVenueId) setVenueId(storedVenueId);
    if (storedVenueName) setVenueName(storedVenueName);
  }, []);

  const { orders, stats, getRecentOrders, loading } = useVenueOrdersDB(venueId);

  const dateRange = useMemo(() => {
    const now = new Date();

    switch (preset) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now), label: t("todays_sales") };
      case "yesterday": {
        const yesterday = subDays(now, 1);
        return { from: startOfDay(yesterday), to: endOfDay(yesterday), label: t("yesterdays_sales") };
      }
      case "last7":
        return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), label: t("last_7_days") };
      case "last30":
        return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), label: t("last_30_days") };
      case "thisMonth":
        return { from: startOfMonth(now), to: endOfDay(now), label: t("this_month") };
      case "custom":
        return {
          from: customFrom ? startOfDay(customFrom) : startOfDay(now),
          to: customTo ? endOfDay(customTo) : endOfDay(now),
          label:
            customFrom && customTo
              ? `${format(customFrom, "MMM d")} - ${format(customTo, "MMM d")}`
              : t("custom_range"),
        };
      default:
        return { from: startOfDay(now), to: endOfDay(now), label: t("todays_sales") };
    }
  }, [customFrom, customTo, preset, t]);

  const recentOrders = getRecentOrders(5);
  const paidOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (!ACTIVE_STATUSES.includes(order.status)) return false;
        const createdAt = new Date(order.createdAt);
        return createdAt >= dateRange.from && createdAt <= dateRange.to;
      }),
    [dateRange, orders],
  );
  const openTicketCount = stats.pending + stats.preparing + stats.ready;
  const filteredRevenue = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const averageOrder = paidOrders.length > 0 ? filteredRevenue / paidOrders.length : 0;
  const waitingTickets = useMemo(
    () =>
      orders.filter(
        (order) =>
          ACTIVE_STATUSES.includes(order.status) && Date.now() - new Date(order.createdAt).getTime() >= 10 * 60 * 1000,
      ),
    [orders],
  );

  const handlePreset = (nextPreset: DatePreset) => {
    setPreset(nextPreset);
    setShowCalendar(false);
    if (nextPreset !== "custom") setPopoverOpen(false);
  };

  const handlePopoverChange = (open: boolean) => {
    setPopoverOpen(open);
    if (!open) setShowCalendar(false);
  };

  const hasAttentionTickets = waitingTickets.length > 0;
  const AlertIcon = hasAttentionTickets ? ClockAlert : CircleCheck;

  return (
    <div className="pos-dashboard-page">
      <header className="pos-dashboard-topbar">
        <div>
          <span>{venueName.toUpperCase()}</span>
          <strong>Point of Sale</strong>
        </div>
        <p className={loading ? "pos-dashboard-topbar__syncing" : undefined}>
          <CircleCheck />
          {loading ? "Syncing orders" : "Terminal ready"}
        </p>
      </header>

      <section className="pos-dashboard-heading">
        <div>
          <h1>POS overview</h1>
          <p>Track this shift&apos;s sales, tickets, and service pace.</p>
        </div>
        <Link className="pos-dashboard-button pos-dashboard-button--primary" to="/venue/pos/new-order">
          <Plus />
          <span>{t("new_order", { defaultValue: "New order" })}</span>
        </Link>
      </section>

      <section className="pos-dashboard-metrics" aria-label="Current shift performance">
        <article className="pos-dashboard-card pos-dashboard-metric">
          <span className="pos-dashboard-metric__icon">
            <Banknote />
          </span>
          <div>
            <Popover open={popoverOpen} onOpenChange={handlePopoverChange}>
              <PopoverTrigger asChild>
                <button
                  className="pos-dashboard-date-trigger"
                  type="button"
                  aria-label="Change reporting date range"
                >
                  <small>{dateRange.label}</small>
                  <ChevronDown />
                </button>
              </PopoverTrigger>
              <PopoverContent className="pos-dashboard-date-popover" align="start" sideOffset={8}>
                {!showCalendar ? (
                  <div className="pos-dashboard-date-options">
                    {(
                      [
                        ["today", t("today")],
                        ["yesterday", t("yesterday")],
                        ["last7", t("last_7_days")],
                        ["last30", t("last_30_days")],
                        ["thisMonth", t("this_month")],
                      ] as [DatePreset, string][]
                    ).map(([key, label]) => (
                      <button
                        className={preset === key ? "is-active" : undefined}
                        key={key}
                        type="button"
                        onClick={() => handlePreset(key)}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      className={preset === "custom" ? "is-active" : undefined}
                      type="button"
                      onClick={() => {
                        setPreset("custom");
                        setShowCalendar(true);
                      }}
                    >
                      <CalendarIcon />
                      {t("custom_range")}
                    </button>
                  </div>
                ) : (
                  <div className="pos-dashboard-calendar-picker">
                    <p>
                      <span>{t("from_label")}: {customFrom ? format(customFrom, "MMM d, yyyy") : t("select")}</span>
                      <span>{t("to_label")}: {customTo ? format(customTo, "MMM d, yyyy") : t("select")}</span>
                    </p>
                    <Calendar
                      className="pos-dashboard-calendar"
                      mode="range"
                      numberOfMonths={1}
                      onSelect={(range) => {
                        setCustomFrom(range?.from);
                        setCustomTo(range?.to);
                      }}
                      selected={customFrom ? { from: customFrom, to: customTo } : undefined}
                    />
                    <div className="pos-dashboard-calendar-actions">
                      <button type="button" onClick={() => setShowCalendar(false)}>
                        {t("common:app.back")}
                      </button>
                      <button
                        className="pos-dashboard-button pos-dashboard-button--primary"
                        disabled={!customFrom || !customTo}
                        type="button"
                        onClick={() => setPopoverOpen(false)}
                      >
                        {t("apply")}
                      </button>
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <strong>${filteredRevenue.toFixed(2)}</strong>
            <p>
              <TrendingUp />
              {paidOrders.length} paid {paidOrders.length === 1 ? "order" : "orders"}
            </p>
          </div>
        </article>

        <article className="pos-dashboard-card pos-dashboard-metric">
          <span className="pos-dashboard-metric__icon">
            <ReceiptText />
          </span>
          <div>
            <small>Open tickets</small>
            <strong>{openTicketCount}</strong>
            <p>{hasAttentionTickets ? `${waitingTickets.length} need kitchen attention` : "Kitchen queue is on pace"}</p>
          </div>
        </article>

        <article className="pos-dashboard-card pos-dashboard-metric">
          <span className="pos-dashboard-metric__icon">
            <Timer />
          </span>
          <div>
            <small>{t("avg_order")}</small>
            <strong>${averageOrder.toFixed(2)}</strong>
            <p>{dateRange.label}</p>
          </div>
        </article>

        <article className="pos-dashboard-card pos-dashboard-metric">
          <span className="pos-dashboard-metric__icon">
            <CircleCheck />
          </span>
          <div>
            <small>Completed today</small>
            <strong>{stats.servedToday}</strong>
            <p>{loading ? "Refreshing terminal data" : "Live order status"}</p>
          </div>
        </article>
      </section>

      <section className="pos-dashboard-grid">
        <section className="pos-dashboard-card pos-dashboard-panel" aria-labelledby="recent-tickets-title">
          <header className="pos-dashboard-panel__header">
            <div>
              <h2 id="recent-tickets-title">Recent tickets</h2>
              <p>Latest orders from the POS terminal.</p>
            </div>
            <Link className="pos-dashboard-button pos-dashboard-button--secondary pos-dashboard-button--compact" to="/venue/pos/orders">
              <span>View orders</span>
              <ArrowUpRight />
            </Link>
          </header>

          {recentOrders.length === 0 ? (
            <div className="pos-dashboard-empty-state">
              <RefreshCw />
              <strong>{loading ? "Loading tickets" : t("no_recent_orders")}</strong>
              <p>{t("orders_appear_realtime")}</p>
            </div>
          ) : (
            <div className="pos-dashboard-ticket-list">
              {recentOrders.map((order) => {
                const context = getTicketContext(order);
                const urgency = getUrgencyBadge(order);
                const status = getTicketStatus(order);
                const ContextIcon = context.Icon;

                return (
                  <article className="pos-dashboard-ticket" key={order.id}>
                    <span className="pos-dashboard-ticket__number">#{order.orderNumber}</span>
                    <span className="pos-dashboard-ticket__context">
                      <strong>{context.label}</strong>
                      <small>
                        <ContextIcon />
                        {context.service} / {formatOrderAge(order.createdAt)}
                        {urgency.level === "now" || urgency.level === "soon" ? ` / ${urgency.label}` : ""}
                      </small>
                    </span>
                    <span className={`pos-dashboard-status ${status.className}`}>{status.label}</span>
                    <strong className="pos-dashboard-ticket__total">${order.total.toFixed(2)}</strong>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="pos-dashboard-card pos-dashboard-panel pos-dashboard-flow" aria-labelledby="service-flow-title">
          <header className="pos-dashboard-panel__header">
            <div>
              <h2 id="service-flow-title">Service flow</h2>
              <p>Current tickets by stage.</p>
            </div>
            <Link className="pos-dashboard-icon-button" to="/venue/pos/kitchen" aria-label="Open kitchen queue" title="Open kitchen queue">
              <ChefHat />
            </Link>
          </header>

          <div className="pos-dashboard-flow__stages">
            <Link to="/venue/pos/orders">
              <span className="pos-dashboard-flow__stage-icon"><FileClock /></span>
              <span><small>New</small><strong>{stats.pending}</strong></span>
              <ChevronRight />
            </Link>
            <Link to="/venue/pos/kitchen">
              <span className="pos-dashboard-flow__stage-icon"><ChefHat /></span>
              <span><small>Preparing</small><strong>{stats.preparing}</strong></span>
              <ChevronRight />
            </Link>
            <Link to="/venue/pos/kitchen">
              <span className="pos-dashboard-flow__stage-icon"><PackageCheck /></span>
              <span><small>Ready</small><strong>{stats.ready}</strong></span>
            </Link>
          </div>

          <div className={`pos-dashboard-alert ${hasAttentionTickets ? "" : "pos-dashboard-alert--clear"}`}>
            <AlertIcon />
            <div>
              <strong>
                {hasAttentionTickets
                  ? `${waitingTickets.length} ${waitingTickets.length === 1 ? "ticket is" : "tickets are"} waiting over 10 minutes`
                  : "All active tickets are within target time"}
              </strong>
              <p>{hasAttentionTickets ? "Review the kitchen queue to keep wait times on target." : "Kitchen service is currently on pace."}</p>
            </div>
            <Link to="/venue/pos/kitchen" aria-label="Review kitchen queue">
              <ArrowRight />
            </Link>
          </div>
        </section>
      </section>

      <section className="pos-dashboard-card pos-dashboard-panel pos-dashboard-shift" aria-labelledby="shift-title">
        <header className="pos-dashboard-panel__header">
          <div>
            <h2 id="shift-title">Shift activity</h2>
            <p>Latest live activity from this terminal.</p>
          </div>
          <span className="pos-dashboard-shift__live"><Radio />Live</span>
        </header>

        {recentOrders.length === 0 ? (
          <div className="pos-dashboard-empty-state pos-dashboard-empty-state--compact">
            <RefreshCw />
            <strong>{loading ? "Loading activity" : "No shift activity yet"}</strong>
          </div>
        ) : (
          <div className="pos-dashboard-timeline">
            {recentOrders.slice(0, 3).map((order) => {
              const activity = getActivity(order);
              const context = getTicketContext(order);
              const ActivityIcon = activity.Icon;

              return (
                <article key={order.id}>
                  <time>{formatActivityTime(order.createdAt)}</time>
                  <span><ActivityIcon /></span>
                  <div>
                    <strong>{activity.label}</strong>
                    <p>{context.label} / ${order.total.toFixed(2)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
