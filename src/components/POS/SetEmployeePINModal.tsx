import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import "./employee-pin-modal.css";

interface SetEmployeePINModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetPIN: (pin: string) => Promise<boolean>;
}

export const SetEmployeePINModal = ({
  isOpen,
  onClose,
  onSetPIN
}: SetEmployeePINModalProps) => {
  const { t } = useTranslation('pos');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStep('enter');
      setPin(['', '', '', '']);
      setConfirmPin(['', '', '', '']);
      setError('');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  const handleDigitChange = (
    digits: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    index: number, 
    value: string
  ) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);
    setError('');

    // Move to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-advance when all digits entered
    if (newDigits.every(d => d !== '') && newDigits.join('').length === 4) {
      if (step === 'enter') {
        setTimeout(() => {
          setStep('confirm');
          inputRefs.current[0]?.focus();
        }, 200);
      } else {
        // Confirm step - check if PINs match
        handleConfirm(newDigits);
      }
    }
  };

  const handleConfirm = async (confirmDigits: string[]) => {
    const pinString = pin.join('');
    const confirmString = confirmDigits.join('');

    if (pinString !== confirmString) {
      setError(t('set_pin_modal.no_match'));
      setConfirmPin(['', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return;
    }

    setSaving(true);
    const success = await onSetPIN(pinString);
    setSaving(false);

    if (success) {
      onClose();
    } else {
      setError(t('set_pin_modal.set_failed'));
    }
  };

  const handleKeyDown = (
    digits: string[],
    index: number, 
    e: React.KeyboardEvent
  ) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const currentDigits = step === 'enter' ? pin : confirmPin;
  const setCurrentDigits = step === 'enter' ? setPin : setConfirmPin;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="pos-set-employee-pin-dialog">
        <DialogHeader className="pos-set-employee-pin-dialog__header">
          <div className="pos-set-employee-pin-dialog__icon">
            <Lock />
          </div>
          <DialogTitle className="pos-set-employee-pin-dialog__title">
            {step === 'enter' ? t('set_pin_modal.create_title') : t('set_pin_modal.confirm_title')}
          </DialogTitle>
          <DialogDescription className="pos-set-employee-pin-dialog__description">
            {step === 'enter'
              ? t('set_pin_modal.create_desc')
              : t('set_pin_modal.confirm_desc')
            }
          </DialogDescription>
        </DialogHeader>

        <div className="pos-set-employee-pin-dialog__body">
          {/* Step Indicator */}
          <div className="pos-set-employee-pin-dialog__steps">
            <div className={`pos-set-employee-pin-dialog__step ${step === 'enter' ? 'is-active' : ''}`} />
            <div className={`pos-set-employee-pin-dialog__step ${step === 'confirm' ? 'is-active' : ''}`} />
          </div>

          {/* PIN Input */}
          <div className="pos-set-employee-pin-dialog__digits">
            {currentDigits.map((digit, index) => (
              <motion.div
                key={`${step}-${index}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Input
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(currentDigits, setCurrentDigits, index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(currentDigits, index, e)}
                  disabled={saving}
                  className="pos-set-employee-pin-dialog__digit"
                />
              </motion.div>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="pos-set-employee-pin-dialog__status is-error"
            >
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Saving State */}
          {saving && (
            <div className="pos-set-employee-pin-dialog__status">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('set_pin_modal.saving')}</span>
            </div>
          )}
        </div>

        <div className="pos-set-employee-pin-dialog__footer">
          {step === 'confirm' && (
            <Button 
              variant="outline" 
              onClick={() => {
                setStep('enter');
                setPin(['', '', '', '']);
                setConfirmPin(['', '', '', '']);
                setError('');
                setTimeout(() => inputRefs.current[0]?.focus(), 100);
              }}
              className="flex-1"
            >
              {t('common.back')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
