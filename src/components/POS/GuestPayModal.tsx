import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { 
  ExternalLink, 
  Copy, 
  Loader2, 
  Clock,
  Smartphone,
} from "lucide-react";
import { PaymentStatus } from "@/components/Payment/PaymentStatus";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useCurrency } from "@/hooks/useCurrency";
import { useTranslation } from 'react-i18next';
import "@/components/Payment/pos-payment-flow-modal.css";

interface GuestPayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  venueName: string;
  orderId?: string;
  orderNumber: number;
  amount: number;
  orderItems?: Array<{ name: string; price: number; quantity: number }>;
  onPaymentComplete: () => void;
}

export function GuestPayModal({
  open,
  onOpenChange,
  venueId,
  venueName,
  orderId,
  orderNumber,
  amount,
  orderItems,
  onPaymentComplete,
}: GuestPayModalProps) {
  const { t } = useTranslation('pos');
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [timeRemaining, setTimeRemaining] = useState(1800); // 30 minutes

  const platformFee = 0.10;
  const totalAmount = amount + platformFee;

  // Create checkout session on mount
  useEffect(() => {
    if (open && !checkoutUrl && paymentStatus === 'idle') {
      createCheckoutSession();
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (paymentStatus !== 'pending' || timeRemaining <= 0) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setPaymentStatus('failed');
          toast.error('Payment session expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [paymentStatus, timeRemaining]);

  // Listen for payment completion via realtime
  useEffect(() => {
    if (!sessionId || paymentStatus !== 'pending') return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`guest-payment-${sessionId}`))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'guest_payments',
          filter: `stripe_session_id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('Guest payment update:', payload);
          if (payload.new && (payload.new as any).status === 'completed') {
            setPaymentStatus('completed');
            toast.success('Payment received!');
            setTimeout(() => {
              onPaymentComplete();
              onOpenChange(false);
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, paymentStatus]);

  const createCheckoutSession = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-guest-checkout', {
        body: {
          venue_id: venueId,
          order_id: orderId,
          amount,
          order_number: orderNumber,
          order_items: orderItems,
        },
      });

      if (error) throw error;

      setCheckoutUrl(data.checkout_url);
      setClaimToken(data.claim_token);
      setSessionId(data.session_id);
      setPaymentStatus('pending');
      setTimeRemaining(data.expires_in || 1800);
    } catch (error) {
      console.error('Error creating guest checkout:', error);
      toast.error('Failed to create payment link');
      setPaymentStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (checkoutUrl) {
      navigator.clipboard.writeText(checkoutUrl);
      toast.success('Payment link copied!');
    }
  };

  const openInNewTab = () => {
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    if (paymentStatus === 'pending') {
      // Confirm before closing
      if (!confirm('Payment is pending. Are you sure you want to close?')) {
        return;
      }
    }
    onOpenChange(false);
    // Reset state
    setCheckoutUrl(null);
    setClaimToken(null);
    setSessionId(null);
    setPaymentStatus('idle');
    setTimeRemaining(1800);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="pos-guest-payment-dialog !gap-0 !p-0">
        <DialogHeader className="pos-payment-flow__heading !space-y-0">
          <DialogTitle>
            <ExternalLink />
            Guest Payment
            <span>Order #{orderNumber}</span>
          </DialogTitle>
          <DialogDescription>Customer pays without the app.</DialogDescription>
        </DialogHeader>

        <div className="pos-payment-flow__body pos-payment-flow__body--guest">
          <section className="pos-payment-flow__amount-card">
            <span>Total to pay</span>
            <strong>{formatCurrency(totalAmount)}</strong>
            <small>
              Includes ${platformFee.toFixed(2)} platform fee
            </small>
          </section>

          {loading && (
            <div className="pos-payment-flow__loading">
              <Loader2 className="animate-spin" />
              <p>Generating payment link...</p>
            </div>
          )}

          {paymentStatus === 'pending' && checkoutUrl && (
            <>
              <p className="pos-payment-flow__expiry"><Clock aria-hidden="true" /> Expires in {formatTime(timeRemaining)}</p>

              <div className="pos-payment-flow__qr pos-payment-flow__qr--guest">
                <QRCodeSVG
                  value={checkoutUrl}
                  size={200}
                  level="H"
                  includeMargin
                />
              </div>

              <p className="pos-payment-flow__phone-note">
                <Smartphone aria-hidden="true" />
                <span>Customer scans with phone camera to pay</span>
              </p>

              <div className="pos-payment-flow__actions">
                <Button variant="outline" className="pos-payment-flow__button pos-payment-flow__button--secondary" onClick={copyLink}>
                  <Copy />
                  Copy Link
                </Button>
                <Button variant="outline" className="pos-payment-flow__button pos-payment-flow__button--secondary" onClick={openInNewTab}>
                  <ExternalLink />
                  Open Link
                </Button>
              </div>

              <p className="pos-payment-flow__waiting"><Loader2 className="animate-spin" /> Waiting for payment...</p>
            </>
          )}

          {paymentStatus === 'completed' && (
            <div className="pos-payment-flow__status-panel">
              <PaymentStatus
                state="success"
                title="Payment Received!"
                amount={formatCurrency(totalAmount)}
              />
            </div>
          )}

          {paymentStatus === 'failed' && (
            <div className="pos-payment-flow__status-panel">
              <PaymentStatus
                state="error"
                title="Payment Failed or Expired"
              />
              <Button onClick={createCheckoutSession} disabled={loading} className="pos-payment-flow__button pos-payment-flow__button--primary">
                {loading ? <Loader2 className="animate-spin" /> : null}
                Try Again
              </Button>
            </div>
          )}

          {/* Attribution note */}
          {paymentStatus === 'pending' && (
            <p className="pos-payment-flow__note">
              Customer receives app download link after payment. If they sign up within 30 days, 
              the venue gets attribution credit.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
