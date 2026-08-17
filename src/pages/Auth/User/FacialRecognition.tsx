import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Camera, CheckCircle2, Loader2, ScanFace, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { advanceOnboardingStep } from "@/utils/onboarding";
import { useAuth } from "@/contexts/AuthContext";
import CameraCapture from "@/components/Camera/CameraCapture";
import UserOnboardingShell from "@/components/User/UserOnboardingShell";
import { useFaceMatchVerification } from "@/hooks/useFaceMatchVerification";
import "./user-onboarding-flow.css";

type VerificationStep = "instructions" | "capture" | "uploading" | "processing" | "success" | "failed";

interface VerificationData {
  document_type?: string;
  document_front_url?: string;
  document_back_url?: string;
  extracted_name?: string;
  extracted_dob?: string;
}

const FacialRecognition = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const { user } = useAuth();
  const [step, setStep] = useState<VerificationStep>("instructions");
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [verificationData, setVerificationData] = useState<VerificationData>({});
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const { verifyFaceMatch, result, lastError } = useFaceMatchVerification();

  useEffect(() => {
    const loadVerificationData = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("user_verification")
        .select("document_type, document_front_url, document_back_url, extracted_name, extracted_dob")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[FacialRecognition] Error loading verification data:", error);
        return;
      }

      if (data) setVerificationData(data);
    };

    void loadVerificationData();
  }, [user]);

  const uploadSelfie = async (imageData: string): Promise<string> => {
    if (!user) throw new Error("Not authenticated");

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (character) => character.charCodeAt(0));
    const timestamp = Date.now();
    const path = `selfies/${user.id}/selfie_${timestamp}.jpg`;
    const { data, error } = await supabase.storage
      .from("venue-assets")
      .upload(path, binaryData, { contentType: "image/jpeg", upsert: true });

    if (error) throw error;

    const { data: publicUrl } = supabase.storage
      .from("venue-assets")
      .getPublicUrl(data.path);

    return publicUrl.publicUrl;
  };

  const handleCameraCapture = async (imageData: string) => {
    setSelfieImage(imageData);
    setShowCamera(false);
    setErrorDetails(null);

    if (!user) {
      setStep("failed");
      setErrorDetails("Not authenticated");
      return;
    }

    if (!verificationData.document_front_url) {
      setStep("failed");
      setErrorDetails("No ID document found. Please complete ID verification first.");
      return;
    }

    try {
      setStep("uploading");
      const selfieUrl = await uploadSelfie(imageData);

      await supabase
        .from("user_verification")
        .update({
          selfie_url: selfieUrl,
          face_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      setStep("processing");
      const faceResult = await verifyFaceMatch(
        user.id,
        verificationData.document_front_url,
        selfieUrl,
        (verificationData.document_type as "drivers_license" | "passport" | "age_card") || "drivers_license",
        verificationData.extracted_name,
        verificationData.extracted_dob,
        verificationData.document_back_url,
      );

      if (faceResult?.verified) {
        setStep("success");
      } else {
        setStep("failed");
        setErrorDetails(faceResult?.message || lastError?.error_body || "Verification failed");
      }
    } catch (error: unknown) {
      console.error("[FacialRecognition] Error:", error);
      setStep("failed");
      setErrorDetails(error instanceof Error ? error.message : "An unexpected error occurred");
    }
  };

  const handleRetry = () => {
    setSelfieImage(null);
    setErrorDetails(null);
    setStep("instructions");
  };

  const handleContinue = async () => {
    if (user) await advanceOnboardingStep(user.id, "profile_setup");
    navigate(returnTo || "/user/profile-setup");
  };

  const handleSkip = async () => {
    toast.info("You can complete verification later from your profile settings.");
    if (user) await advanceOnboardingStep(user.id, "profile_setup");
    navigate(returnTo || "/user/profile-setup");
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(false)}
        overlay="face"
        title="Position your face in the oval"
        facingMode="user"
      />
    );
  }

  const heading = step === "success"
    ? "Identity verified"
    : step === "failed"
      ? "Verification failed"
      : "Facial verification";
  const description = step === "success"
    ? "Your identity is verified and your account is ready for profile setup."
    : step === "failed"
      ? "We could not verify this image. Try again with clear, even lighting."
      : "We will match your face to the ID document you uploaded.";

  return (
    <UserOnboardingShell step={4} backTo="/user/id-verification">
      <section className="venue-onboarding-card user-onboarding-flow-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            {step === "success" ? <CheckCircle2 aria-hidden="true" /> : step === "failed" ? <AlertCircle aria-hidden="true" /> : <ScanFace aria-hidden="true" />}
          </div>
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>

        {step === "instructions" && (
          <>
            {!verificationData.document_front_url ? (
              <div className="user-face-status">
                <AlertCircle aria-hidden="true" />
                <p>Your ID document is not ready. Complete ID verification before starting the face check.</p>
                <button className="venue-onboarding-button venue-onboarding-button--secondary venue-onboarding-button--full" type="button" onClick={() => navigate("/user/id-verification")}>
                  Go to ID verification
                </button>
              </div>
            ) : (
              <>
                <div className="user-onboarding-check-list">
                  <div><span>1</span><span>Use a well-lit area.</span></div>
                  <div><span>2</span><span>Remove glasses, hats, or anything covering your face.</span></div>
                  <div><span>3</span><span>Position your face within the oval guide.</span></div>
                  <div><span>4</span><span>Keep a neutral expression and look at the camera.</span></div>
                </div>
                <div className="user-onboarding-flow-actions">
                  <button className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full" type="button" onClick={() => setShowCamera(true)}>
                    <Camera aria-hidden="true" />
                    <span>Start verification</span>
                  </button>
                </div>
              </>
            )}
            <div className="user-onboarding-flow-actions">
              <button className="user-onboarding-text-button" type="button" onClick={() => void handleSkip()}>Skip for now</button>
            </div>
          </>
        )}

        {step === "uploading" && (
          <div className="user-face-status" role="status">
            <Loader2 className="venue-onboarding-spinner" aria-hidden="true" />
            <p>Uploading your selfie securely...</p>
            {selfieImage && <div className="user-face-status__preview"><img src={selfieImage} alt="Your selfie" /></div>}
          </div>
        )}

        {step === "processing" && (
          <div className="user-face-status" role="status">
            <span className="venue-onboarding-spinner" aria-hidden="true" />
            <p>Matching your face to the ID document. This can take 10 to 30 seconds.</p>
            {selfieImage && <div className="user-face-status__preview"><img src={selfieImage} alt="Your selfie" /></div>}
          </div>
        )}

        {step === "success" && (
          <div className="user-face-status">
            {result && (
              <div className="user-verification-result-card__details">
                <span>Face match: {(result.face_match_confidence * 100).toFixed(1)}%</span>
                <span>Liveness score: {(result.liveness_score * 100).toFixed(1)}%</span>
                <div className="user-verification-result-card__age-pills">
                  {result.is_18_plus && <span>18+</span>}
                  {result.is_21_plus && <span>21+</span>}
                </div>
              </div>
            )}
            {selfieImage && <div className="user-face-status__preview"><img src={selfieImage} alt="Verified selfie" /></div>}
            <button className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full" type="button" onClick={() => void handleContinue()}>
              <span>Continue to profile setup</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}

        {step === "failed" && (
          <div className="user-face-status">
            <X aria-hidden="true" />
            <p>{errorDetails || lastError?.error_body || "Unknown error"}</p>
            {lastError && (
              <div className="user-verification-result-card__details">
                <span>Function: {lastError.function_name}</span>
                <span>Status: {lastError.http_status}</span>
                <span>Time: {lastError.timestamp}</span>
              </div>
            )}
            <div className="user-onboarding-flow-actions">
              <button className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full" type="button" onClick={handleRetry}>
                <Camera aria-hidden="true" />
                <span>Try again</span>
              </button>
              <button className="venue-onboarding-button venue-onboarding-button--secondary venue-onboarding-button--full" type="button" onClick={() => void handleSkip()}>
                Skip for now
              </button>
            </div>
          </div>
        )}
      </section>
    </UserOnboardingShell>
  );
};

export default FacialRecognition;
