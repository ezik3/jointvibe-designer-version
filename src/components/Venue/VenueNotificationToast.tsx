import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingCart, MessageCircle, DollarSign, Users, Bell, Check, Truck, MapPin, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';
import { isVenueNotificationEnabled, type VenueNotificationCategory } from "@/lib/venueNotificationPreferences";
import { useVenueNotificationPreferences } from "@/hooks/useVenueNotificationPreferences";
import { persistVenueOrderStatus } from "@/hooks/useVenueOrdersDB";
import { toast } from "sonner";
import "./venue-dialog.css";

interface VenueNotification {
  id: string;
  type: VenueNotificationCategory;
  title: string;
  message: string;
  timestamp: Date;
  orderData?: {
    orderId?: string;
    orderNumber?: number;
    total?: number;
    orderType?: string; // pickup, delivery, dine-in
    itemCount?: number;
    customerName?: string;
    eta?: string;
  };
  autoApproved?: boolean;
}

// Global event bus for real notifications only
const notificationListeners: ((notif: Omit<VenueNotification, 'id' | 'timestamp'>) => void)[] = [];

export function triggerVenueNotification(notif: Omit<VenueNotification, 'id' | 'timestamp'>) {
  notificationListeners.forEach(listener => listener(notif));
}

export default function VenueNotificationToast() {
  const { t } = useTranslation('venue');
  const [notifications, setNotifications] = useState<VenueNotification[]>([]);
  const [approvingNotificationIds, setApprovingNotificationIds] = useState<Set<string>>(new Set());
  const approvingOrderIdsRef = useRef(new Set<string>());
  const preferences = useVenueNotificationPreferences();

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const approveOrder = useCallback(async (notif: VenueNotification) => {
    const orderId = notif.orderData?.orderId;
    if (!orderId || approvingOrderIdsRef.current.has(orderId)) return false;

    approvingOrderIdsRef.current.add(orderId);
    setApprovingNotificationIds(prev => new Set(prev).add(notif.id));

    try {
      await persistVenueOrderStatus(orderId, "preparing");
      return true;
    } catch (error) {
      console.error("Error approving order from notification:", error);
      toast.error("Failed to approve order");
      return false;
    } finally {
      approvingOrderIdsRef.current.delete(orderId);
      setApprovingNotificationIds(prev => {
        const next = new Set(prev);
        next.delete(notif.id);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!preferences.notificationsEnabled) return;

    const listener = (notif: Omit<VenueNotification, 'id' | 'timestamp'>) => {
      if (!isVenueNotificationEnabled(preferences, notif.type)) return;

      const isNewOrder = notif.type === 'new_order';
      const autoApprove = isNewOrder && preferences.autoApproveOrders && Boolean(notif.orderData?.orderId);

      const newNotif: VenueNotification = {
        ...notif,
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        timestamp: new Date(),
        autoApproved: autoApprove,
      };

      setNotifications(prev => [...prev, newNotif]);

      if (isNewOrder && autoApprove) {
        void approveOrder(newNotif).then((approved) => {
          if (!approved) {
            setNotifications((currentNotifications) => currentNotifications.map((notification) => (
              notification.id === newNotif.id ? { ...notification, autoApproved: false } : notification
            )));
            return;
          }

          setTimeout(() => dismissNotification(newNotif.id), 2000);
        });
      } else if (!isNewOrder) {
        // Regular notifications: auto-dismiss after 5s
        setTimeout(() => {
          dismissNotification(newNotif.id);
        }, 5000);
      }
      // new_order without auto-approve: persist until manual dismiss
    };

    notificationListeners.push(listener);

    return () => {
      const index = notificationListeners.indexOf(listener);
      if (index > -1) notificationListeners.splice(index, 1);
    };
  }, [approveOrder, dismissNotification, preferences]);

  const getIcon = (type: VenueNotification['type']) => {
    switch (type) {
      case 'order': return ShoppingCart;
      case 'new_order': return ShoppingCart;
      case 'message': return MessageCircle;
      case 'sale': return DollarSign;
      case 'checkin': return Users;
      default: return Bell;
    }
  };

  const getAccentClass = (type: VenueNotification['type']) => {
    switch (type) {
      case 'order': return 'bg-[#d97745]';
      case 'new_order':
      case 'sale': return 'bg-[#329b74]';
      case 'message': return 'bg-[#4b82c3]';
      case 'checkin': return 'bg-[#16d9e8]';
      default: return 'bg-[#16d9e8]';
    }
  };

  const getOrderTypeIcon = (orderType?: string) => {
    switch (orderType) {
      case 'pickup': return MapPin;
      case 'delivery': return Truck;
      case 'dine-in': return UtensilsCrossed;
      default: return ShoppingCart;
    }
  };

  const handleDragEnd = (id: string, info: { offset: { x: number } }) => {
    if (Math.abs(info.offset.x) > 100) {
      dismissNotification(id);
    }
  };

  return (
    <div className="fixed top-4 left-4 z-[60] w-[calc(100vw-2rem)] max-w-[380px] space-y-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map((notif) => {
          const Icon = getIcon(notif.type);
          const isNewOrder = notif.type === 'new_order';
          const isApproving = approvingNotificationIds.has(notif.id);

          return (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: -100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -200, scale: 0.9 }}
              drag={isNewOrder ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.3}
              onDragEnd={(_, info) => isNewOrder && handleDragEnd(notif.id, info)}
              className="pointer-events-auto"
            >
              <div className={`venue-floating-panel w-full overflow-hidden ${isNewOrder ? 'ring-1 ring-[#329b74]/40' : ''}`}>
                <div className={`h-1 w-full ${getAccentClass(notif.type)}`} />

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-[6px] ${getAccentClass(notif.type)} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{notif.title}</p>
                        {notif.autoApproved && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Auto-approved</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{notif.message}</p>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 -mr-2 -mt-1 flex-shrink-0"
                      aria-label="Dismiss notification"
                      onClick={() => dismissNotification(notif.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* New order details and action buttons */}
                  {isNewOrder && notif.orderData && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {notif.orderData.orderType && (() => {
                          const TypeIcon = getOrderTypeIcon(notif.orderData!.orderType);
                          return (
                            <span className="flex items-center gap-1 capitalize">
                              <TypeIcon className="w-3 h-3" />
                              {notif.orderData!.orderType}
                            </span>
                          );
                        })()}
                        {notif.orderData.itemCount !== undefined && (
                          <span>{notif.orderData.itemCount} item{notif.orderData.itemCount !== 1 ? 's' : ''}</span>
                        )}
                        {notif.orderData.total !== undefined && (
                          <span className="font-medium text-foreground">${notif.orderData.total.toFixed(2)}</span>
                        )}
                        {notif.orderData.eta && (
                          <span>ETA: {notif.orderData.eta}</span>
                        )}
                      </div>

                      {!notif.autoApproved && notif.orderData.orderId && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="venue-dialog-primary-action flex-1 h-8 text-xs"
                            disabled={isApproving}
                            onClick={() => {
                              void approveOrder(notif).then((approved) => {
                                if (approved) dismissNotification(notif.id);
                              });
                            }}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            {isApproving ? "Approving..." : "Approve"}
                          </Button>
                        </div>
                      )}

                      {!notif.autoApproved && (
                        <p className="text-[10px] text-muted-foreground text-center">Swipe to dismiss</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
