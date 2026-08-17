import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Wifi, X, Loader2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNFCPayment } from '@/hooks/useNFCPayment';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface TapToPayButtonProps {
  onFallbackToQR?: () => void;
}

export const TapToPayButton = ({ onFallbackToQR }: TapToPayButtonProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { 
    isNFCSupported, 
    isBroadcasting, 
    startBroadcast, 
    stopNFC 
  } = useNFCPayment();
  
  const [showNFCMode, setShowNFCMode] = useState(false);
  const [countdown, setCountdown] = useState(60);

  // Auto-stop after 60 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isBroadcasting && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (countdown === 0) {
      handleCancel();
    }
    return () => clearTimeout(timer);
  }, [isBroadcasting, countdown]);

  const handleTapToPay = async () => {
    if (!user?.id) return;
    
    setShowNFCMode(true);
    setCountdown(60);
    
    // Generate a session token (in production, this would be a proper JWT)
    const sessionToken = btoa(`${user.id}:${Date.now()}`);
    
    const success = await startBroadcast(user.id, sessionToken);
    if (!success) {
      setShowNFCMode(false);
    }
  };

  const handleCancel = () => {
    stopNFC();
    setShowNFCMode(false);
    setCountdown(60);
  };

  // If NFC not supported, show QR Code as primary option
  if (!isNFCSupported) {
    return onFallbackToQR ? (
      <Button
        onClick={onFallbackToQR}
        className="customer-modal-primary w-full h-12 font-medium"
      >
        <QrCode className="w-4 h-4 mr-2" />
        <span className="text-sm">Pay with QR Code</span>
      </Button>
    ) : null;
  }

  return (
    <>
      {/* NFC Tap to Pay - Primary when supported */}
      <Button
        onClick={handleTapToPay}
        disabled={isBroadcasting}
        className="customer-modal-primary w-full h-12 font-medium"
      >
        <Smartphone className="w-4 h-4 mr-2" />
        <span className="text-sm">Tap to Pay</span>
      </Button>

      {/* NFC Active Overlay */}
      <AnimatePresence>
        {showNFCMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="customer-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="customer-modal-panel text-center max-w-sm w-full p-6"
            >
              {/* Pulsing NFC animation */}
              <div className="relative w-40 h-40 mx-auto mb-6">
                <motion.div
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.5, 0, 0.5]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute inset-0 rounded-full bg-primary/20"
                />
                <motion.div
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.7, 0, 0.7]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.3
                  }}
                  className="absolute inset-4 rounded-full bg-primary/30"
                />
                <div className="absolute inset-8 rounded-full bg-primary/40 flex items-center justify-center">
                  <Wifi className="w-12 h-12 text-primary" />
                </div>
              </div>

              <h2 className="text-xl font-bold mb-2">Hold Near Payment Device</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Keep your phone close to complete the payment
              </p>
              
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Waiting... {countdown}s</span>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="customer-modal-secondary flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                {onFallbackToQR && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      handleCancel();
                      onFallbackToQR();
                    }}
                    className="customer-modal-secondary flex-1"
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Use QR
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
