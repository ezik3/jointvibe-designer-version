import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CircleCheck, CircleX, Loader2, QrCode, Smartphone, Wifi } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNFCPayment } from '@/hooks/useNFCPayment';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useCurrency } from '@/hooks/useCurrency';
import './pos-payment-accept-modal.css';

interface TapToReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  amount: number;
  venueId: string;
  onPaymentComplete: (transactionId: string) => void;
  onFallbackToQR: () => void;
}

export const TapToReceiveModal = ({
  isOpen,
  onClose,
  orderId,
  amount,
  venueId,
  onPaymentComplete,
  onFallbackToQR,
}: TapToReceiveModalProps) => {
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const { isNFCSupported, startReceiving, stopNFC } = useNFCPayment();

  const [status, setStatus] = useState<'waiting' | 'processing' | 'success' | 'error'>('waiting');
  const [errorMessage, setErrorMessage] = useState('');

  const platformFee = 0.10;
  const totalAmount = amount + platformFee;

  const startNFCReceiver = async () => {
    setStatus('waiting');
    setErrorMessage('');

    const success = await startReceiving(async (customerData) => {
      setStatus('processing');

      try {
        const { data, error } = await supabase.functions.invoke('process-nfc-payment', {
          body: {
            customer_id: customerData.customerId,
            customer_session_token: customerData.sessionToken,
            order_id: orderId,
            amount,
            venue_id: venueId,
            employee_id: user?.id,
          },
        });

        if (error || !data.success) {
          throw new Error(data?.error || error?.message || 'Payment failed');
        }

        setStatus('success');

        toast({
          title: 'Payment Received!',
          description: `${formatCurrency(amount)} received successfully`,
        });

        setTimeout(() => {
          onPaymentComplete(data.transaction_id);
        }, 2000);
      } catch (error: any) {
        console.error('NFC payment error:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Payment processing failed');
      }
    });

    if (!success) {
      setStatus('error');
      setErrorMessage('Failed to start NFC receiver');
    }
  };

  useEffect(() => {
    if (isOpen && isNFCSupported) {
      startNFCReceiver();
    }

    return () => {
      stopNFC();
    };
  }, [isOpen]);

  const handleClose = () => {
    stopNFC();
    onClose();
  };

  const handleRetry = () => {
    startNFCReceiver();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="pos-payment-accept-dialog">
        <DialogHeader className="pos-payment-accept-dialog__heading">
          <DialogTitle>
            <Smartphone />
            Tap to receive
          </DialogTitle>
          <p>Keep the customer's phone close to this terminal.</p>
        </DialogHeader>

        <div className="pos-payment-accept-dialog__body">
          <section className="pos-payment-accept-modal__amount">
            <span>Collecting</span>
            <strong>{formatCurrency(amount)}</strong>
            <small>+ {formatCurrency(platformFee)} fee = {formatCurrency(totalAmount)} total</small>
          </section>

          <AnimatePresence mode="wait">
            {status === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="pos-payment-accept-modal__waiting"
              >
                {isNFCSupported ? (
                  <>
                    <motion.div
                      className="pos-payment-accept-modal__device"
                      animate={{ scale: [1, 1.04, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Smartphone />
                    </motion.div>
                    <div className="pos-payment-accept-modal__instruction">
                      <strong>Ask customer to tap their phone</strong>
                      <span>Hold it near this terminal to complete payment.</span>
                      <small>NFC active - waiting for a tap.</small>
                    </div>
                  </>
                ) : (
                  <div className="pos-payment-accept-modal__state pos-payment-accept-modal__state--error">
                    <AlertCircle />
                    <strong>NFC not available</strong>
                    <p>This device does not support NFC payments.</p>
                  </div>
                )}

                <section className="pos-payment-accept-modal__fallback">
                  <span>Or use QR code instead</span>
                  <Button
                    variant="outline"
                    onClick={onFallbackToQR}
                    className="pos-payment-accept-modal__button"
                  >
                    <QrCode />
                    Use QR code
                  </Button>
                </section>
              </motion.div>
            )}

            {status === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="pos-payment-accept-modal__state"
              >
                <Loader2 className="animate-spin" />
                <strong>Processing payment</strong>
                <p>Please wait while we verify the transaction.</p>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pos-payment-accept-modal__state"
              >
                <CircleCheck />
                <strong>Payment received</strong>
                <p>{formatCurrency(amount)} collected successfully.</p>
              </motion.div>
            )}

            {status === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pos-payment-accept-modal__state pos-payment-accept-modal__state--error"
              >
                <CircleX />
                <strong>Payment failed</strong>
                <p>{errorMessage}</p>
                <div className="pos-payment-accept-modal__actions">
                  <Button variant="outline" onClick={handleRetry} className="pos-payment-accept-modal__button">
                    Try again
                  </Button>
                  <Button variant="outline" onClick={onFallbackToQR} className="pos-payment-accept-modal__button">
                    <QrCode />
                    Use QR
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className={`pos-payment-accept-modal__connection${isNFCSupported ? '' : ' is-unavailable'}`}>
          {isNFCSupported ? <Wifi /> : <AlertCircle />}
          <span>{isNFCSupported ? 'NFC active' : 'NFC unavailable'}</span>
          <b aria-hidden="true">.</b>
          <span>Tap to receive</span>
        </footer>
      </DialogContent>
    </Dialog>
  );
};
