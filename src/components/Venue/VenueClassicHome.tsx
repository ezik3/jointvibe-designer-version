import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bike,
  ChefHat,
  Clock3,
  MessageCircle,
  Radio,
  ReceiptText,
  Send,
  Store,
  Table2,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import VenueHomeModeToggle, { type VenueHomeMode } from "./VenueHomeModeToggle";
import "./venue-classic-home.css";

interface QueueOrder {
  id: string;
  orderNumber: number;
  tableNumber: string;
  customerName?: string;
  status: string;
  createdAt: string;
}

interface LiveActivityItem {
  id: string;
  action: string;
  user: string;
  time: string;
}

interface ClassicGuest {
  id: string;
  name: string;
  table: string;
}

interface VenueClassicHomeProps {
  venueName: string;
  homeMode: VenueHomeMode;
  onHomeModeChange: (mode: VenueHomeMode) => void;
  isLive: boolean;
  revenueToday: number;
  revenueComparisonBase: number;
  revenueComparisonLabel: string;
  activeOrders: number;
  pendingOrders: number;
  averageWaitMinutes: number;
  checkedInCount: number;
  maxCapacity: number;
  activeDeliveryCount: number;
  unreadMessageCount: number;
  queueOrders: QueueOrder[];
  liveActivity: LiveActivityItem[];
  guests: ClassicGuest[];
  canViewInternalPatrons: boolean;
  lastUpdatedAt: string;
  onOpenSettings: () => void;
  onOpenOrders: () => void;
  onOpenKitchen: () => void;
  onOpenDeliveries: () => void;
  onOpenTables: () => void;
  onOpenMessages: () => void;
  onPushDeal: () => void;
}

interface FloorAction {
  id: string;
  label: string;
  detail: string;
  Icon: LucideIcon;
  count?: number;
  onClick: () => void;
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getStatusLabel(status: string) {
  return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "New";
}

function getUpdatedLabel(value: string) {
  if (value.includes("less than a minute")) {
    return "just now";
  }

  return value.replace(/^about\s+/i, "");
}

export default function VenueClassicHome({
  venueName,
  homeMode,
  onHomeModeChange,
  isLive,
  revenueToday,
  revenueComparisonBase,
  revenueComparisonLabel,
  activeOrders,
  pendingOrders,
  averageWaitMinutes,
  checkedInCount,
  maxCapacity,
  activeDeliveryCount,
  unreadMessageCount,
  queueOrders,
  liveActivity,
  guests,
  canViewInternalPatrons,
  lastUpdatedAt,
  onOpenSettings,
  onOpenOrders,
  onOpenKitchen,
  onOpenDeliveries,
  onOpenTables,
  onOpenMessages,
  onPushDeal,
}: VenueClassicHomeProps) {
  const revenueDelta = revenueToday - revenueComparisonBase;
  const revenueDeltaPct = revenueComparisonBase > 0 ? (revenueDelta / revenueComparisonBase) * 100 : 0;
  const revenueTrend = revenueComparisonBase > 0
    ? `${Math.abs(revenueDeltaPct).toFixed(1)}% ${revenueDelta >= 0 ? "from" : "below"} ${revenueComparisonLabel}`
    : "Live revenue total";
  const updatedLabel = getUpdatedLabel(lastUpdatedAt);
  const floorActions: FloorAction[] = [
    {
      id: "orders",
      label: "Live orders",
      detail: activeOrders > 0 ? `${activeOrders} in service` : "No orders in service",
      Icon: ReceiptText,
      count: activeOrders,
      onClick: onOpenOrders,
    },
    {
      id: "kitchen",
      label: "Kitchen",
      detail: pendingOrders > 0 ? `${pendingOrders} in queue` : "Queue clear",
      Icon: ChefHat,
      count: pendingOrders,
      onClick: onOpenKitchen,
    },
    {
      id: "delivery",
      label: "Deliveries",
      detail: activeDeliveryCount > 0 ? `${activeDeliveryCount} in progress` : "No active deliveries",
      Icon: Bike,
      count: activeDeliveryCount,
      onClick: onOpenDeliveries,
    },
    {
      id: "tables",
      label: "Tables",
      detail: checkedInCount > 0 ? `${checkedInCount} guests seated` : "Floor ready",
      Icon: Table2,
      onClick: onOpenTables,
    },
    {
      id: "messages",
      label: "Messages",
      detail: unreadMessageCount > 0 ? `${unreadMessageCount} unread` : "Inbox clear",
      Icon: MessageCircle,
      count: unreadMessageCount,
      onClick: onOpenMessages,
    },
    {
      id: "deals",
      label: "Push deal",
      detail: "Reach guests",
      Icon: Send,
      onClick: onPushDeal,
    },
  ];

  return (
    <main className="venue-classic-home">
      <section className="venue-classic-home__heading">
        <div>
          <p className="venue-classic-home__eyebrow">Classic workspace</p>
          <h1>Service overview</h1>
          <p>Keep the floor, kitchen, and guests moving from one place.</p>
        </div>
        <VenueHomeModeToggle
          mode={homeMode}
          onChange={onHomeModeChange}
          className="venue-classic-home__mode-toggle"
        />
      </section>

      <section className="venue-classic-home__summary" aria-label="Today at a glance">
        <article>
          <span>Today&apos;s revenue</span>
          <strong>{formatCurrency(revenueToday)}</strong>
          <small><TrendingUp aria-hidden="true" />{revenueTrend}</small>
        </article>
        <article>
          <span>Active orders</span>
          <strong>{activeOrders}</strong>
          <small>{activeOrders === 0 ? "No orders in service" : "Accepted and in progress"}</small>
        </article>
        <article>
          <span>Average wait</span>
          <strong>{averageWaitMinutes} min</strong>
          <small>{averageWaitMinutes <= 15 ? "Within your target time" : "Review kitchen pace"}</small>
        </article>
        <article>
          <span>Guests here</span>
          <strong>{checkedInCount} <em>/ {maxCapacity}</em></strong>
          <small>{checkedInCount === 0 ? "No check-ins yet" : "Live check-in count"}</small>
        </article>
      </section>

      <section className="venue-classic-home__layout">
        <section className="venue-classic-home__panel venue-classic-home__floor" aria-labelledby="venue-classic-floor-title">
          <div className="venue-classic-home__panel-heading">
            <div>
              <p className="venue-classic-home__eyebrow">Live operations</p>
              <h2 id="venue-classic-floor-title">Your venue floor</h2>
            </div>
            <span className="venue-classic-home__live"><Radio aria-hidden="true" />{isLive ? "Live" : "Testing"}</span>
          </div>

          <div className="venue-classic-home__floor-board">
            <article className="venue-classic-home__floor-hub">
              <span><Store aria-hidden="true" /></span>
              <div>
                <strong>{venueName}</strong>
                <small>{isLive ? "Open live" : "Open for testing"}</small>
              </div>
              <button type="button" onClick={onOpenSettings}>
                Venue settings<ArrowRight aria-hidden="true" />
              </button>
            </article>

            <div className="venue-classic-home__command-grid" aria-label="Venue services">
              {floorActions.map(({ id, label, detail, Icon, count, onClick }) => (
                <button className={`venue-classic-home__floor-action venue-classic-home__floor-action--${id}`} key={id} type="button" onClick={onClick}>
                  <span>
                    <Icon aria-hidden="true" />
                    {typeof count === "number" && count > 0 && <b>{count}</b>}
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </div>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="venue-classic-home__panel venue-classic-home__queue" aria-labelledby="venue-classic-queue-title">
          <div className="venue-classic-home__panel-heading">
            <div>
              <p className="venue-classic-home__eyebrow">Up next</p>
              <h2 id="venue-classic-queue-title">Service queue</h2>
            </div>
            <button className="venue-classic-home__icon-button" type="button" onClick={onOpenOrders} aria-label="Open orders" title="Open orders">
              <ArrowUpRight aria-hidden="true" />
            </button>
          </div>

          {queueOrders.length === 0 ? (
            <div className="venue-classic-home__queue-empty">
              <span><ReceiptText aria-hidden="true" /></span>
              <strong>No new orders</strong>
              <p>New activity will appear here as guests place orders.</p>
            </div>
          ) : (
            <div className="venue-classic-home__queue-list">
              {queueOrders.map((order) => (
                <button key={order.id} type="button" onClick={onOpenOrders}>
                  <div>
                    <strong>#{order.orderNumber}</strong>
                    <span>{order.customerName || order.tableNumber || "Guest"}</span>
                  </div>
                  <div>
                    <small>{formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}</small>
                    <b>{getStatusLabel(order.status)}</b>
                  </div>
                </button>
              ))}
            </div>
          )}

          <footer>
            <span><Clock3 aria-hidden="true" />Last updated {updatedLabel}</span>
            <button type="button" onClick={onOpenOrders}>View orders<ArrowRight aria-hidden="true" /></button>
          </footer>
        </aside>
      </section>

      <section className="venue-classic-home__bottom-grid">
        <section className="venue-classic-home__panel" aria-labelledby="venue-classic-activity-title">
          <div className="venue-classic-home__panel-heading">
            <div>
              <p className="venue-classic-home__eyebrow">Pulse</p>
              <h2 id="venue-classic-activity-title">Live activity</h2>
            </div>
            <button className="venue-classic-home__secondary-button" type="button" onClick={onOpenOrders}>View all</button>
          </div>
          {liveActivity.length === 0 ? (
            <div className="venue-classic-home__empty-inline"><Activity aria-hidden="true" /><span>No recent activity</span></div>
          ) : (
            <div className="venue-classic-home__activity-list">
              {liveActivity.slice(0, 3).map((activity) => (
                <article key={activity.id}>
                  <span aria-hidden="true" />
                  <div><strong>{activity.action}</strong><small>{activity.user}</small></div>
                  <time>{activity.time}</time>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="venue-classic-home__panel" aria-labelledby="venue-classic-guests-title">
          <div className="venue-classic-home__panel-heading">
            <div>
              <p className="venue-classic-home__eyebrow">Guests</p>
              <h2 id="venue-classic-guests-title">Who&apos;s here</h2>
            </div>
            <strong>{checkedInCount} checked in</strong>
          </div>
          {!canViewInternalPatrons ? (
            <div className="venue-classic-home__empty-inline"><UsersRound aria-hidden="true" /><span>Guest visibility is unavailable for this role.</span></div>
          ) : guests.length === 0 ? (
            <div className="venue-classic-home__empty-inline"><UsersRound aria-hidden="true" /><span>Your guest list is clear</span></div>
          ) : (
            <div className="venue-classic-home__guest-list">
              {guests.slice(0, 4).map((guest) => (
                <article key={guest.id}>
                  <span>{guest.name.slice(0, 1).toUpperCase()}</span>
                  <strong>{guest.name}</strong>
                  <small>{guest.table ? `Table ${guest.table}` : "Checked in"}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
