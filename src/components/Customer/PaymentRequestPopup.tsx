import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, CreditCard, Store, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';

interface PaymentNotification {
  id: string;
  title: string;
  message: string;
  reference_id: string; // payment_request.id (UUID)
}

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface PaymentDetails {
  venue_name: string;
  amount: number;
  fee: number;
  total: number;
  order_id?: string;
  items: OrderItem[];
}

const PaymentRequestPopup = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notification, setNotification] = useState<PaymentNotification | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pinAlertData, setPinAlertData] = useState<{ title: string; message: string } | null>(null);
  const shownIdsRef = useRef<Set<string>>(new Set());

  // Fetch payment details when notification arrives
  const fetchPaymentDetails = async (referenceId: string) => {
    setLoadingDetails(true);
    try {
      // Fetch payment request details
      const prResponse = await supabase.functions.invoke('get-payment-request', {
        body: { qr_token: referenceId },
      });

      if (prResponse.error || !prResponse.data) {
        console.warn('[PaymentRequestPopup] Could not fetch payment details:', prResponse.error);
        setPaymentDetails(null);
        return;
      }

      const pr = prResponse.data;
      let items: OrderItem[] = [];

      // Fetch order items if order_id exists
      if (pr.order_id) {
        const itemsResponse = await supabase.functions.invoke('get-order-items', {
          body: { order_id: pr.order_id },
        });

        if (itemsResponse.data?.success && itemsResponse.data?.items) {
          items = itemsResponse.data.items;
        }
      }

      setPaymentDetails({
        venue_name: pr.venue_name || t('payment_popup.venue_default'),
        amount: pr.amount || 0,
        fee: pr.fee || 0.10,
        total: pr.total || pr.amount + 0.10,
        order_id: pr.order_id,
        items,
      });
    } catch (err) {
      console.error('[PaymentRequestPopup] Error fetching details:', err);
      setPaymentDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (!user) {
      console.log('[PaymentRequestPopup] No user, skipping');
      return;
    }

    console.log('[PaymentRequestPopup] Initializing for user:', user.id);

    let cancelled = false;
    
    const showNotification = async (n: any, source: 'realtime' | 'poll') => {
      if (cancelled) return;

      // Handle staff_invite type: show as a simple toast + don't block payment popup
      if (n?.type === 'staff_invite' && n?.reference_id) {
        if (shownIdsRef.current.has(n.id)) return;
        shownIdsRef.current.add(n.id);
        const { toast: showToast } = await import('sonner');
        showToast.info(n.title || t('payment_popup.new_staff_invite'), {
          description: n.message || t('payment_popup.new_staff_desc'),
          duration: 8000,
        });
        return;
      }

      // Handle pin_resend_request: show as modal overlay
      if (n?.type === 'pin_resend_request') {
        if (shownIdsRef.current.has(n.id)) return;
        shownIdsRef.current.add(n.id);
        setPinAlertData({
          title: n.title || t('payment_popup.new_pin_requested'),
          message: n.message || t('payment_popup.new_pin_default_msg'),
        });
        return;
      }

      if (n?.type !== 'payment_request' || !n?.reference_id) {
        console.log('[PaymentRequestPopup] Skipping non-payment notification:', n?.type);
        return;
      }

      // Dedupe: don't show same notification twice in this session
      if (shownIdsRef.current.has(n.id)) {
        console.log('[PaymentRequestPopup] Already shown in session:', n.id);
        return;
      }

      console.log('[PaymentRequestPopup] SHOW', { source, id: n.id, reference_id: n.reference_id });

      shownIdsRef.current.add(n.id);
      setNotification({
        id: n.id,
        title: n.title,
        message: n.message,
        reference_id: n.reference_id,
      });
      setVisible(true);

      // Fetch payment details for rich display
      await fetchPaymentDetails(n.reference_id);

      // Auto-hide after 20 seconds
      setTimeout(() => {
        setVisible(false);
      }, 20000);
    };

    // StrictMode can replay this effect before async channel cleanup finishes.
    // A per-effect topic prevents Supabase from reusing a subscribed channel.
    const channelId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

    // Subscribe to new payment request notifications (realtime)
    const channel = supabase
      .channel(`payment-request-popup-${user.id}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'customer_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[PaymentRequestPopup] Realtime INSERT:', payload.new);
          void showNotification(payload.new, 'realtime');
        }
      )
      .subscribe((status) => {
        console.log('[PaymentRequestPopup] Realtime subscription status:', status);
      });

    // Fallback polling - ONLY on initial load, not continuous
    // Realtime handles ongoing notifications; this catches anything missed at startup
    const initialPoll = async () => {
      if (cancelled) return;
      
      try {
        const { data, error } = await supabase
          .from('customer_notifications')
          .select('id, title, message, reference_id, type, read, created_at')
          .eq('user_id', user.id)
          .eq('type', 'payment_request')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.warn('[PaymentRequestPopup] Initial poll error:', error.message);
          return;
        }

        const latest = data?.[0];
        if (latest) {
          const createdAtMs = Date.parse(latest.created_at);
          const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : Number.NaN;

          // Only surface *recent* notifications (< 60 seconds old) on initial load
          if (!Number.isNaN(ageMs) && ageMs < 60_000) {
            console.log('[PaymentRequestPopup] Initial poll found recent notification:', latest.id);
            void showNotification(latest, 'poll');
          }
        }
      } catch (err) {
        console.warn('[PaymentRequestPopup] Initial poll exception:', err);
      }
    };

    // Single initial poll - no continuous polling (realtime handles the rest)
    void initialPoll();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      console.log('[PaymentRequestPopup] Cleanup');
    };
  }, [user]);

  const handleViewPayment = async () => {
    if (!notification) return;

    console.log('[PaymentRequestPopup] Navigate to pay:', notification.reference_id);

    // Mark notification as read
    await supabase
      .from('customer_notifications')
      .update({ read: true })
      .eq('id', notification.id);

    setVisible(false);
    
    // Navigate to payment page using reference_id (payment_request.id UUID)
    navigate(`/app/pay/${notification.reference_id}`);
  };

  const handleDismiss = () => {
    console.log('[PaymentRequestPopup] Dismissed');
    setVisible(false);
  };

  // Calculate items total
  const itemsTotal = paymentDetails?.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
  const displayAmount = itemsTotal > 0 ? itemsTotal : paymentDetails?.amount || 0;
  const displayTotal = displayAmount + (paymentDetails?.fee || 0.10);

  // Extract PIN code from message like "... New code: 482917"
  const extractPin = (msg: string) => {
    const match = msg.match(/New code:\s*(\d{6})/);
    return match ? match[1] : null;
  };

  return (
    <>
      {/* PIN Resend Alert Modal */}
      <AnimatePresence mode="wait">
        {pinAlertData && (
          <motion.div
            key="pin-alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="customer-modal-overlay fixed inset-0 z-[200] flex items-center justify-center px-4"
            onClick={() => setPinAlertData(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="customer-modal-panel max-w-sm w-full p-6 space-y-5 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center animate-scale-in">
                  <Lock className="h-8 w-8 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-foreground">{pinAlertData.title}</h3>
              </div>

              {extractPin(pinAlertData.message) ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-sm text-center">
                    {pinAlertData.message.split("New code:")[0].trim()}
                  </p>
                  <div className="customer-modal-list-item p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{t('payment_popup.new_pin_code')}</p>
                    <p className="text-3xl font-mono font-bold text-amber-400 tracking-[0.3em] tabular-nums">
                      {extractPin(pinAlertData.message)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">{t('payment_popup.share_verbally')}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center">{pinAlertData.message}</p>
              )}

              <Button
                onClick={() => setPinAlertData(null)}
                className="customer-modal-primary w-full h-12 font-semibold text-base active:scale-[0.97] duration-fast"
              >
                {t('payment_popup.got_it')}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Request Popup */}
      <AnimatePresence mode="wait">
        {visible && notification && (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: -100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -100, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-4 left-4 right-4 z-[100] mx-auto max-w-md"
          >
            <div className="customer-modal-panel overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--customer-modal-line)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/15 border border-primary/30 rounded-full">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-lg">{notification.title}</h3>
                    {paymentDetails && (
                      <p className="text-muted-foreground text-sm flex items-center gap-1">
                        <Store className="h-3 w-3" />
                        {paymentDetails.venue_name}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDismiss}
                  className="customer-modal-secondary h-8 w-8 p-0 active:scale-95 duration-fast"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-4">
                {loadingDetails ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : paymentDetails && paymentDetails.items.length > 0 ? (
                  <div className="space-y-2">
                    {paymentDetails.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between text-foreground/90 text-sm tabular-nums">
                        <span>{item.quantity}x {item.name}</span>
                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {paymentDetails.items.length > 3 && (
                      <p className="text-muted-foreground text-xs">
                        {t('payment_popup.more_items', { count: paymentDetails.items.length - 3 })}
                      </p>
                    )}
                    <div className="border-t border-[var(--customer-modal-line)] pt-2 mt-2">
                      <div className="flex justify-between text-foreground font-bold tabular-nums">
                        <span>{t('order.total')}</span>
                        <span>${displayTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-foreground/90 text-sm">{notification.message}</p>
                    {paymentDetails && (
                      <div className="flex justify-between text-foreground font-bold pt-2 tabular-nums">
                        <span>{t('payment_popup.amount_due')}</span>
                        <span>${displayTotal.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 pt-0 flex gap-3">
                <Button
                  variant="secondary"
                  onClick={handleDismiss}
                  className="customer-modal-secondary flex-1 active:scale-[0.97] duration-fast"
                >
                  {t('payment_popup.later')}
                </Button>
                <Button
                  onClick={handleViewPayment}
                  className="customer-modal-primary flex-1 font-semibold active:scale-[0.97] duration-fast"
                >
                  <Store className="h-4 w-4 mr-2" />
                  {t('payment_popup.view_pay')}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PaymentRequestPopup;
