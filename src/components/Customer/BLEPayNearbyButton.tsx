import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useProximityPayment } from '@/hooks/useProximityPayment';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCheckIn } from '@/hooks/useUserCheckIn';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bluetooth, 
  BluetoothOff, 
  Smartphone, 
  QrCode, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Wifi,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { BLETerminal } from '@/hooks/useBLEPayment';
import { useTranslation } from 'react-i18next';

interface BLEPayNearbyButtonProps {
  onFallbackToQR?: () => void;
  className?: string;
}

type PaymentStatus = 'idle' | 'scanning' | 'selecting' | 'confirming' | 'processing' | 'success' | 'error';

export function BLEPayNearbyButton({ onFallbackToQR, className }: BLEPayNearbyButtonProps) {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { jvcToLocal, userCurrency } = useCurrency();
  const { currentCheckIn } = useUserCheckIn();
  const proximity = useProximityPayment();
  
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [selectedTerminal, setSelectedTerminal] = useState<BLETerminal | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [scanTimeout, setScanTimeout] = useState<NodeJS.Timeout | null>(null);

  // Guard against duplicate scanning starts (React.StrictMode)
  const startedScanRef = useRef(false);

  const platformFee = 0.10;

  const formatAmount = (amt: number) => {
    const localAmount = jvcToLocal(amt);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: userCurrency,
      minimumFractionDigits: 2,
    }).format(localAmount);
  };

  // Check if BLE/NFC is available - always show button, check-in is validated on click
  const isProximityAvailable = proximity.paymentState.isAvailable;
  const preferredMethod = proximity.paymentState.preferredMethod;
  const hasCheckIn = !!currentCheckIn?.venueId;

  // Start scanning when modal opens
  const startScanning = useCallback(async () => {
    if (!currentCheckIn?.venueId) {
      toast.error('Please check in to a venue first');
      setIsOpen(false);
      return;
    }

    setStatus('scanning');
    setErrorMessage('');
    
    const success = await proximity.startPaying(
      currentCheckIn.venueId,
      (terminal) => {
        console.log('Terminal found:', terminal);
      }
    );
    
    if (!success) {
      setStatus('error');
      setErrorMessage('Could not start scanning. Please try QR code.');
    }

    // Auto-timeout after 5 seconds if no terminal found
    const timeout = setTimeout(() => {
      if (proximity.nearbyTerminals.length === 0) {
        setStatus('error');
        setErrorMessage('No payment terminals found nearby');
      }
    }, 5000);
    
    setScanTimeout(timeout);
  }, [currentCheckIn, proximity]);

  // Handle terminal selection
  const handleSelectTerminal = (terminal: BLETerminal) => {
    setSelectedTerminal(terminal);
    setStatus('confirming');
    proximity.stopPaying();
    
    if (scanTimeout) {
      clearTimeout(scanTimeout);
      setScanTimeout(null);
    }
  };

  // Auto-select closest terminal
  useEffect(() => {
    if (status === 'scanning' && proximity.nearbyTerminals.length > 0) {
      // If only one terminal, auto-select after 2 seconds
      if (proximity.nearbyTerminals.length === 1) {
        const autoSelect = setTimeout(() => {
          handleSelectTerminal(proximity.nearbyTerminals[0]);
        }, 2000);
        return () => clearTimeout(autoSelect);
      } else {
        // Multiple terminals - show selection
        setStatus('selecting');
      }
    }
  }, [status, proximity.nearbyTerminals]);

  // Handle payment confirmation
  const handleConfirmPayment = async () => {
    if (!selectedTerminal) return;
    
    setStatus('processing');
    
    const result = await proximity.completePayment(selectedTerminal);
    
    if (result.success) {
      setStatus('success');
      toast.success('Payment successful!');
      
      // Close after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        setStatus('idle');
        setSelectedTerminal(null);
      }, 2000);
    } else {
      setStatus('error');
      setErrorMessage(result.error || 'Payment failed');
    }
  };

  // Handle modal open
  const handleOpen = () => {
    if (!user) {
      toast.error('Please sign in to pay');
      return;
    }
    
    // Check if BLE/proximity is available
    if (!isProximityAvailable) {
      toast.info('Bluetooth payments require the native app. Use Scan QR Code instead.', {
        duration: 4000,
      });
      return;
    }
    
    if (!currentCheckIn) {
      toast.error('Please check in to a venue to use Tap to Pay', {
        description: 'You can check in from the venue page',
        duration: 4000,
      });
      return;
    }
    
    setIsOpen(true);
  };

  // Handle modal close
  const handleClose = () => {
    proximity.stopPaying();
    if (scanTimeout) {
      clearTimeout(scanTimeout);
    }
    setIsOpen(false);
    setStatus('idle');
    setSelectedTerminal(null);
  };

  // Handle QR fallback
  const handleQRFallback = () => {
    handleClose();
    onFallbackToQR?.();
  };

  // Handle retry
  const handleRetry = () => {
    setStatus('idle');
    setErrorMessage('');
    startScanning();
  };

  // Start scanning when modal opens
  useEffect(() => {
    if (!isOpen) {
      startedScanRef.current = false;
      return;
    }
    if (status !== 'idle') return;
    if (startedScanRef.current) return;
    startedScanRef.current = true;
    startScanning();
  }, [isOpen, status, startScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      proximity.stopPaying();
      if (scanTimeout) {
        clearTimeout(scanTimeout);
      }
    };
  }, []);

  // Always show Tap to Pay button - even if BLE is not fully available in browser
  // The button will explain requirements on click
  const showBLEButton = true; // Always show, handle requirements on click

  return (
    <>
      <Button
        onClick={handleOpen}
        className={`customer-modal-primary ${className}`}
      >
        <Bluetooth className="w-5 h-5 mr-2" />
        Tap to Pay
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent className="customer-dialog-surface max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[var(--customer-modal-text)] flex items-center gap-2">
              <Bluetooth className="w-5 h-5 text-[var(--customer-modal-cyan)]" />
              Pay Nearby
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <AnimatePresence mode="wait">
              {/* Scanning State */}
              {status === 'scanning' && (
                <motion.div
                  key="scanning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-8"
                >
                  {/* Scanning Animation */}
                  <div className="relative mb-6">
                    <motion.div
                      className="absolute inset-0 rounded-full bg-cyan-500/20"
                      animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full bg-cyan-500/20"
                      animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                    />
                    <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center relative z-10">
                      <Wifi className="w-10 h-10 text-cyan-400" />
                    </div>
                  </div>

                  <p className="text-white font-medium mb-2">Looking for terminals...</p>
                  <p className="text-zinc-400 text-sm text-center">
                    Hold your phone near the staff device
                  </p>
                </motion.div>
              )}

              {/* Selecting State - Multiple Terminals */}
              {status === 'selecting' && (
                <motion.div
                  key="selecting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-4"
                >
                  <p className="text-white font-medium mb-4 text-center">
                    {proximity.nearbyTerminals.length} terminals found
                  </p>
                  <p className="text-zinc-400 text-sm text-center mb-4">
                    Select the one you're paying at:
                  </p>

                  <div className="space-y-2">
                    {proximity.nearbyTerminals.slice(0, 3).map((terminal) => (
                      <motion.button
                        key={terminal.deviceId}
                        onClick={() => handleSelectTerminal(terminal)}
                        className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex items-center justify-between transition-colors"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <Smartphone className="w-5 h-5 text-cyan-400" />
                          </div>
                          <div className="text-left">
                            <p className="text-white font-medium">{terminal.terminalName}</p>
                            <p className="text-zinc-400 text-sm">
                              {formatAmount(terminal.amount)}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-500" />
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Confirming State */}
              {status === 'confirming' && selectedTerminal && (
                <motion.div
                  key="confirming"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-4"
                >
                  <div className="text-center mb-6">
                    <p className="text-zinc-400 text-sm">Pay to</p>
                    <p className="text-xl font-semibold text-white">{selectedTerminal.terminalName}</p>
                  </div>

                  <div className="bg-zinc-800 rounded-xl p-6 mb-6">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-zinc-400">Amount</span>
                      <span className="text-white font-medium">
                        {formatAmount(selectedTerminal.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-zinc-400">Platform Fee</span>
                      <span className="text-zinc-400">{formatAmount(platformFee)}</span>
                    </div>
                    <div className="border-t border-zinc-700 pt-3 flex justify-between items-center">
                      <span className="text-white font-medium">Total</span>
                      <span className="text-xl font-bold text-cyan-400">
                        {formatAmount(selectedTerminal.amount + platformFee)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-zinc-600"
                      onClick={() => {
                        setSelectedTerminal(null);
                        setStatus('idle');
                        startScanning();
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      className="customer-modal-primary flex-1"
                      onClick={handleConfirmPayment}
                    >
                      Confirm Payment
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Processing State */}
              {status === 'processing' && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-8"
                >
                  <Loader2 className="w-16 h-16 text-cyan-400 animate-spin mb-4" />
                  <p className="text-white font-medium">Processing payment...</p>
                </motion.div>
              )}

              {/* Success State */}
              {status === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 10 }}
                  >
                    <CheckCircle className="w-20 h-20 text-emerald-400" />
                  </motion.div>
                  <p className="text-xl font-semibold text-white mt-4">Payment Successful!</p>
                  {selectedTerminal && (
                    <p className="text-zinc-400 mt-2">
                      {formatAmount(selectedTerminal.amount + platformFee)} paid
                    </p>
                  )}
                </motion.div>
              )}

              {/* Error State */}
              {status === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center py-8"
                >
                  <XCircle className="w-16 h-16 text-red-400 mb-4" />
                  <p className="text-white font-medium mb-2">Payment Failed</p>
                  <p className="text-zinc-400 text-sm text-center mb-6">{errorMessage}</p>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={handleRetry}
                      className="border-zinc-600"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleQRFallback}
                      className="border-zinc-600"
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Use QR Code
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          {(status === 'scanning' || status === 'selecting') && (
            <div className="border-t border-zinc-700 pt-4">
              <Button
                variant="ghost"
                className="w-full text-zinc-400 hover:text-white"
                onClick={handleQRFallback}
              >
                <QrCode className="w-4 h-4 mr-2" />
                Use QR Code Instead
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
