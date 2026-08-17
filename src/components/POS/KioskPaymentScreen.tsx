import { useState } from 'react';
import { motion } from 'framer-motion';
import { Smartphone, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentQRModal } from '@/components/Payment/PaymentQRModal';
import { TapToReceiveModal } from '@/components/POS/TapToReceiveModal';
import { useCurrency } from '@/hooks/useCurrency';
import { useNFCPayment } from '@/hooks/useNFCPayment';
import './kiosk-payment-screen.css';

interface KioskPaymentScreenProps {
  venueId: string;
  venueName: string;
  orderId?: string;
  amount: number;
  onPaymentComplete: (transactionId: string, method: string) => void;
  onCancel: () => void;
}

export const KioskPaymentScreen = ({
  venueId,
  venueName,
  orderId,
  amount,
  onPaymentComplete,
  onCancel
}: KioskPaymentScreenProps) => {
  const { formatCurrency } = useCurrency();
  const { isNFCSupported } = useNFCPayment();
  const [showQRModal, setShowQRModal] = useState(false);
  const [showNFCModal, setShowNFCModal] = useState(false);

  const platformFee = 0.10;
  const total = amount + platformFee;

  const handleNFCComplete = (transactionId: string) => {
    setShowNFCModal(false);
    onPaymentComplete(transactionId, 'nfc_tap');
  };

  const handleQRComplete = () => {
    setShowQRModal(false);
    onPaymentComplete('qr-payment', 'qr_scan');
  };

  return (
    <div className="pos-kiosk-payment">
      <main className="pos-kiosk-payment__content">
        <motion.header
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="pos-kiosk-payment__header"
        >
          <p className="pos-kiosk-payment__eyebrow">PAYMENT KIOSK</p>
          <h1>{venueName}</h1>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="pos-kiosk-payment__amount"
        >
          <span>Amount due</span>
          <strong>{formatCurrency(amount)}</strong>
          <small>+ {formatCurrency(platformFee)} platform fee = {formatCurrency(total)} total</small>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="pos-kiosk-payment__methods"
          aria-label="Payment methods"
        >
          <Button
            type="button"
            onClick={() => setShowNFCModal(true)}
            disabled={!isNFCSupported}
            className="pos-kiosk-payment__method"
          >
            <motion.span
              className="pos-kiosk-payment__method-icon"
              animate={isNFCSupported ? { scale: [1, 1.04, 1] } : undefined}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Smartphone />
            </motion.span>
            <strong>Tap phone here</strong>
            {!isNFCSupported && <small>NFC not available</small>}
          </Button>

          <Button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="pos-kiosk-payment__method"
          >
            <span className="pos-kiosk-payment__method-icon">
              <QrCode />
            </span>
            <strong>Scan QR code</strong>
          </Button>
        </motion.section>

        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="pos-kiosk-payment__cancel"
        >
          Cancel payment
        </Button>
      </main>

      {/* NFC Modal */}
      <TapToReceiveModal
        isOpen={showNFCModal}
        onClose={() => setShowNFCModal(false)}
        orderId={orderId}
        amount={amount}
        venueId={venueId}
        onPaymentComplete={handleNFCComplete}
        onFallbackToQR={() => {
          setShowNFCModal(false);
          setShowQRModal(true);
        }}
      />

      {/* QR Modal */}
      <PaymentQRModal
        open={showQRModal}
        onOpenChange={setShowQRModal}
        venueId={venueId}
        orderId={orderId}
        amount={amount}
        onPaymentComplete={handleQRComplete}
      />
    </div>
  );
};
