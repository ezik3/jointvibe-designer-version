import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bluetooth, BluetoothOff, CircleCheck, CircleX, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProximityPayment } from '@/hooks/useProximityPayment';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import './pos-payment-accept-modal.css';

interface BLEAcceptPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: (transactionId: string) => void;
  amount: number;
  orderId?: string;
  venueId: string;
  venueName: string;
  terminalId?: string;
}

type PaymentStatus = 'setup' | 'waiting' | 'received' | 'success' | 'error';

export function BLEAcceptPaymentModal({
  isOpen,
  onClose,
  onPaymentComplete,
  amount,
  orderId,
  venueId,
  venueName,
  terminalId,
}: BLEAcceptPaymentModalProps) {
  const { user } = useAuth();
  const { jvcToLocal, userCurrency } = useCurrency();
  const proximity = useProximityPayment();

  const startedRef = useRef(false);
  const cleanupRef = useRef<null | (() => void)>(null);

  const [status, setStatus] = useState<PaymentStatus>('setup');
  const [confirmationCode, setConfirmationCode] = useState<string>('');
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [countdown, setCountdown] = useState(30);

  const platformFee = 0.10;
  const totalAmount = amount + platformFee;

  const formatAmount = (value: number) => {
    const localAmount = jvcToLocal(value);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: userCurrency,
      minimumFractionDigits: 2,
    }).format(localAmount);
  };

  const startAccepting = useCallback(async () => {
    if (!user) {
      setStatus('error');
      setErrorMessage('You must be logged in');
      return;
    }

    try {
      setStatus('setup');
      setErrorMessage('');

      const code = proximity.generateConfirmationCode();
      setConfirmationCode(code);

      const qrTokenValue = `${crypto.randomUUID()}-${Date.now().toString(36)}`;
      const expiresAt = new Date(Date.now() + 60 * 1000);

      const { data: pr, error: prError } = await supabase
        .from('payment_requests')
        .insert({
          venue_id: venueId,
          amount,
          fee: platformFee,
          qr_token: qrTokenValue,
          order_id: orderId || null,
          created_by: user.id,
          expires_at: expiresAt.toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (prError) {
        console.error('Payment request creation failed:', prError);
        throw new Error(prError.message || 'Failed to create payment request');
      }

      setPaymentRequestId(pr.id);
      setQrToken(qrTokenValue);

      if (proximity.paymentState.preferredMethod === 'ble') {
        const success = await proximity.startAccepting({
          venueId,
          terminalId: terminalId || user.id,
          terminalName: `POS ${terminalId?.substring(0, 4) || 'Main'}`,
          vpkShort: '',
          amount,
          paymentRequestId: pr.id,
        });

        if (!success) {
          console.warn('BLE advertising failed, QR fallback available');
        }
      }

      setStatus('waiting');
      setCountdown(60);

      const channel = supabase
        .channel(createRealtimeChannelTopic(`payment-${pr.id}`))
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'payment_requests',
            filter: `id=eq.${pr.id}`,
          },
          (payload) => {
            if (payload.new.status === 'completed') {
              setStatus('success');
              proximity.stopAccepting();
              onPaymentComplete(payload.new.id);
            }
          },
        )
        .subscribe();

      cleanupRef.current = () => {
        supabase.removeChannel(channel);
      };
    } catch (error: any) {
      console.error('Failed to start accepting:', error);
      setStatus('error');
      setErrorMessage(error?.message || 'Failed to create payment request. Please try again.');
    }
  }, [user, venueId, amount, orderId, platformFee, terminalId, proximity, onPaymentComplete]);

  useEffect(() => {
    if (status !== 'waiting') return;

    const interval = setInterval(() => {
      setCountdown((previous) => {
        if (previous <= 1) {
          setStatus('error');
          setErrorMessage('Payment request expired. Tap "Try Again" to create a new one.');
          proximity.stopAccepting();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, proximity]);

  useEffect(() => {
    if (!isOpen || startedRef.current) return;
    startedRef.current = true;
    startAccepting();
  }, [isOpen, startAccepting]);

  useEffect(() => {
    if (!isOpen) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      startedRef.current = false;
      proximity.stopAccepting();
      setStatus('setup');
      setPaymentRequestId(null);
      setQrToken(null);
    }
  }, [isOpen, proximity]);

  const handleRetry = () => {
    setStatus('setup');
    startAccepting();
  };

  const handleClose = () => {
    proximity.stopAccepting();
    onClose();
  };

  const isBle = proximity.paymentState.preferredMethod === 'ble';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="pos-payment-accept-dialog">
        <DialogHeader className="pos-payment-accept-dialog__heading">
          <DialogTitle>
            <Bluetooth />
            Accept payment
          </DialogTitle>
          <p>Ask the customer to confirm the code on their phone.</p>
        </DialogHeader>

        <div className="pos-payment-accept-dialog__body">
          <section className="pos-payment-accept-modal__amount">
            <span>Collecting</span>
            <strong>{formatAmount(amount)}</strong>
            <small>+ {formatAmount(platformFee)} fee = {formatAmount(totalAmount)} total</small>
          </section>

          <AnimatePresence mode="wait">
            {status === 'setup' && (
              <motion.div
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pos-payment-accept-modal__state"
              >
                <Loader2 className="animate-spin" />
                <strong>Setting up payment</strong>
                <p>Creating a secure payment request.</p>
              </motion.div>
            )}

            {status === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pos-payment-accept-modal__waiting"
              >
                <section className="pos-payment-accept-modal__code">
                  <span>Confirmation code</span>
                  <strong>{confirmationCode}</strong>
                </section>

                {isBle && (
                  <motion.div
                    className="pos-payment-accept-modal__device"
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Smartphone />
                  </motion.div>
                )}

                <div className="pos-payment-accept-modal__instruction">
                  <strong>{isBle ? 'Ask customer to tap Pay Nearby' : 'Ask customer to scan the QR code'}</strong>
                  <span>They should match code <b>{confirmationCode}</b>.</span>
                  <small>Expires in <b>{countdown}s</b></small>
                </div>

                {qrToken && (
                  <section className="pos-payment-accept-modal__fallback">
                    <span>Or use QR code</span>
                    <div className="pos-payment-accept-modal__qr">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(proximity.getQRFallbackUrl(paymentRequestId!, qrToken))}`}
                        alt="Payment QR"
                      />
                    </div>
                  </section>
                )}
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
                <p>{formatAmount(amount)} collected successfully.</p>
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
                    <RefreshCw />
                    Try again
                  </Button>
                  <Button variant="outline" onClick={handleClose} className="pos-payment-accept-modal__button">
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="pos-payment-accept-modal__connection">
          {isBle ? (
            <>
              <Bluetooth />
              <span>Bluetooth active</span>
            </>
          ) : (
            <>
              <BluetoothOff />
              <span>Using QR code</span>
            </>
          )}
          <b aria-hidden="true">.</b>
          <span>{venueName}</span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
