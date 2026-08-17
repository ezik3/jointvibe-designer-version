import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { 
  QrCode, 
  Loader2,
  Clock,
  RefreshCw,
  X,
  Send
} from "lucide-react";
import { PaymentStatus } from "@/components/Payment/PaymentStatus";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { SendPaymentLinkModal } from "./SendPaymentLinkModal";
import { useTranslation } from 'react-i18next';
import "./pos-payment-flow-modal.css";
interface PaymentQRModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  orderId?: string;
  amount: number;
  onPaymentComplete?: () => void;
}

export function PaymentQRModal({
  open,
  onOpenChange,
  venueId,
  orderId,
  amount,
  onPaymentComplete,
}: PaymentQRModalProps) {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<{
    qr_data: string;
    payment_request_id: string;
    expires_at: string;
    total: number;
  } | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showSendLinkModal, setShowSendLinkModal] = useState(false);

  const platformFee = 0.10;
  const totalWithFee = amount + platformFee;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate QR code
  const generateQR = async () => {
    // Client-side guard for zero amount
    if (amount <= 0) {
      setErrorMessage("Order total is $0.00. Add items before generating a QR.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to generate payment QR");
        setErrorMessage("Not logged in");
        return;
      }

      const response = await supabase.functions.invoke('generate-payment-qr', {
        body: { venue_id: venueId, order_id: orderId, amount },
      });

      if (response.error) {
        const errMsg = response.error.message || "Failed to generate QR code";
        toast.error(errMsg);
        setErrorMessage(errMsg);
        return;
      }

      // Check for error in response body
      if (response.data?.error) {
        toast.error(response.data.error);
        setErrorMessage(response.data.error);
        return;
      }

      setQrData(response.data);
      setPaymentComplete(false);
    } catch (error: any) {
      const errMsg = error?.message || "Failed to generate QR code";
      toast.error(errMsg);
      setErrorMessage(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Generate on open
  useEffect(() => {
    if (open && !qrData) {
      generateQR();
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!qrData?.expires_at) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(qrData.expires_at).getTime();
      const diff = Math.max(0, Math.floor((expiry - now) / 1000));
      setTimeLeft(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [qrData?.expires_at]);

  // Subscribe to payment completion
  useEffect(() => {
    if (!qrData?.payment_request_id) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`payment-${qrData.payment_request_id}`))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_requests',
          filter: `id=eq.${qrData.payment_request_id}`,
        },
        (payload) => {
          if (payload.new.status === 'completed') {
            setPaymentComplete(true);
            toast.success("Payment received!");
            onPaymentComplete?.();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qrData?.payment_request_id, onPaymentComplete]);

  const handleClose = () => {
    setQrData(null);
    setPaymentComplete(false);
    onOpenChange(false);
  };

  const copyLink = () => {
    if (qrData?.qr_data) {
      navigator.clipboard.writeText(qrData.qr_data);
      toast.success("Payment link copied!");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="pos-qr-payment-dialog !gap-0 !p-0">
        <DialogHeader className="pos-payment-flow__heading !space-y-0">
          <DialogTitle>
            <QrCode />
            Payment QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="pos-payment-flow__body pos-payment-flow__body--qr">
          {loading ? (
            <div className="pos-payment-flow__loading">
              <Loader2 className="animate-spin" />
              <p>Generating QR code...</p>
            </div>
          ) : paymentComplete ? (
            <div className="pos-payment-flow__status-panel">
              <PaymentStatus
                state="success"
                title="Payment Received!"
                subtitle="Funds have been credited"
                amount={`$${totalWithFee.toFixed(2)}`}
              />
              <Button className="pos-payment-flow__button pos-payment-flow__button--primary" onClick={handleClose}>
                Done
              </Button>
            </div>
          ) : qrData ? (
            <>
              <p className={`pos-payment-flow__expiry${timeLeft < 60 ? " is-expiring" : ""}`}>
                <Clock aria-hidden="true" /> Expires in {formatTime(timeLeft)}
              </p>

              <div className="pos-payment-flow__qr pos-payment-flow__qr--large">
                <QRCodeSVG
                  value={qrData.qr_data}
                  size={184}
                  level="H"
                  includeMargin
                />
              </div>

              <div className="pos-payment-flow__amount">
                <span>Amount to collect</span>
                <strong>${totalWithFee.toFixed(2)}</strong>
                <small>
                  (${amount.toFixed(2)} + ${platformFee.toFixed(2)} fee)
                </small>
              </div>

              <div className="pos-payment-flow__actions">
                <Button className="pos-payment-flow__button pos-payment-flow__button--primary" onClick={() => setShowSendLinkModal(true)}>
                  <Send />
                  Send Link
                </Button>
                <Button variant="outline" className="pos-payment-flow__button pos-payment-flow__button--secondary" onClick={generateQR}>
                  <RefreshCw />
                  Refresh
                </Button>
              </div>

              <p className="pos-payment-flow__note">
                Customer scans this code or receives the payment link to pay
              </p>

              {/* Send Payment Link Modal */}
              <SendPaymentLinkModal
                open={showSendLinkModal}
                onOpenChange={setShowSendLinkModal}
                venueId={venueId}
                paymentLink={qrData.qr_data}
                amount={totalWithFee}
              />
            </>
          ) : (
            <div className="pos-payment-flow__error">
              <X aria-hidden="true" />
              <p>Failed to generate QR</p>
              {errorMessage && (
                <small>{errorMessage}</small>
              )}
              <Button className="pos-payment-flow__button pos-payment-flow__button--primary" onClick={generateQR}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
