import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, CheckCheck, Info, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface OperationalNotification {
  id: string;
  event_category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
}

const severityIcons: Record<OperationalNotification['severity'], LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  critical: ShieldAlert,
};

function isOperationalNotification(value: unknown): value is OperationalNotification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const notification = value as Record<string, unknown>;
  return (
    typeof notification.id === 'string' &&
    typeof notification.event_category === 'string' &&
    (notification.severity === 'info' || notification.severity === 'warning' || notification.severity === 'critical') &&
    typeof notification.title === 'string' &&
    typeof notification.body === 'string' &&
    typeof notification.created_at === 'string' &&
    typeof notification.is_read === 'boolean'
  );
}

function formatRelativeTime(value: string) {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface VenueNotificationsMenuProps {
  venueId: string | null;
  onUnreadCountChange?: (count: number) => void;
}

export default function VenueNotificationsMenu({ venueId, onUnreadCountChange }: VenueNotificationsMenuProps) {
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    if (!venueId) {
      setNotifications([]);
      return;
    }

    let active = true;

    const refresh = async () => {
      const { data, error } = await supabase.rpc('get_venue_staff_operational_notifications', {
        p_venue_id: venueId,
        p_include_read: true,
        p_limit: 100,
      });

      if (error) {
        console.error('Failed to load venue notification summary:', error);
        return;
      }

      if (active) {
        setNotifications(Array.isArray(data) ? data.filter(isOperationalNotification) : []);
      }
    };

    void refresh();

    const notificationsChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-notification-menu-${venueId}`))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'venue_staff_operational_notifications',
          filter: `venue_id=eq.${venueId}`,
        },
        () => void refresh(),
      )
      .subscribe();

    const readsChannel = supabase
      .channel(createRealtimeChannelTopic(`venue-notification-menu-reads-${venueId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'venue_staff_operational_notification_reads',
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(readsChannel);
    };
  }, [venueId]);

  const markAllRead = async () => {
    if (!venueId || unreadCount === 0) return;

    setMarkingAll(true);
    try {
      const { error } = await supabase.rpc('mark_all_venue_staff_operational_notifications_read', {
        p_venue_id: venueId,
      });
      if (error) throw error;

      setNotifications((currentNotifications) => currentNotifications.map((notification) => ({
        ...notification,
        is_read: true,
      })));
    } catch (error) {
      console.error('Failed to mark venue notifications as read:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  const recentNotifications = notifications.slice(0, 3);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="venue-shell-icon-button venue-shell-notification-button" type="button" aria-label="Notifications" title="Notifications">
          <Bell aria-hidden="true" />
          {unreadCount > 0 && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="venue-shell-notification-menu">
        <div className="venue-shell-notification-menu__header">
          <div>
            <strong>Notifications</strong>
            <span>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</span>
          </div>
          <button type="button" disabled={unreadCount === 0 || markingAll} onClick={() => void markAllRead()}>
            <CheckCheck aria-hidden="true" />
            <span>{markingAll ? 'Marking...' : 'Mark all read'}</span>
          </button>
        </div>
        <div className="venue-shell-notification-menu__list">
          {recentNotifications.length === 0 ? (
            <p className="venue-shell-notification-menu__empty">No venue notifications yet.</p>
          ) : (
            recentNotifications.map((notification) => {
              const Icon = severityIcons[notification.severity];
              return (
                <Link key={notification.id} className={`venue-shell-notification-menu__item${notification.is_read ? '' : ' venue-shell-notification-menu__item--unread'}`} to="/venue/notifications">
                  <span className="venue-shell-notification-menu__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.body}</small>
                  </span>
                  <time dateTime={notification.created_at}>{formatRelativeTime(notification.created_at)}</time>
                </Link>
              );
            })
          )}
        </div>
        <Link className="venue-shell-notification-menu__view-all" to="/venue/notifications">
          View all notifications
          <ArrowRight aria-hidden="true" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
