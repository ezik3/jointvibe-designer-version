import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Banknote,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Plus,
  ReceiptText,
  RefreshCw,
  Timer,
  TrendingUp,
} from "lucide-react";
import { addDays, endOfDay, format, startOfDay, subDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { type Order, useVenueOrdersDB } from "@/hooks/useVenueOrdersDB";
import "./pos-analytics.css";

type AnalyticsPeriod = "today" | "week" | "month";

interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

interface TrendPoint {
  label: string;
  revenue: number;
}

interface ServiceMixItem {
  label: "Table service" | "Pickup" | "Delivery";
  tone: "" | "muted" | "subtle";
  count: number;
}

interface TopItem {
  name: string;
  sales: number;
}

const PAID_STATUSES: Order["status"][] = ["preparing", "ready", "served"];
const ACTIVE_STATUSES: Order["status"][] = ["pending", "preparing", "ready"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function isOrderInRange(order: Order, range: DateRange) {
  const createdAt = new Date(order.createdAt);
  return !Number.isNaN(createdAt.getTime()) && createdAt >= range.start && createdAt <= range.end;
}

function totalSalesBetween(orders: Order[], start: Date, end: Date) {
  return orders.reduce((total, order) => {
    const createdAt = new Date(order.createdAt);
    return createdAt >= start && createdAt <= end ? total + order.total : total;
  }, 0);
}

function getServiceLabel(order: Order): ServiceMixItem["label"] {
  if (order.tableNumber === "Delivery") return "Delivery";
  if (order.tableNumber === "Takeaway") return "Pickup";
  return "Table service";
}

function getDateRange(period: AnalyticsPeriod): DateRange {
  const now = new Date();

  if (period === "week") {
    return { start: startOfDay(subDays(now, 6)), end: now, label: "Last 7 days" };
  }

  if (period === "month") {
    return { start: startOfDay(subDays(now, 29)), end: now, label: "Last 30 days" };
  }

  return { start: startOfDay(now), end: now, label: `Today, ${format(startOfDay(now), "h:mm a")} - now` };
}

function buildTrend(period: AnalyticsPeriod, orders: Order[], range: DateRange): TrendPoint[] {
  if (period === "today") {
    const endHour = new Date(range.end);
    endHour.setMinutes(0, 0, 0);

    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(endHour);
      start.setHours(endHour.getHours() - (6 - index));
      const end = new Date(start);
      end.setHours(start.getHours() + 1);
      end.setMilliseconds(-1);
      return { label: format(start, "h a"), revenue: totalSalesBetween(orders, start, end) };
    });
  }

  if (period === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const start = startOfDay(addDays(range.start, index));
      return { label: format(start, "EEE"), revenue: totalSalesBetween(orders, start, endOfDay(start)) };
    });
  }

  return Array.from({ length: 5 }, (_, index) => {
    const start = startOfDay(addDays(range.start, index * 6));
    const end = index === 4 ? range.end : endOfDay(addDays(start, 5));
    return {
      label: index === 4 ? "This week" : `Week ${index + 1}`,
      revenue: totalSalesBetween(orders, start, end),
    };
  });
}

export default function Analytics() {
  const { user } = useAuth();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("JointVibe");
  const [period, setPeriod] = useState<AnalyticsPeriod>("today");
  const [resolvingVenue, setResolvingVenue] = useState(true);

  useEffect(() => {
    let active = true;
    const storedVenueId = localStorage.getItem("jv_current_venue_id");
    const storedVenueName = localStorage.getItem("jv_current_venue_name");

    if (storedVenueName) setVenueName(storedVenueName);
    if (storedVenueId) {
      setVenueId(storedVenueId);
      setResolvingVenue(false);
      return () => {
        active = false;
      };
    }

    if (!user?.id) {
      setResolvingVenue(false);
      return () => {
        active = false;
      };
    }

    void supabase
      .from("venues")
      .select("id, name")
      .eq("owner_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data?.id) {
          setVenueId(data.id);
          setVenueName(data.name || "JointVibe");
          localStorage.setItem("jv_current_venue_id", data.id);
          localStorage.setItem("jv_current_venue_name", data.name || "JointVibe");
        }
        setResolvingVenue(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const { orders, loading } = useVenueOrdersDB(venueId);
  const dateRange = useMemo(() => getDateRange(period), [period]);
  const periodOrders = useMemo(
    () => orders.filter((order) => isOrderInRange(order, dateRange)),
    [dateRange, orders],
  );
  const paidOrders = useMemo(
    () => periodOrders.filter((order) => PAID_STATUSES.includes(order.status)),
    [periodOrders],
  );
  const activeOrders = useMemo(
    () => periodOrders.filter((order) => ACTIVE_STATUSES.includes(order.status)),
    [periodOrders],
  );
  const totalSales = useMemo(
    () => paidOrders.reduce((total, order) => total + order.total, 0),
    [paidOrders],
  );
  const averageOrderValue = paidOrders.length ? totalSales / paidOrders.length : 0;
  const trend = useMemo(() => buildTrend(period, paidOrders, dateRange), [dateRange, paidOrders, period]);
  const serviceMix = useMemo<ServiceMixItem[]>(() => {
    const counts: Record<ServiceMixItem["label"], number> = {
      "Table service": 0,
      Pickup: 0,
      Delivery: 0,
    };

    paidOrders.forEach((order) => {
      counts[getServiceLabel(order)] += 1;
    });

    return [
      { label: "Table service", count: counts["Table service"], tone: "" },
      { label: "Pickup", count: counts.Pickup, tone: "muted" },
      { label: "Delivery", count: counts.Delivery, tone: "subtle" },
    ];
  }, [paidOrders]);
  const topItems = useMemo<TopItem[]>(() => {
    const salesByItem = new Map<string, number>();

    paidOrders.forEach((order) => {
      order.items.forEach((item) => {
        const name = item.name || "Unnamed item";
        salesByItem.set(name, (salesByItem.get(name) || 0) + item.price * item.quantity);
      });
    });

    return Array.from(salesByItem, ([name, sales]) => ({ name, sales }))
      .sort((left, right) => right.sales - left.sales)
      .slice(0, 4);
  }, [paidOrders]);

  const peakTrendPoint = trend.reduce(
    (best, point) => point.revenue > best.revenue ? point : best,
    trend[0] || { label: "--", revenue: 0 },
  );
  const highestOrder = paidOrders.reduce((highest, order) => Math.max(highest, order.total), 0);
  const attentionCount = activeOrders.filter((order) => {
    const createdAt = new Date(order.createdAt).getTime();
    return !Number.isNaN(createdAt) && Date.now() - createdAt >= 10 * 60 * 1000;
  }).length;
  const maxTrendRevenue = Math.max(...trend.map((point) => point.revenue), 1);
  const maxMixCount = Math.max(...serviceMix.map((item) => item.count), 1);
  const maxItemSales = Math.max(...topItems.map((item) => item.sales), 1);
  const busyLabel = period === "today" ? "Busiest hour" : period === "week" ? "Busiest day" : "Busiest period";
  const loadingState = resolvingVenue || loading;

  return (
    <div className="pos-analytics-page">
      <header className="pos-analytics-topbar">
        <div>
          <span>{venueName.toUpperCase()}</span>
          <strong>Point of Sale</strong>
        </div>
        <p className={loadingState ? "is-syncing" : undefined}>
          <CheckCircle2 aria-hidden="true" />
          {loadingState ? "Syncing orders" : "Terminal ready"}
        </p>
      </header>

      <section className="pos-analytics-heading">
        <div>
          <h1>Sales analytics</h1>
          <p>Review POS performance and make faster service decisions.</p>
        </div>
        <Link className="pos-analytics-button pos-analytics-button--primary" to="/venue/pos/new-order">
          <Plus aria-hidden="true" />
          <span>New order</span>
        </Link>
      </section>

      <div className="pos-analytics-controls">
        <div className="pos-analytics-period-tabs" role="tablist" aria-label="Analytics period">
          {([
            ["today", "Today"],
            ["week", "Last 7 days"],
            ["month", "Last 30 days"],
          ] as Array<[AnalyticsPeriod, string]>).map(([id, label]) => (
            <button
              key={id}
              className={period === id ? "is-active" : undefined}
              type="button"
              role="tab"
              aria-selected={period === id}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="pos-analytics-updated"><RefreshCw className={loadingState ? "is-syncing" : undefined} aria-hidden="true" /><span>{dateRange.label}</span></p>
      </div>

      <section className="pos-analytics-metrics" aria-label="Sales performance">
        <article className="pos-analytics-card pos-analytics-metric">
          <div><span>Net sales</span><Banknote aria-hidden="true" /></div>
          <strong>{formatCurrency(totalSales)}</strong>
          <p><TrendingUp aria-hidden="true" /><span>{paidOrders.length} paid POS orders</span></p>
        </article>
        <article className="pos-analytics-card pos-analytics-metric">
          <div><span>Paid orders</span><ReceiptText aria-hidden="true" /></div>
          <strong>{paidOrders.length}</strong>
          <p>{activeOrders.length} orders still in service</p>
        </article>
        <article className="pos-analytics-card pos-analytics-metric">
          <div><span>Average order value</span><Calculator aria-hidden="true" /></div>
          <strong>{formatCurrency(averageOrderValue)}</strong>
          <p>Across paid tickets</p>
        </article>
        <article className="pos-analytics-card pos-analytics-metric">
          <div><span>Fastest service</span><Timer aria-hidden="true" /></div>
          <strong>--</strong>
          <p>Service duration is not tracked yet</p>
        </article>
      </section>

      <section className="pos-analytics-grid">
        <section className="pos-analytics-card pos-analytics-panel pos-analytics-sales-panel" aria-labelledby="pos-sales-trend-title">
          <header className="pos-analytics-panel__header">
            <div><h2 id="pos-sales-trend-title">Sales trend</h2><p>Revenue by service hour</p></div>
            <strong>{formatCurrency(totalSales)}</strong>
          </header>
          <div className="pos-analytics-sales-chart" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(32px, 1fr))` }} aria-label="Sales trend chart">
            {trend.map((point) => {
              const height = point.revenue ? `${Math.max((point.revenue / maxTrendRevenue) * 100, 4)}%` : "4px";
              return (
                <div key={point.label} className="pos-analytics-sales-chart__bar">
                  <span className="pos-analytics-sales-chart__value">{point.revenue ? formatCurrency(point.revenue) : ""}</span>
                  <div className="pos-analytics-sales-chart__track"><b className={point.revenue ? undefined : "is-empty"} style={{ height }} /></div>
                  <span className="pos-analytics-sales-chart__label">{point.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pos-analytics-card pos-analytics-panel" aria-labelledby="pos-service-mix-title">
          <header className="pos-analytics-panel__header"><div><h2 id="pos-service-mix-title">Service mix</h2><p>Order volume by fulfilment</p></div></header>
          <div className="pos-analytics-service-mix">
            {serviceMix.map((item) => (
              <div key={item.label} className="pos-analytics-service-mix__row">
                <div><b className={`pos-analytics-service-mix__dot${item.tone ? ` pos-analytics-service-mix__dot--${item.tone}` : ""}`} /><span>{item.label}</span></div>
                <strong>{item.count}</strong>
                <div className="pos-analytics-service-mix__track"><b className={item.tone ? `pos-analytics-service-mix__fill--${item.tone}` : undefined} style={{ width: `${(item.count / maxMixCount) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="pos-analytics-grid pos-analytics-grid--lower">
        <section className="pos-analytics-card pos-analytics-panel" aria-labelledby="pos-top-items-title">
          <header className="pos-analytics-panel__header">
            <div><h2 id="pos-top-items-title">Top items</h2><p>Most valuable menu items this period</p></div>
            <Link className="pos-analytics-button pos-analytics-button--secondary pos-analytics-button--compact" to="/venue/pos/menu"><span>Manage menu</span><ArrowUpRight aria-hidden="true" /></Link>
          </header>
          {topItems.length === 0 ? <p className="pos-analytics-empty">No paid orders in this period.</p> : (
            <div className="pos-analytics-item-performance">
              {topItems.map((item, index) => (
                <div key={item.name} className="pos-analytics-item-performance__row">
                  <span className="pos-analytics-item-performance__rank">{String(index + 1).padStart(2, "0")}</span>
                  <div className="pos-analytics-item-performance__copy"><span>{item.name}</span><div><b style={{ width: `${(item.sales / maxItemSales) * 100}%` }} /></div></div>
                  <strong>{formatCurrency(item.sales)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="pos-analytics-card pos-analytics-panel pos-analytics-service-panel" aria-labelledby="pos-service-summary-title">
          <header className="pos-analytics-panel__header"><div><h2 id="pos-service-summary-title">Service summary</h2><p>Where the shift is gaining momentum</p></div></header>
          <dl className="pos-analytics-service-summary">
            <div><dt>{busyLabel}</dt><dd>{peakTrendPoint.revenue ? peakTrendPoint.label : "--"}</dd></div>
            <div><dt>Highest order</dt><dd>{formatCurrency(highestOrder)}</dd></div>
            <div><dt>On-time service</dt><dd className="is-positive">Not tracked</dd></div>
            <div><dt>Orders needing attention</dt><dd>{attentionCount}</dd></div>
          </dl>
        </section>
      </section>
    </div>
  );
}
