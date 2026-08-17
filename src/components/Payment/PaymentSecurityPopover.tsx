import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Delete, KeyRound, Loader2, ScanFace, Settings2, ShieldCheck, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import "./payment-security-popover.css";

interface PaymentSecurityPopoverProps {
  status: {
    pin_set: boolean;
    face_enabled: boolean;
    face_threshold: "every" | "over_50" | "over_100" | "never";
    has_enrolled_selfie: boolean;
    trusted_device_count: number;
  } | null;
  onRefresh: () => Promise<any>;
}

type View = "main" | "change_pin" | "face_verify" | "confirm_pin";
type FaceThreshold = "every" | "over_50" | "over_100";
type SecurityAction =
  | { type: "disable_face" }
  | { type: "update_threshold"; threshold: FaceThreshold }
  | { type: "enroll_face"; selfieBase64: string };

const thresholdOptions: { value: FaceThreshold; label: string }[] = [
  { value: "every", label: "Every transaction" },
  { value: "over_50", label: "Over $50" },
  { value: "over_100", label: "Over $100" },
];

function PinDots({ length }: { length: number }) {
  return (
    <div className="payment-security-panel__pin-dots" aria-label={`${length} of 6 PIN digits entered`}>
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className={index < length ? "is-filled" : undefined} />
      ))}
    </div>
  );
}

interface PinKeypadProps {
  valueLength: number;
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}

function PinKeypad({ valueLength, disabled = false, onDigit, onBackspace }: PinKeypadProps) {
  return (
    <div className="payment-security-panel__keypad" aria-label="PIN keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
        <button
          key={digit}
          type="button"
          disabled={disabled || valueLength >= 6}
          onClick={() => onDigit(digit)}
        >
          {digit}
        </button>
      ))}
      <span aria-hidden="true" />
      <button
        type="button"
        disabled={disabled || valueLength >= 6}
        onClick={() => onDigit("0")}
      >
        0
      </button>
      <button type="button" disabled={disabled || valueLength === 0} onClick={onBackspace} aria-label="Delete last PIN digit">
        <Delete aria-hidden="true" />
      </button>
    </div>
  );
}

export function PaymentSecurityPopover({ status, onRefresh }: PaymentSecurityPopoverProps) {
  const { toast } = useToast();
  const [view, setView] = useState<View>("main");
  const [loading, setLoading] = useState(false);
  const [faceVerifying, setFaceVerifying] = useState(false);
  const [faceCameraReady, setFaceCameraReady] = useState(false);
  const [pendingAction, setPendingAction] = useState<SecurityAction | null>(null);
  const [confirmationPin, setConfirmationPin] = useState("");
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(() => localStorage.getItem("jv_daily_limit") || "2000");

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [changePinStep, setChangePinStep] = useState<"current" | "new" | "confirm">("current");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const resetChangePin = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmNewPin("");
    setChangePinStep("current");
    setView("main");
  };

  const resetPinConfirmation = () => {
    setPendingAction(null);
    setConfirmationPin("");
    setConfirmationError(null);
    setView("main");
  };

  const requestPinConfirmation = (action: SecurityAction) => {
    setPendingAction(action);
    setConfirmationPin("");
    setConfirmationError(null);
    setView("confirm_pin");
  };

  const handleChangePin = async () => {
    if (newPin !== confirmNewPin) {
      toast({ title: "PINs don't match", description: "Please re-enter your new PIN.", variant: "destructive" });
      setNewPin("");
      setConfirmNewPin("");
      setChangePinStep("new");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-payment-pin", {
        body: { action: "change", pin: currentPin, new_pin: newPin },
      });
      if (error) throw error;
      if (data.error) {
        toast({ title: "Error", description: data.message, variant: "destructive" });
        if (data.error === "incorrect_pin") {
          setCurrentPin("");
          setChangePinStep("current");
        }
        return;
      }
      toast({ title: "PIN Changed", description: "Your payment PIN has been updated." });
      resetChangePin();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFace = (enabled: boolean) => {
    if (enabled) {
      setView("face_verify");
      return;
    }
    requestPinConfirmation({ type: "disable_face" });
  };

  const handleThresholdChange = (value: string) => {
    const threshold = thresholdOptions.find((option) => option.value === value)?.value;
    if (!threshold) return;
    requestPinConfirmation({ type: "update_threshold", threshold });
  };

  useEffect(() => {
    if (view !== "face_verify") return;

    let cancelled = false;
    const startFaceVerify = async () => {
      setFaceCameraReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 480, height: 480 },
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setFaceCameraReady(true);
      } catch {
        if (!cancelled) {
          toast({ title: "Camera Error", description: "Could not access camera.", variant: "destructive" });
          setView("main");
        }
      }
    };

    void startFaceVerify();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [toast, view]);

  const captureFaceAndEnable = () => {
    const video = videoRef.current;
    if (!video || !faceCameraReady) return;

    setFaceVerifying(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the face image.");
      context.drawImage(video, 0, 0, 480, 480);
      const selfieBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
      if (!selfieBase64) throw new Error("Could not capture the face image.");

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setFaceCameraReady(false);
      requestPinConfirmation({ type: "enroll_face", selfieBase64 });
    } catch (error: any) {
      toast({ title: "Face capture failed", description: error.message, variant: "destructive" });
    } finally {
      setFaceVerifying(false);
    }
  };

  const confirmSecurityAction = async () => {
    if (!pendingAction || confirmationPin.length !== 6) return;

    setLoading(true);
    setConfirmationError(null);
    try {
      if (pendingAction.type === "disable_face") {
        const { data, error } = await supabase.functions.invoke("update-payment-security", {
          body: { action: "disable_face", pin: confirmationPin },
        });
        if (error) throw error;
        if (data.error) {
          setConfirmationError(data.message || "The PIN could not be verified.");
          setConfirmationPin("");
          return;
        }
        toast({ title: "Face ID Disabled", description: "PIN will be used for all payments." });
      }

      if (pendingAction.type === "update_threshold") {
        const { data, error } = await supabase.functions.invoke("update-payment-security", {
          body: { action: "update_threshold", face_threshold: pendingAction.threshold, pin: confirmationPin },
        });
        if (error) throw error;
        if (data.error) {
          setConfirmationError(data.message || "The PIN could not be verified.");
          setConfirmationPin("");
          return;
        }
        toast({ title: "Threshold Updated" });
      }

      if (pendingAction.type === "enroll_face") {
        const { data: enrollmentData, error: enrollmentError } = await supabase.functions.invoke("update-payment-security", {
          body: { action: "enroll_face", selfie_base64: pendingAction.selfieBase64, pin: confirmationPin },
        });
        if (enrollmentError) throw enrollmentError;
        if (enrollmentData.error) {
          setConfirmationError(enrollmentData.message || "The PIN could not be verified.");
          setConfirmationPin("");
          return;
        }

        const { data: enableData, error: enableError } = await supabase.functions.invoke("update-payment-security", {
          body: { action: "enable_face", face_threshold: "over_50", pin: confirmationPin },
        });
        if (enableError) throw enableError;
        if (enableData.error) {
          setConfirmationError(enableData.message || "Face ID could not be enabled.");
          setConfirmationPin("");
          return;
        }
        toast({ title: "Face ID Enabled", description: "Your face has been verified and enrolled for payments." });
      }

      await onRefresh();
      resetPinConfirmation();
    } catch (error: any) {
      const message = error.message || "Unable to update your payment security settings.";
      setConfirmationError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cancelFaceVerify = () => {
    setFaceCameraReady(false);
    setView("main");
  };

  if (!status) {
    return <div className="payment-security-panel payment-security-panel--loading">Loading security settings...</div>;
  }

  if (view === "change_pin") {
    const activePin = changePinStep === "current" ? currentPin : changePinStep === "new" ? newPin : confirmNewPin;
    const setActivePin = changePinStep === "current" ? setCurrentPin : changePinStep === "new" ? setNewPin : setConfirmNewPin;
    const stepLabel = changePinStep === "current" ? "Enter current PIN" : changePinStep === "new" ? "Enter new PIN" : "Confirm new PIN";

    return (
      <section className="payment-security-panel" aria-label="Change payment PIN">
        <div className="payment-security-panel__header">
          <div>
            <span className="payment-security-panel__eyebrow">Payment security</span>
            <h4>{stepLabel}</h4>
          </div>
          <button type="button" className="payment-security-panel__close" onClick={resetChangePin} aria-label="Close PIN change">
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="payment-security-panel__description">Use a six-digit PIN that only you know.</p>
        <PinDots length={activePin.length} />
        <PinKeypad
          valueLength={activePin.length}
          disabled={loading}
          onDigit={(digit) => setActivePin((previous) => (previous.length < 6 ? previous + digit : previous))}
          onBackspace={() => setActivePin((previous) => previous.slice(0, -1))}
        />
        <Button
          size="sm"
          className="payment-security-panel__primary-action"
          disabled={activePin.length !== 6 || loading}
          onClick={() => {
            if (changePinStep === "current") setChangePinStep("new");
            else if (changePinStep === "new") setChangePinStep("confirm");
            else void handleChangePin();
          }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : changePinStep === "confirm" ? "Change PIN" : "Continue"}
        </Button>
      </section>
    );
  }

  if (view === "face_verify") {
    return (
      <section className="payment-security-panel" aria-label="Face ID enrollment">
        <div className="payment-security-panel__header">
          <div>
            <span className="payment-security-panel__eyebrow">Payment security</span>
            <h4>Verify your face</h4>
          </div>
          <button type="button" className="payment-security-panel__close" onClick={cancelFaceVerify} aria-label="Cancel Face ID enrollment">
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="payment-security-panel__description">Look at the camera to confirm your identity before enabling Face ID.</p>
        <div className="payment-security-panel__camera">
          <video ref={videoRef} autoPlay playsInline muted />
          {!faceCameraReady && <span>Starting camera...</span>}
        </div>
        <Button
          size="sm"
          className="payment-security-panel__primary-action"
          disabled={faceVerifying || !faceCameraReady}
          onClick={captureFaceAndEnable}
        >
          {faceVerifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Capturing...</> : <><ScanFace className="mr-2 h-4 w-4" /> Capture and continue</>}
        </Button>
      </section>
    );
  }

  if (view === "confirm_pin") {
    const confirmationCopy = pendingAction?.type === "disable_face"
      ? { title: "Disable Face ID", description: "Enter your payment PIN to confirm this change.", action: "Disable Face ID" }
      : pendingAction?.type === "update_threshold"
        ? { title: "Update Face ID rule", description: "Enter your payment PIN to save this requirement.", action: "Save rule" }
        : { title: "Enable Face ID", description: "Enter your payment PIN to enroll this face for payments.", action: "Enable Face ID" };

    return (
      <section className="payment-security-panel" aria-label="Confirm payment security change">
        <div className="payment-security-panel__header">
          <div>
            <span className="payment-security-panel__eyebrow">Payment security</span>
            <h4>{confirmationCopy.title}</h4>
          </div>
          <button type="button" className="payment-security-panel__close" onClick={resetPinConfirmation} aria-label="Cancel security change">
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="payment-security-panel__description">{confirmationCopy.description}</p>
        <form
          className="payment-security-panel__confirmation-form"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmSecurityAction();
          }}
        >
          <label htmlFor="payment-security-confirmation-pin">Payment PIN</label>
          <input
            id="payment-security-confirmation-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            value={confirmationPin}
            onChange={(event) => {
              setConfirmationPin(event.target.value.replace(/\D/g, "").slice(0, 6));
              setConfirmationError(null);
            }}
            aria-describedby={confirmationError ? "payment-security-confirmation-error" : undefined}
          />
          <PinDots length={confirmationPin.length} />
          {confirmationError && <p id="payment-security-confirmation-error" className="payment-security-panel__error">{confirmationError}</p>}
          <div className="payment-security-panel__actions">
            <Button type="button" size="sm" variant="outline" className="payment-security-panel__secondary-action" onClick={resetPinConfirmation} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="payment-security-panel__primary-action" disabled={confirmationPin.length !== 6 || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1.5 h-4 w-4" /> {confirmationCopy.action}</>}
            </Button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="payment-security-panel" aria-label="Payment security settings">
      <div className="payment-security-panel__heading">
        <ShieldCheck aria-hidden="true" />
        <h4>Payment security</h4>
      </div>

      <div className="payment-security-panel__section payment-security-panel__section--pin">
        <div className="payment-security-panel__row">
          <span><KeyRound aria-hidden="true" /> Payment PIN</span>
          {status.pin_set && <b>Active</b>}
        </div>
        {status.pin_set && (
          <button type="button" className="payment-security-panel__navigation" onClick={() => setView("change_pin")}>
            Change PIN <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="payment-security-panel__section payment-security-panel__section--face">
        <div className="payment-security-panel__row">
          <span><ScanFace aria-hidden="true" /> Face ID</span>
          <Switch
            className="payment-security-panel__switch"
            checked={status.face_enabled}
            onCheckedChange={handleToggleFace}
            disabled={loading || !status.pin_set}
            aria-label="Use Face ID for payments"
          />
        </div>
        {!status.pin_set && <p className="payment-security-panel__hint">Set up your PIN first to enable Face ID.</p>}
      </div>

      {status.face_enabled && (
        <div className="payment-security-panel__section">
          <span className="payment-security-panel__section-label">Require Face ID</span>
          <RadioGroup value={status.face_threshold} onValueChange={handleThresholdChange} className="payment-security-panel__radio-list">
            {thresholdOptions.map((option) => (
              <div key={option.value} className="payment-security-panel__radio-row">
                <RadioGroupItem value={option.value} id={`payment-security-threshold-${option.value}`} disabled={loading} />
                <Label htmlFor={`payment-security-threshold-${option.value}`}>{option.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}

      <div className="payment-security-panel__section">
        <div className="payment-security-panel__limit-heading">
          <Settings2 aria-hidden="true" />
          <span>Daily spending limit</span>
        </div>
        <p className="payment-security-panel__hint">Maximum equivalent of $10,000 USD per day.</p>
        <RadioGroup
          value={dailyLimit}
          onValueChange={(value) => {
            setDailyLimit(value);
            localStorage.setItem("jv_daily_limit", value);
            toast({ title: "Daily Limit Updated", description: `Limit set to $${Number(value).toLocaleString()} USD equivalent.` });
          }}
          className="payment-security-panel__radio-list"
        >
          {[
            { value: "2000", label: "$2,000 USD equiv." },
            { value: "5000", label: "$5,000 USD equiv." },
            { value: "10000", label: "$10,000 USD equiv." },
          ].map((option) => (
            <div key={option.value} className="payment-security-panel__radio-row">
              <RadioGroupItem value={option.value} id={`payment-security-limit-${option.value}`} />
              <Label htmlFor={`payment-security-limit-${option.value}`}>{option.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </section>
  );
}
