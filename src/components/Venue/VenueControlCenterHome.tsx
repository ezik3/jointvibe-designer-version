import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bike,
  ChartNoAxesColumnIncreasing,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDot,
  CircleDollarSign,
  ChefHat,
  Clock3,
  Megaphone,
  MessageSquare,
  Monitor,
  Radio,
  ReceiptText,
  Rocket,
  Send,
  Sparkles,
  Table2,
  TrendingUp,
  UsersRound,
  Video,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import VenueHomeModeToggle, { type VenueHomeMode } from "./VenueHomeModeToggle";
import "./venue-control-center-home.css";

interface ReadinessItem {
  id: string;
  title: string;
  description: string;
  status: "done" | "todo" | "warning";
  actionLabel?: string;
  onAction?: () => void;
}

interface GrowthOpportunity {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  onClick: () => void;
}

interface QuickAccessItem {
  id: string;
  label: string;
  count?: number | null;
  onClick: () => void;
}

interface LiveActivityItem {
  id: string;
  action: string;
  user: string;
  time: string;
}

type PriorityLevel = "high" | "medium" | "opportunity";

interface VenueControlCenterHomeProps {
  venueName: string;
  homeMode: VenueHomeMode;
  onHomeModeChange: (mode: VenueHomeMode) => void;
  onOpenVibeRadar: () => void;
  isLive: boolean;
  revenueToday: number;
  revenueComparisonBase: number;
  revenueComparisonLabel: string;
  activeOrders: number;
  pendingOrders: number;
  kitchenQueue: number;
  checkedInCount: number;
  maxCapacity: number;
  creatorCheckIns: number;
  nearbyCreators: number;
  activeLiveStreams: number;
  currentlyAtCount: number;
  headingThereCount: number;
  maybeGoingCount: number;
  lastUpdatedAt: string;
  readinessItems: ReadinessItem[];
  growthOpportunities: GrowthOpportunity[];
  quickAccessItems: QuickAccessItem[];
  liveActivity: LiveActivityItem[];
}

const opportunityIcons: Record<string, LucideIcon> = {
  "push-deal": Send,
  vibes: Radio,
  referrals: TrendingUp,
};

const quickAccessIcons: Record<string, LucideIcon> = {
  pos: Monitor,
  orders: ReceiptText,
  deliveries: Bike,
  kitchen: ChefHat,
  tables: Table2,
  messages: MessageSquare,
  ai_assistant: Sparkles,
  push_deals: Send,
  wallet: Wallet,
  reservations: CheckCircle2,
};

function getOpportunityPriority(
  opportunity: GrowthOpportunity,
  metrics: { occupancyRate: number; activeOrders: number; pendingOrders: number },
): { level: PriorityLevel; score: number; reason: string } {
  const { occupancyRate, activeOrders, pendingOrders } = metrics;
  let score = 0;
  let reason = "Growth opportunity";

  if (occupancyRate < 0.35) {
    score += 3;
    reason = "Low occupancy detected";
  } else if (occupancyRate < 0.55) {
    score += 2;
    reason = "Capacity available to monetize";
  }

  if (activeOrders < 8) {
    score += 2;
    reason = "Order flow below target";
  }

  if (pendingOrders === 0) {
    score += 1;
  }

  if (opportunity.id === "push-deal" && (occupancyRate < 0.5 || activeOrders < 10)) {
    score += 3;
    reason = "Idle capacity can be activated quickly";
  }

  if (opportunity.id === "vibes" && activeOrders < 12) {
    score += 2;
    reason = "Demand signals can improve conversion";
  }

  if (opportunity.id === "referrals" && occupancyRate >= 0.55 && activeOrders >= 12) {
    score += 1;
    reason = "Scale awareness while momentum is strong";
  }

  if (score >= 6) return { level: "high", score, reason };
  if (score >= 4) return { level: "medium", score, reason };
  return { level: "opportunity", score, reason };
}

function priorityClass(level: PriorityLevel) {
  if (level === "high") return "venue-control-center__priority venue-control-center__priority--high";
  if (level === "medium") return "venue-control-center__priority venue-control-center__priority--medium";
  return "venue-control-center__priority venue-control-center__priority--opportunity";
}

function readinessStatusClass(status: ReadinessItem["status"]) {
  if (status === "done") return "venue-control-center__status-pill venue-control-center__status-pill--done";
  if (status === "warning") return "venue-control-center__status-pill venue-control-center__status-pill--attention";
  return "venue-control-center__status-pill venue-control-center__status-pill--todo";
}

export default function VenueControlCenterHome({
  venueName,
  homeMode,
  onHomeModeChange,
  onOpenVibeRadar,
  isLive,
  revenueToday,
  revenueComparisonBase,
  revenueComparisonLabel,
  activeOrders,
  pendingOrders,
  kitchenQueue,
  checkedInCount,
  maxCapacity,
  creatorCheckIns,
  nearbyCreators,
  activeLiveStreams,
  currentlyAtCount,
  headingThereCount,
  maybeGoingCount,
  lastUpdatedAt,
  readinessItems,
  growthOpportunities,
  quickAccessItems,
  liveActivity,
}: VenueControlCenterHomeProps) {
  const revenueDelta = revenueToday - revenueComparisonBase;
  const revenueDeltaPct = revenueComparisonBase > 0 ? (revenueDelta / revenueComparisonBase) * 100 : 0;
  const occupancyRate = maxCapacity > 0 ? Math.min(1, checkedInCount / maxCapacity) : 0;
  const totalMomentumSignals = currentlyAtCount + headingThereCount + maybeGoingCount;
  const intentSignals = headingThereCount + maybeGoingCount;
  const momentumLabel = (() => {
    if (totalMomentumSignals < 8) return "Weak";
    if (intentSignals >= Math.max(6, Math.round(currentlyAtCount * 0.6))) return "Rising";
    return "Steady";
  })();
  const updatedLabel = lastUpdatedAt.includes("less than a minute") ? "just now" : lastUpdatedAt.replace(/^about\s+/i, "");

  const prioritizedGrowth = [...growthOpportunities]
    .map((item) => ({
      ...item,
      priority: getOpportunityPriority(item, { occupancyRate, activeOrders, pendingOrders }),
    }))
    .sort((a, b) => b.priority.score - a.priority.score);
  const onViewAllGrowth = growthOpportunities.find((item) => item.id === "referrals")?.onClick;

  return (
    <main className="venue-control-center">
      <section className="venue-control-center__heading">
        <div>
          <h1>Welcome back, {venueName}</h1>
          <p>A clear view of service, orders, and guest activity.</p>
        </div>
        <div className="venue-control-center__display-switcher">
          <VenueHomeModeToggle
            mode={homeMode}
            onChange={onHomeModeChange}
            className="venue-control-center__mode-toggle"
          />
          <span className="venue-control-center__updated-time">
            <Clock3 aria-hidden="true" />
            Updated {updatedLabel}
          </span>
        </div>
      </section>

      <section className="venue-control-center__metric-grid" aria-label="Venue metrics">
        <article className="venue-control-center__card venue-control-center__metric-card">
          <div>
            <span>Today revenue</span>
            <CircleDollarSign className="venue-control-center__metric-icon venue-control-center__metric-icon--cyan" aria-hidden="true" />
          </div>
          <strong>${revenueToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          <p className={revenueDelta >= 0 ? "venue-control-center__metric-trend" : "venue-control-center__metric-trend venue-control-center__metric-trend--down"}>
            {revenueDelta >= 0 ? <ArrowUpRight aria-hidden="true" /> : <ArrowDownRight aria-hidden="true" />}
            {Math.abs(revenueDeltaPct).toFixed(1)}% vs {revenueComparisonLabel}
          </p>
        </article>
        <article className="venue-control-center__card venue-control-center__metric-card">
          <div>
            <span>Active orders</span>
            <ReceiptText className="venue-control-center__metric-icon" aria-hidden="true" />
          </div>
          <strong>{activeOrders}</strong>
          <p>Orders in progress</p>
        </article>
        <article className="venue-control-center__card venue-control-center__metric-card">
          <div>
            <span>Pending queue</span>
            <ChartNoAxesColumnIncreasing className="venue-control-center__metric-icon venue-control-center__metric-icon--gold" aria-hidden="true" />
          </div>
          <strong>{pendingOrders}</strong>
          <p>Awaiting kitchen action</p>
        </article>
        <article className="venue-control-center__card venue-control-center__metric-card">
          <div>
            <span>Checked in</span>
            <UsersRound className="venue-control-center__metric-icon" aria-hidden="true" />
          </div>
          <strong>{checkedInCount}</strong>
          <p>Guests at your venue</p>
        </article>
      </section>

      <section className="venue-control-center__dashboard-grid">
        <div className="venue-control-center__primary-column">
          <section className="venue-control-center__card venue-control-center__growth-panel" aria-labelledby="growth-title">
            <div className="venue-control-center__panel-heading">
              <div>
                <p className="venue-control-center__eyebrow">Next best actions</p>
                <h2 id="growth-title"><TrendingUp aria-hidden="true" />Growth opportunities</h2>
              </div>
              <button
                className="venue-control-center__secondary-button"
                type="button"
                onClick={onViewAllGrowth}
                disabled={!onViewAllGrowth}
              >
                View all
              </button>
            </div>
            <div className="venue-control-center__opportunity-list">
              {prioritizedGrowth.map((item) => {
                const OpportunityIcon = opportunityIcons[item.id] ?? Zap;

                return (
                  <article className="venue-control-center__opportunity-card" key={item.id}>
                    <div className="venue-control-center__opportunity-icon"><OpportunityIcon aria-hidden="true" /></div>
                    <div className="venue-control-center__opportunity-copy">
                      <div>
                        <h3>{item.title}</h3>
                        <span className={priorityClass(item.priority.level)}>
                          {item.priority.level === "high" ? "High priority" : item.priority.level === "medium" ? "Medium priority" : "Opportunity"}
                        </span>
                      </div>
                      <p>{item.description}</p>
                      <small>{item.priority.reason}</small>
                    </div>
                    <button className="venue-control-center__secondary-button" type="button" onClick={item.onClick}>
                      {item.ctaLabel}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="venue-control-center__card venue-control-center__readiness-panel" aria-labelledby="readiness-title">
            <div className="venue-control-center__panel-heading venue-control-center__panel-heading--compact">
              <h2 id="readiness-title"><CheckCircle2 aria-hidden="true" />Readiness checklist</h2>
            </div>
            <div className="venue-control-center__readiness-list">
              {readinessItems.map((item) => (
                <article className="venue-control-center__readiness-item" key={item.id}>
                  <div className="venue-control-center__readiness-copy">
                    <div>
                      <h3>{item.title}</h3>
                      <span className={readinessStatusClass(item.status)}>
                        {item.status === "done" ? "Done" : item.status === "warning" ? "Attention" : "To do"}
                      </span>
                    </div>
                    <p>{item.description}</p>
                  </div>
                  {item.actionLabel && item.onAction && (
                    <button className="venue-control-center__text-action" type="button" onClick={item.onAction}>
                      {item.actionLabel}<ArrowRight aria-hidden="true" />
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="venue-control-center__side-column">
          <section className="venue-control-center__card venue-control-center__status-panel" aria-labelledby="status-title">
            <div className="venue-control-center__panel-heading">
              <div>
                <p className="venue-control-center__eyebrow">Now</p>
                <h2 id="status-title"><Radio aria-hidden="true" />Venue live status</h2>
              </div>
              <span className={isLive ? "venue-control-center__live-indicator" : "venue-control-center__live-indicator venue-control-center__live-indicator--testing"}>
                <Wifi aria-hidden="true" />{isLive ? "Live" : "Testing"}
              </span>
            </div>
            <div className="venue-control-center__status-row">
              <span>Status</span>
              <strong>{isLive ? "Open live" : "Open testing"}</strong>
            </div>
            <div className="venue-control-center__status-metrics">
              <div><span>Active orders</span><strong>{activeOrders}</strong></div>
              <div><span>Kitchen queue</span><strong className={kitchenQueue > 8 ? "venue-control-center__danger-text" : "venue-control-center__warning-text"}>{kitchenQueue}</strong></div>
              <div><span>Creator check-ins</span><strong>{creatorCheckIns}</strong></div>
            </div>
          </section>

          <section className="venue-control-center__card venue-control-center__radar-panel" aria-labelledby="radar-title">
            <div className="venue-control-center__panel-heading">
              <div>
                <p className="venue-control-center__eyebrow">Insights</p>
                <h2 id="radar-title"><ChartNoAxesCombined aria-hidden="true" />Venue radar</h2>
              </div>
              <button className="venue-control-center__icon-button" type="button" aria-label="Open venue radar" title="Open venue radar" onClick={onOpenVibeRadar}>
                <ArrowUpRight aria-hidden="true" />
              </button>
            </div>
            <div className="venue-control-center__radar-row"><span>Momentum</span><strong>{momentumLabel}</strong></div>
            <div className="venue-control-center__radar-metrics">
              <div><span>Currently here</span><strong>{currentlyAtCount}</strong></div>
              <div><span>Heading there</span><strong>{headingThereCount}</strong></div>
              <div><span>Maybe going</span><strong>{maybeGoingCount}</strong></div>
            </div>
          </section>

          <section className="venue-control-center__card venue-control-center__creator-panel" aria-labelledby="creator-title">
            <div className="venue-control-center__panel-heading venue-control-center__panel-heading--compact">
              <h2 id="creator-title"><Video aria-hidden="true" />Creator activity</h2>
            </div>
            <div className="venue-control-center__creator-metrics">
              <div><span>Checked in</span><strong className="venue-control-center__creator-value--pink">{creatorCheckIns}</strong></div>
              <div><span>Nearby</span><strong>{nearbyCreators}</strong></div>
              <div><span>Live streams</span><strong className="venue-control-center__creator-value--cyan">{activeLiveStreams}</strong></div>
            </div>
            <p className="venue-control-center__creator-note">Structure ready for tier-integrated creator visibility and high-influence routing.</p>
          </section>
        </div>
      </section>

      <section className="venue-control-center__card venue-control-center__quick-access-panel" aria-labelledby="quick-access-title">
        <div className="venue-control-center__panel-heading venue-control-center__panel-heading--compact">
          <h2 id="quick-access-title"><Megaphone aria-hidden="true" />Quick access</h2>
        </div>
        <div className="venue-control-center__quick-access-grid">
          {quickAccessItems.map((item) => {
            const QuickAccessIcon = quickAccessIcons[item.id] ?? Zap;

            return (
              <button className="venue-control-center__quick-access-item" key={item.id} type="button" onClick={item.onClick}>
                <QuickAccessIcon aria-hidden="true" />
                <span>{item.label}</span>
                {typeof item.count === "number" && item.count > 0 && <b>{item.count}</b>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="venue-control-center__card venue-control-center__live-activity-panel" aria-labelledby="live-activity-title">
        <div className="venue-control-center__panel-heading venue-control-center__panel-heading--compact">
          <h2 id="live-activity-title"><Rocket aria-hidden="true" />Live activity summary</h2>
        </div>
        {liveActivity.length === 0 ? (
          <p className="venue-control-center__activity-empty">No recent activity yet.</p>
        ) : (
          <div className="venue-control-center__activity-list">
            {liveActivity.slice(0, 6).map((item) => (
              <article className="venue-control-center__activity-item" key={item.id}>
                <CircleDot aria-hidden="true" />
                <div>
                  <strong>{item.action}</strong>
                  <span>{item.user}</span>
                </div>
                <time>{item.time}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
