import { useState, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ScanFace, ShieldCheck, Loader2, ArrowLeft, Building2, User, Delete } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import CameraCapture from "@/components/Camera/CameraCapture";
import "./employee-login.css";

type FlowMode = "loading" | "set-pin" | "confirm-pin" | "login" | "denied";

const FACE_ID_LOCKOUT_KEY = 'jv_face_lockout';
const FACE_ID_LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const WORK_MODE_VENUE_ID_KEY = "work_mode_venue_id";

const getReturnPath = (search: string) => {
  const redirect = new URLSearchParams(search).get("redirect");
  if (!redirect || !redirect.startsWith("/venue/pos/") || redirect.startsWith("//") || redirect.startsWith("/venue/pos/login")) {
    return "/venue/pos/dashboard";
  }

  return redirect;
};

export default function EmployeeLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const returnPath = getReturnPath(location.search);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showFaceCamera, setShowFaceCamera] = useState(false);
  const [faceIdProcessing, setFaceIdProcessing] = useState(false);
  const [venueName, setVenueName] = useState("Venue");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [flowMode, setFlowMode] = useState<FlowMode>("loading");
  const [requireFaceId, setRequireFaceId] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceFailCount, setFaceFailCount] = useState(0);
  const [faceIdLocked, setFaceIdLocked] = useState(false);

  // Check Face ID lockout
  useEffect(() => {
    const lockoutUntil = localStorage.getItem(FACE_ID_LOCKOUT_KEY);
    if (lockoutUntil && Date.now() < parseInt(lockoutUntil)) {
      setFaceIdLocked(true);
      const timeout = setTimeout(() => {
        setFaceIdLocked(false);
        localStorage.removeItem(FACE_ID_LOCKOUT_KEY);
      }, parseInt(lockoutUntil) - Date.now());
      return () => clearTimeout(timeout);
    } else if (lockoutUntil) {
      localStorage.removeItem(FACE_ID_LOCKOUT_KEY);
    }
  }, []);

  // Read venue info from localStorage and check if PIN exists
  useEffect(() => {
    const storedName = localStorage.getItem('work_mode_venue') || localStorage.getItem('jv_current_venue_name') || "Venue";
    const storedId = localStorage.getItem('jv_current_venue_id');
    setVenueName(storedName);
    setVenueId(storedId);

    if (!user) {
      setFlowMode("login");
      return;
    }

    if (!storedId) {
      setFlowMode("denied");
      return;
    }

    const checkPinAndVenueSettings = async () => {
      try {
        const [empResult, venueResult] = await Promise.all([
          supabase
            .from("employee_venue_links")
            .select("pin_hash, role, permissions, face_enrollment_status")
            .eq("user_id", user.id)
            .eq("venue_id", storedId)
            .eq("is_active", true)
            .maybeSingle(),
          supabase
            .from("venues")
            .select("require_employee_face_id")
            .eq("id", storedId)
            .maybeSingle()
        ]);

        const empData = empResult.data;
        const venueData = venueResult.data;

        if (!empData) {
          setFlowMode("denied");
          return;
        }

        setRequireFaceId(venueData?.require_employee_face_id ?? false);
        setFaceEnrolled(empData?.face_enrollment_status === 'enrolled');

        if (empData?.pin_hash) {
          setFlowMode("login");
        } else {
          setFlowMode("set-pin");
        }
      } catch {
        setFlowMode("login");
      }
    };
    checkPinAndVenueSettings();
  }, [user]);

  const handlePinInput = (digit: string, target: "pin" | "confirm") => {
    const current = target === "pin" ? pin : confirmPin;
    if (current.length < 6) {
      const newVal = current + digit;
      if (target === "pin") {
        setPin(newVal);
        if (flowMode === "set-pin" && newVal.length === 6) {
          setTimeout(() => setFlowMode("confirm-pin"), 300);
        }
        if (flowMode === "login" && newVal.length === 6) {
          handlePinLogin(newVal);
        }
      } else {
        setConfirmPin(newVal);
        if (newVal.length === 6) {
          setTimeout(() => handleSetPin(pin, newVal), 300);
        }
      }
    }
  };

  const handleBackspace = (target: "pin" | "confirm") => {
    if (target === "pin") setPin(pin.slice(0, -1));
    else setConfirmPin(confirmPin.slice(0, -1));
  };

  const handleSetPin = async (newPin: string, confirmed: string) => {
    if (newPin !== confirmed) {
      toast.error("PINs don't match. Try again.");
      setConfirmPin("");
      setFlowMode("confirm-pin");
      return;
    }

    if (!user || !venueId) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-employee-pin", {
        body: { action: "set", pin: newPin, venue_id: venueId },
      });

      if (error || !data?.success) {
        toast.error(data?.error || "Failed to set PIN. Try again.");
        setPin("");
        setConfirmPin("");
        setFlowMode("set-pin");
      } else {
        toast.success("PIN set successfully!");
        await finalizeLogin();
      }
    } catch {
      toast.error("Something went wrong.");
      setPin("");
      setConfirmPin("");
      setFlowMode("set-pin");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinLogin = async (enteredPin: string) => {
    if (!user || !venueId) {
      toast.error("Please sign in first.");
      return;
    }

    // If Face ID is required and enrolled, block PIN-only login
    if (requireFaceId && faceEnrolled && !faceIdLocked) {
      toast.error("Face ID is required for this venue. Please use Face ID.");
      setPin("");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-employee-pin", {
        body: { action: "verify", pin: enteredPin, venue_id: venueId },
      });

      if (error) {
        toast.error("Verification failed. Try again.");
        setPin("");
        setIsLoading(false);
        return;
      }

      if (data?.valid || data?.pinNotRequired) {
        await finalizeLogin();
      } else {
        toast.error(data?.error || "Invalid PIN. Please try again.");
        setPin("");
        if (data?.locked) {
          toast.error("Too many attempts. Try again in 15 minutes.");
        }
      }
    } catch {
      toast.error("Something went wrong.");
      setPin("");
    } finally {
      setIsLoading(false);
    }
  };

  const finalizeLogin = async () => {
    if (!user || !venueId) return;

    const [empResult, profileResult] = await Promise.all([
      supabase
        .from("employee_venue_links")
        .select("role, permissions")
        .eq("user_id", user.id)
        .eq("venue_id", venueId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("customer_profiles")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (!empResult.data) {
      toast.error("POS access is not available for this account.");
      setFlowMode("denied");
      return;
    }

    const role = empResult.data.role;
    const permissions = empResult.data.permissions || {};
    const displayName = profileResult.data?.display_name || "Employee";
    const avatarUrl = profileResult.data?.avatar_url || "";

    localStorage.setItem("work_mode", "true");
    localStorage.setItem(WORK_MODE_VENUE_ID_KEY, venueId);
    localStorage.setItem("work_mode_role", role);
    localStorage.setItem("work_mode_venue", venueName);
    localStorage.setItem("work_mode_employee_name", displayName);
    localStorage.setItem("work_mode_employee_avatar", avatarUrl);
    localStorage.setItem("work_mode_permissions", JSON.stringify(permissions));
    localStorage.setItem("work_mode_start", new Date().toISOString());
    localStorage.setItem("jv_current_venue_name", venueName);

    toast.success("Welcome! You're now in Work Mode");
    navigate(returnPath, { replace: true });
  };

  // Real Face ID login using camera + AWS Rekognition
  const handleFaceCaptured = async (imageData: string) => {
    setShowFaceCamera(false);
    setFaceIdProcessing(true);

    try {
      // Strip data URL prefix for base64
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

      const { data, error } = await supabase.functions.invoke("verify-employee-face", {
        body: { face_image_base64: base64 },
      });

      if (error) throw error;

      if (data?.success) {
        setFaceFailCount(0);
        toast.success(`Face ID verified! (${data.confidence?.toFixed(0)}% match)`);
        await finalizeLogin();
      } else {
        const newCount = faceFailCount + 1;
        setFaceFailCount(newCount);

        if (newCount >= 3) {
          // Lock out Face ID for 15 minutes
          const lockoutUntil = Date.now() + FACE_ID_LOCKOUT_DURATION;
          localStorage.setItem(FACE_ID_LOCKOUT_KEY, lockoutUntil.toString());
          setFaceIdLocked(true);
          toast.error("Face ID locked for 15 minutes. Please use your PIN.");
        } else {
          toast.error(`Face not recognized (${3 - newCount} attempts remaining). Try again or use PIN.`);
        }
      }
    } catch (err: any) {
      toast.error("Face verification failed. Please use your PIN.");
      console.error('Face ID error:', err);
    } finally {
      setFaceIdProcessing(false);
    }
  };

  const handleFaceIdLogin = () => {
    if (faceIdLocked) {
      toast.error("Face ID is locked. Please use your PIN.");
      return;
    }
    if (!faceEnrolled) {
      toast.error("Face ID not enrolled. Please contact your venue manager.");
      return;
    }
    setShowFaceCamera(true);
  };

  const activePin = flowMode === "confirm-pin" ? confirmPin : pin;
  const activeTarget: "pin" | "confirm" = flowMode === "confirm-pin" ? "confirm" : "pin";

  const headerText = flowMode === "set-pin"
    ? "Set Your Work Mode PIN"
    : flowMode === "confirm-pin"
    ? "Confirm Your PIN"
    : "Work Mode Login";

  const descText = flowMode === "set-pin"
    ? "Choose a 6-digit PIN as your fallback login method"
    : flowMode === "confirm-pin"
    ? "Re-enter your PIN to confirm"
    : `Enter your PIN to clock in at`;

  if (flowMode === "loading") {
    return (
      <div className="pos-employee-login pos-employee-login--status">
        <Loader2 className="pos-employee-login__spinner animate-spin" />
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="pos-employee-login pos-employee-login--status">
        <Loader2 className="pos-employee-login__spinner animate-spin" />
      </div>
    );
  }

  if (!user) {
    const loginPath = `/venue/pos/login${location.search}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(loginPath)}`} replace />;
  }

  if (flowMode === "denied") {
    return (
      <div className="pos-employee-login pos-employee-login--status">
        <div className="pos-employee-login__processing">
          <Building2 />
          <p>POS access is not available</p>
          <span>Ask your venue manager to add you to the staff roster.</span>
          <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
        </div>
      </div>
    );
  }

  // Show camera capture for Face ID
  if (showFaceCamera) {
    return (
      <CameraCapture
        onCapture={handleFaceCaptured}
        onClose={() => setShowFaceCamera(false)}
        title="Face ID Verification"
        instruction="Position your face in the frame"
        facingMode="user"
        overlay="face"
      />
    );
  }

  // Show processing overlay
  if (faceIdProcessing) {
    return (
      <div className="pos-employee-login pos-employee-login--status">
        <div className="pos-employee-login__processing">
          <div className="pos-employee-login__processing-icon animate-pulse">
            <ScanFace />
          </div>
          <p>Verifying your identity...</p>
          <span>Comparing with enrolled face data</span>
        </div>
      </div>
    );
  }

  // Determine whether to show Face ID button
  const showFaceIdButton = flowMode === "login" && faceEnrolled && !faceIdLocked;
  const showPinPad = flowMode !== "login" || !requireFaceId || !faceEnrolled || faceIdLocked;

  return (
    <div className="pos-employee-login">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="pos-employee-login__wrap"
      >
        <Card className="pos-employee-login__panel">
          <CardHeader className="pos-employee-login__header">
            <div className="pos-employee-login__icon">
              {flowMode === "set-pin" || flowMode === "confirm-pin" ? (
                <Lock />
              ) : (
                <Building2 />
              )}
            </div>
            <CardTitle className="pos-employee-login__title">{headerText}</CardTitle>
            <CardDescription className="pos-employee-login__description">
              {descText}{flowMode === "login" && <span className="pos-employee-login__venue"> {venueName}</span>}
            </CardDescription>
          </CardHeader>

          <CardContent className="pos-employee-login__content">
            <AnimatePresence mode="wait">
              <motion.div
                key={flowMode}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="pos-employee-login__flow"
              >
                {/* Back button for confirm step */}
                {flowMode === "confirm-pin" && (
                  <Button
                    variant="ghost"
                    onClick={() => { setConfirmPin(""); setPin(""); setFlowMode("set-pin"); }}
                    className="pos-employee-login__back"
                    size="sm"
                  >
                    <ArrowLeft /> Change PIN
                  </Button>
                )}

                {/* Face ID primary button when required */}
                {flowMode === "login" && requireFaceId && faceEnrolled && !faceIdLocked && (
                  <div className="pos-employee-login__face-required">
                    <Button
                      className="pos-employee-login__face-button"
                      onClick={handleFaceIdLogin}
                    >
                      <ScanFace />
                      Verify with Face ID
                    </Button>
                    <p>Face ID is required by this venue</p>
                  </div>
                )}

                {/* PIN Pad - show unless Face ID is required and available */}
                {showPinPad && (
                  <>
                    {/* PIN Display */}
                    <div className="pos-employee-login__pin-display">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className={`pos-employee-login__pin-cell ${i < activePin.length ? "is-filled" : ""}`}
                        >
                          {i < activePin.length ? "\u2022" : ""}
                        </div>
                      ))}
                    </div>

                    {/* Number Pad */}
                    <div className="pos-employee-login__keypad">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <Button
                          key={num}
                          variant="outline"
                          className="pos-employee-login__key"
                          onClick={() => handlePinInput(num.toString(), activeTarget)}
                          disabled={isLoading}
                        >
                          {num}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        className="pos-employee-login__key pos-employee-login__key--utility"
                        onClick={() => handleBackspace(activeTarget)}
                        disabled={isLoading}
                        aria-label="Delete last digit"
                        title="Delete last digit"
                      >
                        <Delete />
                      </Button>
                      <Button
                        variant="outline"
                        className="pos-employee-login__key"
                        onClick={() => handlePinInput("0", activeTarget)}
                        disabled={isLoading}
                      >
                        0
                      </Button>
                      <Button
                        className="pos-employee-login__key pos-employee-login__key--submit"
                        onClick={() => {
                          if (flowMode === "login" && pin.length === 6) handlePinLogin(pin);
                          else if (flowMode === "set-pin" && pin.length === 6) setFlowMode("confirm-pin");
                          else if (flowMode === "confirm-pin" && confirmPin.length === 6) handleSetPin(pin, confirmPin);
                        }}
                        disabled={activePin.length < 6 || isLoading}
                        aria-label="Continue"
                        title="Continue"
                      >
                        {isLoading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                      </Button>
                    </div>
                  </>
                )}

                {/* Face ID Option - optional in login mode (when not required) */}
                {showFaceIdButton && !requireFaceId && (
                  <div className="pos-employee-login__face-option">
                    <Button
                      variant="outline"
                      className="pos-employee-login__face-button"
                      onClick={handleFaceIdLogin}
                    >
                      <ScanFace />
                      Use Face ID
                    </Button>
                  </div>
                )}

                {/* Face ID locked notice */}
                {faceIdLocked && (
                  <div className="pos-employee-login__notice">
                    Face ID locked due to failed attempts. Use PIN to log in.
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="pos-employee-login__footer">
              <Button
                variant="ghost"
                onClick={() => navigate("/auth")}
                className="pos-employee-login__normal-login"
              >
                <User /> Not an employee? Sign in normally
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="pos-employee-login__footnote">
          Work Mode provides access to POS features only. Social features are disabled during shifts.
        </p>
      </motion.div>
    </div>
  );
}
