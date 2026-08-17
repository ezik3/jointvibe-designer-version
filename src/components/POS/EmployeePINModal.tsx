import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Loader2, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import "./employee-pin-modal.css";

interface EmployeePINModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (pin: string) => Promise<boolean>;
  title?: string;
  description?: string;
}

export const EmployeePINModal = ({
  isOpen,
  onClose,
  onVerify,
  title,
  description
}: EmployeePINModalProps) => {
  const { t } = useTranslation('pos');
  const resolvedTitle = title ?? t('pin_modal.default_title');
  const resolvedDescription = description ?? t('pin_modal.default_description');
  const [pin, setPin] = useState(['', '', '', '']);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setPin(['', '', '', '']);
      setError(false);
      setSuccess(false);
      // Focus first input
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  const handleDigitChange = async (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newPin = [...pin];
    newPin[index] = value.slice(-1); // Take only last digit
    setPin(newPin);
    setError(false);

    // Move to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newPin.every(d => d !== '') && newPin.join('').length === 4) {
      setVerifying(true);
      const pinString = newPin.join('');
      
      const isValid = await onVerify(pinString);
      
      if (isValid) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 500);
      } else {
        setError(true);
        setPin(['', '', '', '']);
        inputRefs.current[0]?.focus();
      }
      
      setVerifying(false);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="pos-employee-pin-dialog">
        <DialogHeader className="pos-employee-pin-dialog__header">
          <div className="pos-employee-pin-dialog__icon">
            <Lock />
          </div>
          <DialogTitle className="pos-employee-pin-dialog__title">{resolvedTitle}</DialogTitle>
          <DialogDescription className="pos-employee-pin-dialog__description">{resolvedDescription}</DialogDescription>
        </DialogHeader>

        <div className="pos-employee-pin-dialog__body">
          {/* PIN Input */}
          <div className="pos-employee-pin-dialog__digits">
            {pin.map((digit, index) => (
              <motion.div
                key={index}
                animate={error ? { x: [-4, 4, -4, 4, 0] } : {}}
                transition={{ duration: 0.3 }}
              >
                <Input
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={verifying || success}
                  className={`pos-employee-pin-dialog__digit ${
                    error ? 'is-error' : 
                    success ? 'is-success' : ''
                  }`}
                />
              </motion.div>
            ))}
          </div>

          {/* Status Messages */}
          <AnimatePresence mode="wait">
            {verifying && (
              <motion.div
                key="verifying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pos-employee-pin-dialog__status"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('pin_modal.verifying')}</span>
              </motion.div>
            )}

            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pos-employee-pin-dialog__status is-error"
              >
                <X className="w-4 h-4" />
                <span>{t('pin_modal.invalid')}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="pos-employee-pin-dialog__status is-success"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('pin_modal.verified')}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pos-employee-pin-dialog__footer">
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
