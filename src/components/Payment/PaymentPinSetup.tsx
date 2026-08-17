import { useState, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete, Check, ShieldCheck } from "lucide-react";
import { usePaymentSecurity } from "@/hooks/usePaymentSecurity";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';
import "./payment-security-modal.css";

interface PaymentPinSetupProps {
  open: boolean;
  onComplete: () => void;
}

export function PaymentPinSetup({ open, onComplete }: PaymentPinSetupProps) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { setupPin } = usePaymentSecurity();
  const { toast } = useToast();

  // Use refs to avoid stale closures in callbacks
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const confirmPinRef = useRef(confirmPin);
  confirmPinRef.current = confirmPin;
  const stepRef = useRef(step);
  stepRef.current = step;

  const isEnterStep = step === 'enter';
  const currentPin = isEnterStep ? pin : confirmPin;

  const handleDigit = useCallback((digit: string) => {
    const current = stepRef.current === 'enter' ? pinRef.current : confirmPinRef.current;
    if (current.length >= 6) return;
    if (stepRef.current === 'enter') {
      setPin(prev => prev + digit);
    } else {
      setConfirmPin(prev => prev + digit);
    }
  }, []);

  const handleBackspace = useCallback(() => {
    if (stepRef.current === 'enter') {
      setPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  }, []);

  const handleConfirm = async () => {
    if (step === 'enter') {
      if (pin.length !== 6) return;
      setStep('confirm');
      setConfirmPin('');
      return;
    }

    if (confirmPin !== pin) {
      toast({ title: "PINs don't match", description: "Please try again.", variant: "destructive" });
      setConfirmPin('');
      setStep('enter');
      setPin('');
      return;
    }

    setSubmitting(true);
    const result = await setupPin(pin);
    setSubmitting(false);

    if (result.success) {
      toast({ title: "PIN Set!", description: "Your payment PIN has been set up successfully." });
      onComplete();
    } else {
      toast({ title: "Error", description: result.message || "Failed to set PIN.", variant: "destructive" });
      setPin('');
      setConfirmPin('');
      setStep('enter');
    }
  };

  const dots = Array.from({ length: 6 }, (_, i) => i < currentPin.length);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="payment-security-dialog !gap-0 !p-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="payment-security-modal__body">
          <div className="payment-security-modal__icon">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h2 className="payment-security-modal__title">
            {isEnterStep ? 'Set Your Payment PIN' : 'Confirm Your PIN'}
          </h2>
          <p className="payment-security-modal__copy">
            {isEnterStep
              ? 'Create a 6-digit PIN to protect your wallet transactions'
              : 'Enter the same PIN again to confirm'}
          </p>

          {/* PIN Dots */}
          <div className="payment-security-modal__dots">
            {dots.map((filled, i) => (
              <div
                key={i}
                className={`payment-security-modal__dot${filled ? ' payment-security-modal__dot--filled' : ''}`}
              />
            ))}
          </div>

          <div className="payment-security-modal__keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                onClick={() => handleDigit(d)}
                disabled={submitting}
                className="payment-security-modal__key"
              >
                {d}
              </button>
            ))}
            <div /> {/* spacer */}
            <button
              onClick={() => handleDigit('0')}
              disabled={submitting}
              className="payment-security-modal__key"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              disabled={submitting}
              className="payment-security-modal__key"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={currentPin.length !== 6 || submitting}
            className="mt-4 w-full max-w-[280px] disabled:opacity-30"
          >
            {submitting ? (
              <div className="animate-spin h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full" />
            ) : (
              <>
                <Check className="w-5 h-5 mr-2" />
                {isEnterStep ? 'Continue' : 'Set PIN'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
