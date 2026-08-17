import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  AtSign,
  Bell,
  CalendarDays,
  CheckCheck,
  CreditCard,
  Gift,
  Heart,
  type LucideIcon,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import './customer-notifications-menu.css';

interface CustomerNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface CustomerNotificationsMenuProps {
  dashboardPresentation?: boolean;
  onUnreadCountChange?: (count: number) => void;
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

function getNotificationPresentation(type: string): {
  Icon: LucideIcon;
  tone: string;
} {
  switch (type) {
    case 'like':
      return { Icon: Heart, tone: 'customer-notification-menu__icon--pink' };
    case 'comment':
      return { Icon: MessageSquare, tone: 'customer-notification-menu__icon--pink' };
    case 'mention':
    case 'tag':
      return { Icon: AtSign, tone: 'customer-notification-menu__icon--cyan' };
    case 'follow':
    case 'staff_invite':
      return { Icon: UserPlus, tone: 'customer-notification-menu__icon--cyan' };
    case 'event':
    case 'reservation_reminder':
    case 'shift_update':
    case 'shift_reminder':
      return { Icon: CalendarDays, tone: 'customer-notification-menu__icon--gold' };
    case 'reward':
      return { Icon: Gift, tone: 'customer-notification-menu__icon--gold' };
    case 'payment_request':
      return { Icon: CreditCard, tone: 'customer-notification-menu__icon--gold' };
    default:
      return { Icon: Bell, tone: 'customer-notification-menu__icon--cyan' };
  }
}

export default function CustomerNotificationsMenu({ dashboardPresentation = false, onUnreadCountChange }: CustomerNotificationsMenuProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  const refreshNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }

    const { data, error } = await supabase
      .from('customer_notifications')
      .select('id, type, title, message, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Failed to load customer notifications:', error);
      return;
    }

    setNotifications(data ?? []);
  }, [user?.id]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => {
    void refreshNotifications();

    if (!user?.id) return;

    // StrictMode can replay this effect before async channel cleanup finishes.
    // A per-effect topic prevents Supabase from reusing a subscribed channel.
    const channelId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`customer-notification-menu-${user.id}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => void refreshNotifications(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshNotifications, user?.id]);

  const markAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;

    setMarkingAll(true);
    try {
      const { error } = await supabase
        .from('customer_notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications((currentNotifications) => currentNotifications.map((notification) => ({
        ...notification,
        read: true,
      })));
    } catch (error) {
      console.error('Failed to mark customer notifications as read:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  const markRead = async (notificationId: string) => {
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.read) return;

    setNotifications((currentNotifications) => currentNotifications.map((item) => (
      item.id === notificationId ? { ...item, read: true } : item
    )));

    const { error } = await supabase
      .from('customer_notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Failed to mark customer notification as read:', error);
      void refreshNotifications();
    }
  };

  const recentNotifications = notifications.slice(0, 3);
  const notificationsPath = dashboardPresentation ? '/app/notifications?presentation=dashboard' : '/app/notifications';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="customer-app-icon-action customer-app-notifications"
          type="button"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="customer-notification-menu">
        <div className="customer-notification-menu__header">
          <div>
            <strong>Notifications</strong>
            <span>{unreadCount > 0 ? `${unreadCount} new` : 'You\'re all caught up'}</span>
          </div>
          <button type="button" disabled={unreadCount === 0 || markingAll} onClick={() => void markAllRead()}>
            <CheckCheck aria-hidden="true" />
            <span>{markingAll ? 'Marking...' : 'Mark all as read'}</span>
          </button>
        </div>
        <div className="customer-notification-menu__list">
          {recentNotifications.length === 0 ? (
            <p className="customer-notification-menu__empty">No notifications yet.</p>
          ) : (
            recentNotifications.map((notification) => {
              const { Icon, tone } = getNotificationPresentation(notification.type);

              return (
                <Link
                  key={notification.id}
                  className={`customer-notification-menu__item${notification.read ? '' : ' customer-notification-menu__item--unread'}`}
                  to={notificationsPath}
                  onClick={() => void markRead(notification.id)}
                >
                  <span className={`customer-notification-menu__icon ${tone}`}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.message}</small>
                    <time dateTime={notification.created_at}>{formatRelativeTime(notification.created_at)}</time>
                  </span>
                </Link>
              );
            })
          )}
        </div>
        <Link className="customer-notification-menu__footer" to={notificationsPath}>
          View all notifications
          <ArrowRight aria-hidden="true" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
