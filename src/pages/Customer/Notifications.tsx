import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Heart, MessageSquare, Calendar, UserPlus, Check, Bell, BellRing, Clock, ShoppingBag, CheckCheck, Gift, AtSign, CreditCard, Lock, AlarmClock, Tag, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { globalCache } from "@/hooks/useGlobalPrefetch";
import { useHideBodyScrollbar } from "@/hooks/useHideBodyScrollbar";
import ShiftReminderModal from "@/components/Customer/ShiftReminderModal";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import DealCard from "@/components/Customer/Deals/DealCard";
import ReferenceVenueDealCard from "@/components/Customer/Deals/ReferenceVenueDealCard";
import VibeResponseCard from "@/components/Customer/Deals/VibeResponseCard";
import { useRunnerJobs } from "@/hooks/useRunnerJobs";
import { Package } from "lucide-react";
import TranslatedText from "@/components/i18n/TranslatedText";
import { useIsMobile } from "@/hooks/use-mobile";
import useCustomerDashboardPresentation from "@/hooks/useCustomerDashboardPresentation";
import "./notifications.css";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  reference_id: string | null;
  reference_type: string | null;
  read: boolean;
  created_at: string;
}

interface TestInvite {
  id: string;
  test_balance_cents: number;
}

interface VibePush {
  id: string;
  message: string | null;
  venues: { name: string | null } | null;
}

interface ExternalTablesError {
  code?: string;
  message?: string;
}

interface ExternalTablesResult<T = unknown> {
  data: T | null;
  error: ExternalTablesError | null;
}

interface ExternalTablesQuery extends PromiseLike<ExternalTablesResult> {
  select(columns: string): ExternalTablesQuery;
  eq(column: string, value: string): ExternalTablesQuery;
  gte(column: string, value: string): ExternalTablesQuery;
  order(column: string, options: { ascending: boolean }): ExternalTablesQuery;
  limit(count: number): ExternalTablesQuery;
  update(values: Record<string, unknown>): ExternalTablesQuery;
  insert(values: Record<string, unknown>): ExternalTablesQuery;
  maybeSingle(): Promise<ExternalTablesResult>;
}

interface ExternalTablesClient {
  from(table: string): ExternalTablesQuery;
}

const externalTables = supabase as unknown as ExternalTablesClient;

const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "deals_vibes", label: "Deals & Vibes" },
  { id: "like", label: "Likes" },
  { id: "comment", label: "Comments" },
  { id: "reward", label: "Rewards" },
  { id: "mention", label: "Mentions" },
];

const REFERENCE_DEAL_COUNT = 2;

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "like":
      return <Heart className="w-5 h-5" />;
    case "comment":
      return <MessageSquare className="w-5 h-5" />;
    case "tag":
    case "mention":
      return <AtSign className="w-5 h-5" />;
    case "event":
      return <Calendar className="w-5 h-5" />;
    case "follow":
      return <UserPlus className="w-5 h-5" />;
    case "reservation_reminder":
      return <Calendar className="w-5 h-5" />;
    case "order_update":
      return <ShoppingBag className="w-5 h-5" />;
    case "reward":
      return <Gift className="w-5 h-5" />;
    case "payment_request":
      return <CreditCard className="w-5 h-5" />;
    case "staff_invite":
      return <UserPlus className="w-5 h-5" />;
    case "test_invite":
      return <FlaskConical className="w-5 h-5" />;
    case "pin_resend_request":
      return <Lock className="w-5 h-5" />;
    case "shift_update":
      return <Calendar className="w-5 h-5" />;
    case "shift_reminder":
      return <AlarmClock className="w-5 h-5" />;
    default:
      return <Bell className="w-5 h-5" />;
  }
};

const formatTime = (dateStr: string) => {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return "Just now";
  }
};

const Notifications = () => {
  useHideBodyScrollbar(true);
  const { t } = useTranslation('common');

  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  // Initialize from global cache for instant display
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    return (globalCache.notifications as Notification[]) || [];
  });
  const [loading, setLoading] = useState(false); // Start false for instant render
  const [activeFilter, setActiveFilter] = useState("all");
  const [areDealCardsCleared, setAreDealCardsCleared] = useState(false);
  const [reminderModal, setReminderModal] = useState<{ venueId: string; userId: string } | null>(null);
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);
  const [respondedInvites, setRespondedInvites] = useState<Set<string>>(new Set());

  const handleTestInviteResponse = async (notification: Notification, accept: boolean) => {
    setRespondingInvite(notification.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !notification.reference_id) throw new Error(t('notifications_toasts.not_authenticated'));

      const venueId = notification.reference_id;

      // Find the pending invite for this user + venue
      const { data: inviteData, error: findErr } = await externalTables
        .from("venue_test_invites")
        .select("id, test_balance_cents")
        .eq("venue_id", venueId)
        .eq("invited_user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      const invite = inviteData as TestInvite | null;

      if (findErr || !invite) throw new Error(t('notifications_toasts.invite_not_found'));

      if (accept) {
        // Accept: update invite + create test wallet balance
        const { error: updateErr } = await externalTables
          .from("venue_test_invites")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("id", invite.id);
        if (updateErr) throw updateErr;

        // Create venue-scoped test balance
        const { error: balErr } = await externalTables
          .from("test_wallet_balances")
          .insert({
            user_id: user.id,
            venue_id: venueId,
            invite_id: invite.id,
            balance_cents: invite.test_balance_cents,
            initial_balance_cents: invite.test_balance_cents,
            is_active: true,
          });
        if (balErr && balErr.code !== "23505") throw balErr;

        toast.success(t('notifications_toasts.tester_added'));
      } else {
        // Decline
        const { error: updateErr } = await externalTables
          .from("venue_test_invites")
          .update({ status: "declined", declined_at: new Date().toISOString() })
          .eq("id", invite.id);
        if (updateErr) throw updateErr;
        toast.info(t('notifications_toasts.invite_declined'));
      }

      markAsRead(notification.id);
      setRespondedInvites(prev => new Set(prev).add(notification.id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('notifications_toasts.invite_response_failed'));
    } finally {
      setRespondingInvite(null);
    }
  };
  const { deals: dealNotifications, redeemDeal } = useActiveDeals('feed', 2);
  const { jobs: runnerJobs } = useRunnerJobs();
  const activeRunnerJobs = runnerJobs.filter(
    (j) => !['completed', 'cancelled', 'rejected'].includes(j.status),
  );

  // Fetch vibe pushes for this user
  const [vibePushes, setVibePushes] = useState<VibePush[]>([]);
  useEffect(() => {
    const fetchVibes = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Get active vibes from last 24h (status=collecting means they're still open for responses)
      const { data } = await externalTables
        .from("venue_vibes")
        .select("id, venue_id, message, created_at, venues(name)")
        .eq("status", "collecting")
        .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      setVibePushes((data as VibePush[] | null) || []);
    };
    fetchVibes();
  }, []);
  // Handle notification click - navigate to payment if payment_request
  const handleNotificationClick = async (notification: Notification) => {
    markAsRead(notification.id);

    // Staff invite -> go to acceptance page
    if (notification.type === "staff_invite") {
      navigate(`/app/staff-invite/${notification.reference_id}`);
      return;
    }

    // Shift update -> open reminder preferences modal
    if (notification.type === "shift_update" && notification.reference_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setReminderModal({ venueId: notification.reference_id, userId: user.id });
      }
      return;
    }

    if (notification.type !== "payment_request" || !notification.reference_id) return;

    // New format: reference_id is the payment_request_id (UUID)
    if (notification.reference_type === "payment_request") {
      navigate(`/app/pay/${notification.reference_id}`);
      return;
    }

    // Legacy format: reference_id contains the full payment link
    if (notification.reference_type === "payment_link") {
      const link = notification.reference_id;
      const match = link.match(/\/app\/pay\/([a-zA-Z0-9_-]+)/);
      if (match?.[1]) {
        navigate(`/app/pay/${match[1]}`);
      } else {
        navigate(`/app/pay/${notification.reference_id}`);
      }
    }
  };

  // Fetch notifications from database
  useEffect(() => {
    const fetchNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      const { data, error } = await supabase
        .from("customer_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching notifications:", error);
      } else {
        setNotifications(data || []);
        // Update global cache
        globalCache.notifications = data;
        globalCache.lastFetch.notifications = Date.now();
      }
    };


    fetchNotifications();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    let isCurrent = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtimeSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent || !user) return;

      const channelId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      channel = supabase
        .channel(`customer-notifications-${user.id}-${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "customer_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!isCurrent) return;
            console.log("New notification:", payload.new);
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "customer_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!isCurrent) return;
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === payload.new.id ? (payload.new as Notification) : n
              )
            );
          }
        )
        .subscribe();
    };

    void setupRealtimeSubscription();

    return () => {
      isCurrent = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("customer_notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (!error) {
      setNotifications(notifications.map((n) => ({ ...n, read: true })));
    }
  };

  const markAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from("customer_notifications")
      .update({ read: true })
      .eq("id", notificationId);

    if (!error) {
      setNotifications(
        notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleDealNotifications = areDealCardsCleared ? [] : dealNotifications;
  const showReferenceDeals =
    isDashboardPresentation &&
    !areDealCardsCleared &&
    visibleDealNotifications.length === 0 &&
    vibePushes.length === 0 &&
    activeRunnerJobs.length === 0;
  const dealsVibesCount =
    visibleDealNotifications.length +
    vibePushes.length +
    activeRunnerJobs.length +
    (showReferenceDeals ? REFERENCE_DEAL_COUNT : 0);

  // Filter notifications based on active filter
  const filteredNotifications = activeFilter === "all" 
    ? notifications 
    : activeFilter === "deals_vibes"
    ? notifications.filter((n) => n.type === "reward" || n.type === "payment_request")
    : notifications.filter((n) => n.type === activeFilter);

  const showDealsVibesSection = (activeFilter === "all" || activeFilter === "deals_vibes") && dealsVibesCount > 0;
  const showEmptyState = !loading && filteredNotifications.length === 0 && !showDealsVibesSection;

  return (
    <div className={`customer-notifications-page${isMobile ? " customer-notifications-page--mobile" : ""}${isDashboardPresentation ? " customer-notifications-page--dashboard-presentation" : ""}`}>
      {isMobile && !isDashboardPresentation && <Web3FeedHeader />}

      <main className="customer-notifications-page__main px-4 pt-24 pb-8 max-w-3xl mx-auto" aria-labelledby="notifications-title">
        {/* Header */}
        <div className="customer-notifications-page__heading flex items-start justify-between mb-6">
          <div>
            <p className="customer-notifications-page__kicker"><BellRing aria-hidden="true" /> {t('notifications.alters_kicker', 'Your updates')}</p>
            <h1 id="notifications-title">{t('notifications.alters_title', 'Alters')}</h1>
            <p>{t('notifications.alters_subtitle', 'Keep up with your social circle and the places you love.')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="customer-notifications-page__mark-read"
          >
            <CheckCheck className="w-4 h-4 mr-2" aria-hidden="true" />
            {t('notifications.mark_all_read', 'Mark all read')}
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="customer-notifications-page__tabs flex items-center gap-3 mb-8 overflow-x-auto pb-2 scrollbar-hide" role="tablist" aria-label={t('notifications.alters_filters', 'Alter filters')}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              role="tab"
              aria-selected={activeFilter === tab.id}
                className={`customer-notifications-page__tab ${
                  activeFilter === tab.id
                  ? "customer-notifications-page__tab--active"
                  : ""
                }`}
            >
              {t(`notifications.filter_${tab.id}`, tab.label)}
              {tab.id === "deals_vibes" && dealsVibesCount > 0 && (
                <span className="customer-notifications-page__tab-count">{dealsVibesCount > 99 ? "99+" : dealsVibesCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Deals & Vibes Section (9i) */}
        {showDealsVibesSection &&
          (vibePushes.length > 0 ||
            dealNotifications.length > 0 ||
            activeRunnerJobs.length > 0 ||
            showReferenceDeals) && (
          <section className="customer-notifications-page__deals mb-6" aria-labelledby="deals-vibes-title">
            <div className="customer-notifications-page__section-heading flex items-center gap-2 mb-3">
              <span><Tag aria-hidden="true" /><h2 id="deals-vibes-title">{t('notifications.deals_vibes', 'Deals & Vibes')}</h2></span>
              {(visibleDealNotifications.length > 0 || showReferenceDeals) && (
                <button className="customer-notifications-page__clear-deals" type="button" onClick={() => setAreDealCardsCleared(true)}>
                  {t('notifications.clear_deals', 'Clear')}
                </button>
              )}
            </div>
            <div className="customer-notifications-page__deal-list space-y-3">
              {activeRunnerJobs.map((job) => {
                const statusMap: Record<string, string> = {
                  pending: 'Looking for a runner',
                  accepted: 'Runner on the way to store',
                  at_store: 'Runner is at the store',
                  awaiting_approval: 'Approval needed',
                  approved: 'Approved — purchasing',
                  purchased: 'Out for delivery',
                  delivered: 'Delivered — confirm receipt',
                  disputed: 'Disputed',
                };
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => navigate(`/app/runner/jobs/${job.id}`)}
                    className="customer-notifications-page__runner-card"
                  >
                    <div className="customer-notifications-page__runner-content">
                      <div className="customer-notifications-page__runner-icon">
                        <Package aria-hidden="true" />
                      </div>
                      <div className="customer-notifications-page__runner-copy">
                        <div className="customer-notifications-page__runner-title-row">
                          <span>Runner job</span>
                          <span>{statusMap[job.status] ?? job.status}</span>
                        </div>
                        <div>{job.task_description}</div>
                        <div>Tap to view and manage</div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {vibePushes.map((vibe) => (
                <VibeResponseCard
                  key={vibe.id}
                  vibeId={vibe.id}
                  venueName={vibe.venues?.name || t('notifications_toasts.unknown_venue')}
                  message={vibe.message || t('notifications_toasts.default_vibe_message')}
                  variant="sidebar"
                  onResponded={() => setVibePushes(prev => prev.filter(v => v.id !== vibe.id))}
                />
              ))}
              {visibleDealNotifications.map((deal) => (
                <DealCard key={deal.id} deal={deal} variant="compact" onRedeem={redeemDeal} />
              ))}
              {showReferenceDeals && Array.from({ length: REFERENCE_DEAL_COUNT }, (_, index) => (
                <ReferenceVenueDealCard
                  key={`reference-my-spot-deal-${index}`}
                  onOptions={() => toast.info("Deal options are ready to connect.")}
                  onRedeem={() => toast.info("This deal is ready to redeem.")}
                />
              ))}
            </div>
          </section>
        )}

        {/* Notifications List */}
        <div className="customer-notifications-page__list">
          {loading ? (
            <div className="customer-notifications-page__loading">
              <div aria-hidden="true" />
              <p>{t('notifications.loading', 'Loading notifications...')}</p>
            </div>
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification) => (
              <article
                key={notification.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(notification)}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  void handleNotificationClick(notification);
                }}
                className={`customer-notifications-page__item${notification.read ? "" : " customer-notifications-page__item--unread"}`}
              >
                {/* Icon */}
                <div className="customer-notifications-page__item-icon">
                  {getNotificationIcon(notification.type)}
                </div>

                {/* Content */}
                <div className="customer-notifications-page__item-copy">
                  <div className="customer-notifications-page__item-title-row">
                    <TranslatedText
                      text={notification.title}
                      contentId={`notif-title-${notification.id}`}
                      contentType="notification_title"
                      hideToggle
                      className="customer-notifications-page__item-title"
                    />
                    {notification.type === "shift_update" && (
                      <Bell aria-hidden="true" />
                    )}
                  </div>
                  <TranslatedText
                    text={notification.message}
                    contentId={`notif-msg-${notification.id}`}
                    contentType="notification_message"
                    hideToggle
                    className="customer-notifications-page__item-message"
                  />
                  {/* Test invite accept/decline buttons */}
                  {notification.type === "test_invite" && notification.reference_type === "venue_test_invite" && !respondedInvites.has(notification.id) && (
                    <div
                      className="customer-notifications-page__invite-actions"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        onClick={() => handleTestInviteResponse(notification, true)}
                        disabled={respondingInvite === notification.id}
                        className="customer-notifications-page__invite-accept"
                      >
                        {respondingInvite === notification.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {t('actions.accept')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestInviteResponse(notification, false)}
                        disabled={respondingInvite === notification.id}
                        className="customer-notifications-page__invite-decline"
                      >
                        {t('actions.decline')}
                      </Button>
                    </div>
                  )}
                  {notification.type === "test_invite" && respondedInvites.has(notification.id) && (
                    <p className="customer-notifications-page__responded">{t('notifications.responded', 'Responded')}</p>
                  )}
                  <div className="customer-notifications-page__item-time">
                    <Clock aria-hidden="true" />
                    <span>{formatTime(notification.created_at)}</span>
                  </div>
                </div>

                {/* Unread indicator */}
                {!notification.read && (
                  <div className="customer-notifications-page__unread" aria-label="Unread" />
                )}
              </article>
            ))
          ) : showEmptyState ? (
            /* Empty State - Stitch AI Style */
            <div className="customer-notifications-page__empty">
              {/* Bell Icon with Gradient Effect */}
              <div className="customer-notifications-page__empty-icon">
                <Bell aria-hidden="true" strokeWidth={1.5} />
              </div>

              <h2>{t('notifications.empty_title', 'Stay in the loop')}</h2>
              <p>{t('notifications.empty_description', 'Your activity, mentions, and venue updates will appear here.')}
              </p>
            </div>
          ) : null}
        </div>
      </main>

      {/* Shift Reminder Modal */}
      {reminderModal && (
        <ShiftReminderModal
          isOpen={true}
          onClose={() => setReminderModal(null)}
          venueId={reminderModal.venueId}
          userId={reminderModal.userId}
        />
      )}
    </div>
  );
};

export default Notifications;
