import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowLeft, CircleCheck, Clock3, Landmark, Loader2, Lock, WalletCards } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import CameraCapture from "@/components/Camera/CameraCapture";
import "./withdraw-modal.css";

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  balance: number;
  venueId?: string;
  onSuccess?: () => void;
}

const WITHDRAWAL_FEE = 1;

type Step = "amount" | "pin_setup" | "pin" | "face" | "processing" | "success";

interface ConnectStatus {
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean | null;
  stripe_onboarding_complete: boolean | null;
}

export default function WithdrawModal({ open, onClose, balance, venueId, onSuccess }: WithdrawModalProps) {
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(Array(6).fill(""));
  const [confirmPinDigits, setConfirmPinDigits] = useState<string[]>(Array(6).fill(""));
  const [isConfirmingPin, setIsConfirmingPin] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [pinError, setPinError] = useState("");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [verifiedPin, setVerifiedPin] = useState("");
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const { toast } = useToast();
  const { formatCurrency, jvcToLocal, userCurrency } = useCurrency();

  const numAmount = parseFloat(amount) || 0;
  const netPayout = numAmount - WITHDRAWAL_FEE;
  const isValid = numAmount > WITHDRAWAL_FEE && numAmount <= balance;

  useEffect(() => {
    if (!open || !venueId) return;
    supabase
      .from("venues")
      .select("stripe_account_id, stripe_payouts_enabled, stripe_onboarding_complete")
      .eq("id", venueId)
      .single()
      .then(({ data }) => {
        if (data) setConnectStatus(data as ConnectStatus);
      });
  }, [open, venueId]);

  const resetModal = useCallback(() => {
    setStep("amount");
    setAmount("");
    setPinDigits(Array(6).fill(""));
    setConfirmPinDigits(Array(6).fill(""));
    setIsConfirmingPin(false);
    setPinError("");
    setAuthToken(null);
    setVerifiedPin("");
    setShowCamera(false);
  }, []);

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handlePinDigitChange = (index: number, value: string, isConfirm = false) => {
    if (value.length > 1) return;
    const setter = isConfirm ? setConfirmPinDigits : setPinDigits;
    const current = isConfirm ? [...confirmPinDigits] : [...pinDigits];
    current[index] = value;
    setter(current);

    if (value && index < 5) {
      document.getElementById(`${isConfirm ? "confirm-" : ""}pin-${index + 1}`)?.focus();
    }
  };

  const handlePinKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>, isConfirm = false) => {
    if (event.key !== "Backspace") return;
    const current = isConfirm ? confirmPinDigits : pinDigits;
    if (!current[index] && index > 0) {
      document.getElementById(`${isConfirm ? "confirm-" : ""}pin-${index - 1}`)?.focus();
    }
  };

  const handleProceedToVerification = async () => {
    if (!isValid || !venueId) return;
    setLoading(true);
    setPinError("");

    try {
      const { data, error } = await supabase.functions.invoke("verify-owner-withdrawal", {
        body: { venue_id: venueId, withdrawal_amount: numAmount },
      });
      if (error) throw error;

      if (data?.requires_pin_setup) {
        setStep("pin_setup");
      } else if (data?.requires_pin) {
        setStep("pin");
      } else if (data?.success) {
        setAuthToken(data.authorization_token);
        processWithdrawal(data.authorization_token);
      }
    } catch (error: any) {
      try {
        const parsed = typeof error?.message === "string" ? JSON.parse(error.message) : error;
        if (parsed?.requires_pin_setup) {
          setStep("pin_setup");
        } else if (parsed?.requires_pin) {
          setStep("pin");
        } else if (parsed?.is_first_withdrawal) {
          toast({ title: "Order Threshold", description: parsed?.error || "Complete more orders before withdrawing", variant: "destructive" });
        } else {
          toast({ title: "Error", description: parsed?.error || error?.message || "Unknown error", variant: "destructive" });
        }
      } catch {
        if (error?.message?.includes("PIN")) {
          setStep(error.message.includes("set up") ? "pin_setup" : "pin");
        } else {
          toast({ title: "Error", description: error?.message || "Verification failed", variant: "destructive" });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPin = async () => {
    const pin = pinDigits.join("");
    if (pin.length !== 6) return;

    if (!isConfirmingPin) {
      setIsConfirmingPin(true);
      setConfirmPinDigits(Array(6).fill(""));
      window.setTimeout(() => document.getElementById("confirm-pin-0")?.focus(), 100);
      return;
    }

    const confirmPin = confirmPinDigits.join("");
    if (pin !== confirmPin) {
      setPinError("PINs do not match. Try again.");
      setConfirmPinDigits(Array(6).fill(""));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-owner-withdrawal", {
        body: { action: "setup_pin", venue_id: venueId, pin },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to set PIN");

      toast({ title: "PIN Set!", description: "Your withdrawal PIN has been created." });
      setPinDigits(Array(6).fill(""));
      setIsConfirmingPin(false);
      setStep("pin");
    } catch (error: any) {
      setPinError(error?.message || "Failed to set PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPin = async () => {
    const pin = pinDigits.join("");
    if (pin.length !== 6 || !venueId) return;

    setLoading(true);
    setPinError("");
    try {
      const { data, error } = await supabase.functions.invoke("verify-owner-withdrawal", {
        body: { venue_id: venueId, pin, withdrawal_amount: numAmount },
      });
      if (error) throw new Error(error.message || "Verification failed");

      if (data?.requires_face) {
        setVerifiedPin(pin);
        setStep("face");
      } else if (data?.success) {
        setAuthToken(data.authorization_token);
        setStep("processing");
        processWithdrawal(data.authorization_token);
      } else if (data?.error) {
        setPinError(data.error);
        if (data.attempts_remaining !== undefined) setAttemptsRemaining(data.attempts_remaining);
        if (data.locked) {
          toast({ title: "Account Locked", description: data.error, variant: "destructive" });
          handleClose();
        }
        setPinDigits(Array(6).fill(""));
      }
    } catch (error: any) {
      setPinError(error?.message || "Invalid PIN");
      setPinDigits(Array(6).fill(""));
    } finally {
      setLoading(false);
    }
  };

  const handleFaceCapture = async (imageData: string) => {
    setShowCamera(false);
    setLoading(true);
    try {
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
      const { data, error } = await supabase.functions.invoke("verify-owner-withdrawal", {
        body: {
          venue_id: venueId,
          pin: verifiedPin,
          face_image_base64: base64,
          withdrawal_amount: numAmount,
        },
      });
      if (error) throw error;

      if (data?.success) {
        setAuthToken(data.authorization_token);
        setStep("processing");
        processWithdrawal(data.authorization_token);
      } else {
        toast({ title: "Face Verification Failed", description: data?.error || "Try again", variant: "destructive" });
        setStep("pin");
        setPinDigits(Array(6).fill(""));
        setVerifiedPin("");
      }
    } catch (error: any) {
      toast({ title: "Verification Failed", description: error?.message || "Unknown error", variant: "destructive" });
      setStep("pin");
    } finally {
      setLoading(false);
    }
  };

  const processWithdrawal = async (token: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-withdrawal", {
        body: {
          amount: numAmount,
          venue_id: venueId,
          authorization_token: token,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);

      setStep("success");
      toast({
        title: "Withdrawal Submitted!",
        description: `$${netPayout.toFixed(2)} USD is being processed.`,
      });
      window.setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 2500);
    } catch (error: any) {
      toast({
        title: "Withdrawal Failed",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
      setStep("amount");
    } finally {
      setLoading(false);
    }
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleFaceCapture}
        onClose={() => { setShowCamera(false); setStep("pin"); }}
        title="Face Verification"
        instruction="Look straight at the camera"
        facingMode="user"
        overlay="face"
      />
    );
  }

  if (step === "success") {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="venue-withdraw-modal venue-withdraw-modal--success">
          <div className="venue-withdraw-modal__success">
            <span className="venue-withdraw-modal__status-icon"><CircleCheck aria-hidden="true" /></span>
            <h2>Withdrawal submitted</h2>
            <p>${netPayout.toFixed(2)} USD will arrive in 1-3 business days.</p>
            <strong>${netPayout.toFixed(2)}</strong>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const renderPinPad = (digits: string[], isConfirm = false) => (
    <div className="venue-withdraw-modal__pin-pad" aria-label="Six digit withdrawal PIN">
      {digits.map((digit, index) => (
        <Input
          key={index}
          id={`${isConfirm ? "confirm-" : ""}pin-${index}`}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(event) => handlePinDigitChange(index, event.target.value.replace(/\D/g, ""), isConfirm)}
          onKeyDown={(event) => handlePinKeyDown(index, event, isConfirm)}
          className="venue-withdraw-modal__pin-input"
          autoFocus={index === 0}
        />
      ))}
    </div>
  );

  const goBack = () => {
    if (step === "pin_setup" || step === "pin") {
      setStep("amount");
      setPinDigits(Array(6).fill(""));
      setPinError("");
      setIsConfirmingPin(false);
    } else if (step === "face") {
      setStep("pin");
      setPinDigits(Array(6).fill(""));
    }
  };

  const title = step === "amount"
    ? "Withdraw funds"
    : step === "pin_setup"
      ? "Set withdrawal PIN"
      : step === "pin"
        ? "Enter withdrawal PIN"
        : step === "face"
          ? "Face verification"
          : "Processing withdrawal";
  const description = step === "amount"
    ? `Convert your balance to fiat currency. A flat $${WITHDRAWAL_FEE.toFixed(2)} fee applies.`
    : step === "pin_setup"
      ? (isConfirmingPin ? "Confirm your 6-digit PIN." : "Create a 6-digit PIN to secure withdrawals.")
      : step === "pin"
        ? "Enter your 6-digit withdrawal PIN."
        : step === "face"
          ? "Face verification is required for this amount."
          : "Your withdrawal is being processed.";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="venue-withdraw-modal">
        <DialogHeader className="venue-withdraw-modal__header">
          <DialogTitle className="venue-withdraw-modal__title">
            {step !== "amount" && (
              <Button type="button" variant="ghost" size="icon" className="venue-withdraw-modal__back" onClick={goBack} aria-label="Back to withdrawal amount">
                <ArrowLeft aria-hidden="true" />
              </Button>
            )}
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription className="venue-withdraw-modal__description">{description}</DialogDescription>
        </DialogHeader>

        {step === "amount" && (
          <div className="venue-withdraw-modal__body">
            {!connectStatus?.stripe_account_id && (
              <section className="venue-withdraw-modal__setup-state">
                <span className="venue-withdraw-modal__state-icon"><Landmark aria-hidden="true" /></span>
                <h3>Set up payout account</h3>
                <p>Connect a bank account through Stripe to receive withdrawals. This is a one-time setup.</p>
                <Button
                  onClick={async () => {
                    setConnectLoading(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("connect-onboard", {
                        body: { venue_id: venueId, account_type: "venue" },
                      });
                      if (error) throw error;
                      if (data?.onboarding_url) window.location.assign(data.onboarding_url);
                    } catch (error: any) {
                      toast({ title: "Error", description: error?.message || "Failed to start setup", variant: "destructive" });
                    } finally {
                      setConnectLoading(false);
                    }
                  }}
                  disabled={connectLoading}
                  className="venue-withdraw-modal__primary-action"
                >
                  {connectLoading && <Loader2 className="animate-spin" />}
                  Set up payout account
                </Button>
              </section>
            )}

            {connectStatus?.stripe_account_id && !connectStatus?.stripe_payouts_enabled && (
              <section className="venue-withdraw-modal__setup-state">
                <span className="venue-withdraw-modal__state-icon"><Clock3 aria-hidden="true" /></span>
                <h3>Complete payout setup</h3>
                <p>Your payout account setup is incomplete. Finish the Stripe onboarding process to receive withdrawals.</p>
                <div className="venue-withdraw-modal__actions">
                  <Button
                    onClick={async () => {
                      setConnectLoading(true);
                      try {
                        const { data } = await supabase.functions.invoke("connect-refresh", {
                          body: { action: "refresh", venue_id: venueId, account_type: "venue" },
                        });
                        if (data?.onboarding_url) window.location.assign(data.onboarding_url);
                      } catch (error: any) {
                        toast({ title: "Error", description: error?.message, variant: "destructive" });
                      } finally {
                        setConnectLoading(false);
                      }
                    }}
                    className="venue-withdraw-modal__primary-action"
                    disabled={connectLoading}
                  >
                    {connectLoading && <Loader2 className="animate-spin" />}
                    Complete setup
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="venue-withdraw-modal__secondary-action"
                    onClick={async () => {
                      const { data } = await supabase.functions.invoke("connect-refresh", {
                        body: { action: "status", venue_id: venueId, account_type: "venue" },
                      });
                      if (data) setConnectStatus((previous) => ({
                        ...previous!,
                        stripe_payouts_enabled: data.payouts_enabled,
                        stripe_onboarding_complete: data.details_submitted,
                      }));
                    }}
                    disabled={connectLoading}
                  >
                    Refresh status
                  </Button>
                </div>
              </section>
            )}

            {connectStatus?.stripe_payouts_enabled && (
              <>
                <section className="venue-withdraw-modal__balance">
                  <div><WalletCards aria-hidden="true" /><span>Available balance</span></div>
                  <strong>{balance.toFixed(2)} JVC</strong>
                  {userCurrency !== "USD" && <small>Approx. {formatCurrency(jvcToLocal(balance))}</small>}
                </section>

                <div className="venue-withdraw-modal__field">
                  <Label htmlFor="venue-withdrawal-amount">Withdrawal amount (JVC)</Label>
                  <Input
                    id="venue-withdrawal-amount"
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    max={balance}
                    step="0.01"
                    className="venue-withdraw-modal__amount-input"
                  />
                  <div className="venue-withdraw-modal__field-meta">
                    <span>Minimum: $50.00</span>
                    <button type="button" onClick={() => setAmount(balance.toString())}>Max: {balance.toFixed(2)} JVC</button>
                  </div>
                </div>

                {numAmount > 0 && (
                  <section className="venue-withdraw-modal__summary" aria-label="Withdrawal summary">
                    <div><span>Amount</span><strong>{numAmount.toFixed(2)} JVC</strong></div>
                    <div><span>Platform fee</span><strong>-${WITHDRAWAL_FEE.toFixed(2)}</strong></div>
                    <div className="venue-withdraw-modal__summary-total"><span>You will receive</span><strong>${Math.max(0, netPayout).toFixed(2)} USD</strong></div>
                  </section>
                )}

                <p className="venue-withdraw-modal__payout-note"><Landmark aria-hidden="true" /> Funds will be sent to your connected Stripe account. Crypto withdrawals are coming soon.</p>
                <p className="venue-withdraw-modal__security-note"><AlertCircle aria-hidden="true" /> Withdrawals are processed after identity verification and arrive in 1-3 business days.</p>

                <Button
                  onClick={handleProceedToVerification}
                  disabled={!isValid || loading}
                  className="venue-withdraw-modal__primary-action venue-withdraw-modal__wide-action"
                  size="lg"
                >
                  {loading ? <><Loader2 className="animate-spin" /> Checking...</> : <><Lock aria-hidden="true" /> Verify and withdraw ${Math.max(0, netPayout).toFixed(2)} USD</>}
                </Button>
              </>
            )}
          </div>
        )}

        {step === "pin_setup" && (
          <div className="venue-withdraw-modal__security-step">
            <span className="venue-withdraw-modal__state-icon"><Lock aria-hidden="true" /></span>
            <p>{isConfirmingPin ? "Re-enter your PIN to confirm." : "This PIN will be required for all future withdrawals."}</p>
            {renderPinPad(isConfirmingPin ? confirmPinDigits : pinDigits, isConfirmingPin)}
            {pinError && <p className="venue-withdraw-modal__error">{pinError}</p>}
            <Button
              onClick={handleSetupPin}
              disabled={loading || (isConfirmingPin ? confirmPinDigits : pinDigits).some((digit) => !digit)}
              className="venue-withdraw-modal__primary-action venue-withdraw-modal__wide-action"
              size="lg"
            >
              {loading ? <Loader2 className="animate-spin" /> : (isConfirmingPin ? "Confirm PIN" : "Next")}
            </Button>
          </div>
        )}

        {step === "pin" && (
          <div className="venue-withdraw-modal__security-step">
            <span className="venue-withdraw-modal__state-icon"><Lock aria-hidden="true" /></span>
            <strong>Withdrawing ${netPayout.toFixed(2)} USD</strong>
            <p>Enter your 6-digit withdrawal PIN.</p>
            {renderPinPad(pinDigits)}
            {pinError && (
              <div className="venue-withdraw-modal__error">
                <p>{pinError}</p>
                {attemptsRemaining < 5 && <small>{attemptsRemaining} attempts remaining</small>}
              </div>
            )}
            <Button
              onClick={handleVerifyPin}
              disabled={loading || pinDigits.some((digit) => !digit)}
              className="venue-withdraw-modal__primary-action venue-withdraw-modal__wide-action"
              size="lg"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Verify PIN"}
            </Button>
          </div>
        )}

        {step === "face" && (
          <div className="venue-withdraw-modal__security-step">
            <span className="venue-withdraw-modal__state-icon"><AlertCircle aria-hidden="true" /></span>
            <strong>Face verification required</strong>
            <p>This withdrawal amount requires face verification for extra security.</p>
            <Button onClick={() => setShowCamera(true)} className="venue-withdraw-modal__primary-action venue-withdraw-modal__wide-action" size="lg" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Open camera
            </Button>
          </div>
        )}

        {step === "processing" && (
          <div className="venue-withdraw-modal__processing">
            <Loader2 className="animate-spin" aria-hidden="true" />
            <strong>Processing withdrawal</strong>
            <p>Please wait.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
