import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Camera, Check, ChevronRight, CreditCard, FileText, IdCard, ScanFace, Upload, X } from "lucide-react";
import { toast } from "sonner";
import CameraCapture from "@/components/Camera/CameraCapture";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import "./venue-verification.css";

type DocumentType = "drivers_license" | "passport" | "age_card";

const documentTypes = [
  { id: "drivers_license" as const, label: "Driver's license", description: "Government-issued photo ID", icon: IdCard, requiresBack: true },
  { id: "passport" as const, label: "Passport", description: "Photo page only", icon: FileText, requiresBack: false },
  { id: "age_card" as const, label: "18+ card", description: "Government-issued proof of age", icon: CreditCard, requiresBack: true },
];

export default function VenueIDVerification() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState<"front" | "back" | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const selectedDocType = documentTypes.find((document) => document.id === documentType);

  const handleFileUpload = (side: "front" | "back") => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (side === "front") {
        setFrontImage(reader.result as string);
      } else {
        setBackImage(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (imageData: string) => {
    if (showCamera === "front") {
      setFrontImage(imageData);
    } else if (showCamera === "back") {
      setBackImage(imageData);
    }
    setShowCamera(null);
  };

  const upsertVenueStep = async (step: string) => {
    try {
      if (!user) return;
      const { data: existing } = await supabase
        .from("venues")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from("venues").update({ registration_step: step }).eq("owner_user_id", user.id);
      } else {
        const venueName = localStorage.getItem("jv_venue_name") || "My Venue";
        await supabase.from("venues").insert({
          name: venueName,
          owner_user_id: user.id,
          approval_status: "approved",
          venue_setup_type: "permanent",
          registration_step: step,
        });
      }
    } catch (error) {
      console.warn("[IDVerification] upsertVenueStep failed (non-fatal):", error);
    }
  };

  const handleSubmit = async () => {
    if (!user || !documentType || !frontImage) {
      toast.error("Please complete all required fields");
      return;
    }

    if (selectedDocType?.requiresBack && !backImage) {
      toast.error("Please upload the back of your document");
      return;
    }

    setIsUploading(true);
    try {
      const { data: existing } = await supabase
        .from("user_verification")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("user_verification")
          .update({
            document_type: documentType,
            document_front_url: frontImage,
            document_back_url: backImage,
            document_status: "pending",
            overall_status: "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_verification").insert([{
          user_id: user.id,
          document_type: documentType,
          document_front_url: frontImage,
          document_back_url: backImage,
          document_status: "pending",
          overall_status: "pending",
        }]);
        if (error) throw error;
      }

      toast.success("Document uploaded successfully!");
      await upsertVenueStep("id_verification");
      navigate("/venue/facial-recognition");
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkip = async () => {
    toast.info("You can verify later from venue settings.");
    await upsertVenueStep("id_verification");
    navigate("/venue/facial-recognition");
  };

  const resetDocumentSelection = () => {
    setDocumentType(null);
    setFrontImage(null);
    setBackImage(null);
    if (frontInputRef.current) frontInputRef.current.value = "";
    if (backInputRef.current) backInputRef.current.value = "";
  };

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setShowCamera(null)}
        overlay="document"
        title={`Capture ${showCamera === "front" ? "Front" : "Back"} of ID`}
      />
    );
  }

  const selectedIcon = selectedDocType?.icon;
  const SelectedIcon = selectedIcon;

  return (
    <VenueOnboardingShell step={6} backTo="/venue/video-walkthrough" wide>
      <section className="venue-onboarding-card venue-verification-card venue-verification-card--wide">
        <div className="venue-onboarding-card__heading venue-verification-card__heading">
          <div className="venue-onboarding-card__icon">
            <ScanFace aria-hidden="true" />
          </div>
          <h1>Confirm account owner</h1>
          <p>Upload a government-issued ID to confirm the person managing this venue.</p>
        </div>

        {!documentType ? (
          <div className="venue-verification-option-list">
            {documentTypes.map((document) => {
              const Icon = document.icon;
              return (
                <button
                  className="venue-verification-option"
                  type="button"
                  key={document.id}
                  onClick={() => setDocumentType(document.id)}
                  disabled={isUploading}
                >
                  <span className="venue-verification-option__icon"><Icon aria-hidden="true" /></span>
                  <span>
                    <strong>{document.label}</strong>
                    <small>{document.description}</small>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="venue-verification-selected-document">
              <span className="venue-verification-selected-document__label">
                {SelectedIcon && <SelectedIcon aria-hidden="true" />}
                <span>{selectedDocType?.label}</span>
              </span>
              <button className="venue-verification-change-button" type="button" onClick={resetDocumentSelection} disabled={isUploading}>
                Change
              </button>
            </div>

            <div className="venue-verification-upload-list">
              <DocumentUploadRow
                label="Front of document"
                image={frontImage}
                fileInputRef={frontInputRef}
                onFileUpload={handleFileUpload("front")}
                onCamera={() => setShowCamera("front")}
                onRemove={() => setFrontImage(null)}
                disabled={isUploading}
              />
              {selectedDocType?.requiresBack && (
                <DocumentUploadRow
                  label="Back of document"
                  image={backImage}
                  fileInputRef={backInputRef}
                  onFileUpload={handleFileUpload("back")}
                  onCamera={() => setShowCamera("back")}
                  onRemove={() => setBackImage(null)}
                  disabled={isUploading}
                />
              )}
            </div>

            <button
              className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
              type="button"
              onClick={handleSubmit}
              disabled={isUploading || !frontImage || (selectedDocType?.requiresBack && !backImage)}
            >
              {isUploading ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              <span>{isUploading ? "Uploading..." : "Continue to facial verification"}</span>
            </button>
          </>
        )}

        <div className="venue-verification-skip">
          <button className="venue-verification-skip-button" type="button" onClick={handleSkip} disabled={isUploading}>
            Skip for now
          </button>
        </div>
      </section>
    </VenueOnboardingShell>
  );
}

interface DocumentUploadRowProps {
  label: string;
  image: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCamera: () => void;
  onRemove: () => void;
  disabled: boolean;
}

function DocumentUploadRow({ label, image, fileInputRef, onFileUpload, onCamera, onRemove, disabled }: DocumentUploadRowProps) {
  return (
    <article className="venue-verification-upload-row">
      <div className="venue-verification-upload-row__heading">
        <strong>{label}</strong>
        <span className={`venue-verification-upload-row__status${image ? " is-complete" : ""}`}>
          {image ? "Uploaded" : "Required"}
        </span>
      </div>

      {image ? (
        <div className="venue-verification-preview">
          <img className="venue-verification-preview__media" src={image} alt={`${label} preview`} />
          <button
            className="venue-verification-preview__remove"
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${label.toLowerCase()}`}
            title={`Remove ${label.toLowerCase()}`}
          >
            <X aria-hidden="true" />
          </button>
          <div className="venue-verification-preview__caption">
            <Check aria-hidden="true" />
            <span>Document uploaded</span>
          </div>
        </div>
      ) : (
        <div className="venue-verification-upload-row__actions">
          <button
            className="venue-onboarding-button venue-onboarding-button--secondary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Upload aria-hidden="true" />
            <span>Upload</span>
          </button>
          <button
            className="venue-onboarding-button venue-onboarding-button--secondary"
            type="button"
            onClick={onCamera}
            disabled={disabled}
          >
            <Camera aria-hidden="true" />
            <span>Camera</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileUpload} />
        </div>
      )}
    </article>
  );
}
