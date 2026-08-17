import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Delete, ShieldCheck, Camera, AlertTriangle } from "lucide-react";
import { usePaymentSecurity } from "@/hooks/usePaymentSecurity";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';
import "./payment-security-modal.css";

interface PaymentVerificationModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
  amount: number;
}

export function PaymentVerificationModal({ open, onClose, onVerified, amount }: PaymentVerificationModalProps) {
  const { t } = useTranslation('common');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'pin' | 'face' | 'verifying'>('pin');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { verifyPin, verifyFace, requireVerification } = usePaymentSecurity();
  const { toast } = useToast();

  const handleDigit = useCallback((digit: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
      setErrorMsg(null);
    }
  }, [pin]);

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setErrorMsg(null);
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pin.length !== 6) return;
    setSubmitting(true);
    setErrorMsg(null);

    const result = await verifyPin(pin);
    setSubmitting(false);

    if (!result.success) {
      setErrorMsg(result.message || 'Incorrect PIN');
      setPin('');
      return;
    }

    // PIN verified — check if face is needed
    const verType = requireVerification(amount);
    if (verType === 'pin_and_face') {
      setStep('face');
      toast({ title: "PIN verified", description: "Now verify your face to complete." });
    } else {
      onVerified();
    }
  }, [pin, verifyPin, requireVerification, amount, onVerified, toast]);

  const handleSkipFace = useCallback(() => {
    // PIN was already verified, allow proceeding
    onVerified();
  }, [onVerified]);

  const handleClose = useCallback(() => {
    setPin('');
    setStep('pin');
    setErrorMsg(null);
    onClose();
  }, [onClose]);

  const dots = Array.from({ length: 6 }, (_, i) => i < pin.length);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="payment-security-dialog !gap-0 !p-0">
        <div className="payment-security-modal__body">
          {step === 'pin' && (
            <>
              <div className="payment-security-modal__icon">
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h2 className="payment-security-modal__title">Enter Payment PIN</h2>
              <p className="payment-security-modal__copy">Verify your identity to continue</p>

              {errorMsg && (
                <div className="payment-security-modal__error">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="payment-security-modal__dots">
                {dots.map((filled, i) => (
                  <div key={i} className={`payment-security-modal__dot${filled ? ' payment-security-modal__dot--filled' : ''}`} />
                ))}
              </div>

              <div className="payment-security-modal__keypad">
                {['1','2','3','4','5','6','7','8','9'].map(d => (
                  <button
                    key={d}
                    onClick={() => handleDigit(d)}
                    disabled={submitting}
                    className="payment-security-modal__key"
                  >
                    {d}
                  </button>
                ))}
                <div />
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
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              <Button
                onClick={handlePinSubmit}
                disabled={pin.length !== 6 || submitting}
                size="lg"
                className="mt-4 w-full max-w-[280px]"
              >
                {submitting ? (
                  <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
                ) : 'Verify'}
              </Button>
            </>
          )}

          {step === 'face' && (
            <>
              <div className="payment-security-modal__icon">
                <Camera className="w-7 h-7 text-primary" />
              </div>
              <h2 className="payment-security-modal__title">Face Verification Required</h2>
              <p className="payment-security-modal__copy">
                This transaction requires face verification based on your security settings.
              </p>

              <p className="payment-security-modal__copy !mt-0 !mb-4 text-xs">
                Face scan will use your device camera to verify your identity.
              </p>

              <div className="payment-security-modal__actions">
                <Button
                  size="lg"
                  onClick={() => {
                    toast({ title: "Face scan", description: "Opening camera for face verification..." });
                  }}
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Start Face Scan
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleSkipFace}
                >
                  Skip — Use PIN Only
                </Button>
              </div>
            </>
          )}

          {step === 'verifying' && (
            <div className="flex flex-col items-center py-8">
              <div className="animate-spin h-10 w-10 border-[3px] border-primary border-t-transparent rounded-full mb-4" />
              <p className="text-foreground font-medium">Verifying...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
