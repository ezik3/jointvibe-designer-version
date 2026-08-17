import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import "./venue-notifications.css";

interface OperationalNotification {
  id: string;
  event_type: string;
  event_category: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  delivery_scope: string;
  source_table: string | null;
  source_record_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
}

const severityIconMap = {
  info: Info,
  warning: AlertTriangle,
  critical: ShieldAlert,
} as const;

const categoryIconMap = {
  orders: ReceiptText,
  staff: UsersRound,
  account: ShieldCheck,
  approval: CheckCircle2,
  confidence: Info,
  moderation: ShieldAlert,
  safety: ShieldAlert,
} as const;

const formatCategoryLabel = (category: string) => category
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getNotificationCategory = (notification: OperationalNotification) => notification.event_category.trim() || "other";

interface VenueNotificationsProps {
  embedded?: boolean;
  onUnreadCountChange?: (count: number) => void;
}

export default function VenueNotifications({ embedded = false, onUnreadCountChange }: VenueNotificationsProps) {
  const { user } = useAuth();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [hasAccess, setHasAccess] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  const notificationFilters = useMemo(
    () => ["all", ...Array.from(new Set(notifications.map(getNotificationCategory)))],
    [notifications],
  );

  const filteredNotifications = useMemo(
    () => notifications.filter((notification) => activeFilter === "all" || getNotificationCategory(notification) === activeFilter),
    [activeFilter, notifications],
  );

  useEffect(() => {
    if (activeFilter !== "all" && !notificationFilters.includes(activeFilter)) {
      setActiveFilter("all");
    }
  }, [activeFilter, notificationFilters]);

  useEffect(() => {
    const resolveVenueId = async () => {
      const stored = localStorage.getItem("jv_current_venue_id");
      if (stored) {
        setVenueId(stored);
        return;
      }

      if (!user?.id) {
        setVenueId(null);
        return;
      }

      const { data } = await supabase
        .from("venues")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      setVenueId(data?.id ?? null);
    };

    void resolveVenueId();
  }, [user?.id]);

  const fetchNotifications = useCallback(async (selectedVenueId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_venue_staff_operational_notifications", {
        p_venue_id: selectedVenueId,
        p_include_read: true,
        p_limit: 100,
      });

      if (error) {
        if ((error.message || "").toLowerCase().includes("not authorized")) {
          setHasAccess(false);
          setNotifications([]);
          return;
        }
        throw error;
      }

      setHasAccess(true);
      setNotifications((data as unknown as OperationalNotification[] | null) ?? []);
    } catch (error) {
      console.error("Failed to fetch operational notifications:", error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!venueId) {
      setLoading(false);
      return;
    }

    void fetchNotifications(venueId);

    const notificationsChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-operational-notifications-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "venue_staff_operational_notifications",
          filter: `venue_id=eq.${venueId}`,
        },
        () => {
          void fetchNotifications(venueId);
        },
      )
      .subscribe();

    const readsChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-operational-notification-reads-${venueId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_staff_operational_notification_reads",
        },
        () => {
          void fetchNotifications(venueId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(readsChannel);
    };
  }, [fetchNotifications, venueId]);

  const markNotificationRead = async (notificationId: string) => {
    setMarkingIds((prev) => new Set(prev).add(notificationId));
    try {
      const { error } = await supabase.rpc("mark_venue_staff_operational_notification_read", {
        p_notification_id: notificationId,
        p_read: true,
      });
      if (error) throw error;

      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (error) {
      console.error("Failed to mark operational notification as read:", error);
    } finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const markAllRead = async () => {
    if (!venueId) return;
    setMarkingAll(true);
    try {
      const { error } = await supabase.rpc("mark_all_venue_staff_operational_notifications_read", {
        p_venue_id: venueId,
      });
      if (error) throw error;

      const nowIso = new Date().toISOString();
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true, read_at: nowIso })));
    } catch (error) {
      console.error("Failed to mark all operational notifications as read:", error);
    } finally {
      setMarkingAll(false);
    }
  };

  const markAllReadButton = (
    <button
      className="venue-notifications-button venue-notifications-button--secondary"
      type="button"
      disabled={markingAll || notifications.length === 0 || unreadCount === 0}
      onClick={() => void markAllRead()}
    >
      <CheckCheck aria-hidden="true" />
      <span>{markingAll ? "Marking..." : unreadCount ? "Mark all read" : "All caught up"}</span>
    </button>
  );

  if (!venueId) {
    return (
      <div className={`venue-notifications-page${embedded ? " venue-notifications-page--embedded" : ""}`}>
        {!embedded && (
          <header className="venue-notifications-heading">
            <div>
              <h1>Notifications</h1>
              <p>Updates that need attention from your venue team.</p>
            </div>
          </header>
        )}
        <section className="venue-notifications-state" role="status">
          <Bell aria-hidden="true" />
          <p>Venue context is unavailable for notifications.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={`venue-notifications-page${embedded ? " venue-notifications-page--embedded" : ""}`}>
      {!embedded ? (
        <header className="venue-notifications-heading">
          <div>
            <h1>Notifications</h1>
            <p>Updates that need attention from your venue team.</p>
          </div>
          {markAllReadButton}
        </header>
      ) : (
        <div className="venue-notifications-embedded-actions">
          {markAllReadButton}
        </div>
      )}

      {!hasAccess ? (
        <section className="venue-notifications-state venue-notifications-state--warning" role="alert">
          <ShieldAlert aria-hidden="true" />
          <p>Your current venue role is not authorized to view operational notifications.</p>
        </section>
      ) : (
        <>
          <section className="venue-notifications-toolbar" aria-label="Notification filters">
            <div className="venue-notifications-tabs" role="tablist" aria-label="Notification categories">
              {notificationFilters.map((filter) => {
                const isActive = activeFilter === filter;
                const filterUnreadCount = notifications.filter(
                  (notification) => !notification.is_read && (filter === "all" || getNotificationCategory(notification) === filter),
                ).length;

                return (
                  <button
                    key={filter}
                    className={`venue-notifications-tab${isActive ? " venue-notifications-tab--active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveFilter(filter)}
                  >
                    <span>{filter === "all" ? "All" : formatCategoryLabel(filter)}</span>
                    <b>{filterUnreadCount}</b>
                  </button>
                );
              })}
            </div>
            <p className="venue-notifications-summary">
              <strong>{unreadCount} unread</strong>
              <span>{loading ? "Loading current venue updates." : unreadCount ? "Review and action current venue updates." : "You are all caught up."}</span>
            </p>
          </section>

          <section className="venue-notifications-list" aria-live="polite" aria-label="Venue notifications">
            {loading ? (
              <div className="venue-notifications-empty">
                <Bell aria-hidden="true" />
                <p>Loading operational notifications...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="venue-notifications-empty">
                <Bell aria-hidden="true" />
                <p>{activeFilter === "all" ? "No operational notifications yet." : `No ${formatCategoryLabel(activeFilter).toLowerCase()} notifications yet.`}</p>
              </div>
            ) : (
              filteredNotifications.map((notification) => {
                const category = getNotificationCategory(notification);
                const NotificationIcon = categoryIconMap[category as keyof typeof categoryIconMap]
                  ?? severityIconMap[notification.severity]
                  ?? Bell;
                const isBusy = markingIds.has(notification.id);

                return (
                  <article
                    key={notification.id}
                    className={`venue-notifications-item${notification.is_read ? "" : " is-unread"}`}
                  >
                    <div className={`venue-notifications-item__icon venue-notifications-item__icon--${notification.severity}`}>
                      <NotificationIcon aria-hidden="true" />
                    </div>
                    <div className="venue-notifications-item__content">
                      <div className="venue-notifications-item__title-row">
                        <h2>{notification.title}</h2>
                        <time dateTime={notification.created_at}>
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                        </time>
                      </div>
                      <p>{notification.body}</p>
                      <div className="venue-notifications-item__actions">
                        <span>{formatCategoryLabel(category)}</span>
                        {!notification.is_read && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void markNotificationRead(notification.id)}
                          >
                            {isBusy ? "Saving..." : "Mark read"}
                          </button>
                        )}
                      </div>
                    </div>
                    <span className="venue-notifications-item__unread" aria-label={notification.is_read ? undefined : "Unread"} />
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}
