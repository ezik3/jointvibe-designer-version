import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Camera, Check, FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import CameraCapture from "@/components/Camera/CameraCapture";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessDocVerification } from "@/hooks/useBusinessDocVerification";
import { supabase } from "@/integrations/supabase/client";
import {
  BUSINESS_DOCUMENT_TYPES,
  isBusinessDocumentType,
  type BusinessDocumentType,
} from "./businessDocumentTypes";
import "./venue-verification.css";

type VerificationStatus = "idle" | "uploading" | "verifying" | "complete";
type UploadTarget = "business" | "address";

interface UploadedDocument {
  dataUrl: string;
  name: string;
  contentType: string;
}

interface VerificationResult {
  status: VerificationStatus;
  result?: {
    status: "approved" | "needs_review" | "rejected";
    extracted?: {
      business_name?: string;
      address?: string;
    };
    matching?: {
      address_match_score: number;
      business_name_match_score: number;
    };
    failure_reason?: string;
  };
}

const DEFAULT_BUSINESS_DOCUMENT_TYPE: BusinessDocumentType = "business_registration";

function isImageDocument(document: UploadedDocument) {
  return document.contentType.startsWith("image/") || document.dataUrl.startsWith("data:image/");
}

function getFileExtension(document: UploadedDocument) {
  const nameExtension = document.name.split(".").pop()?.toLowerCase();
  if (nameExtension && /^[a-z0-9]{1,8}$/.test(nameExtension)) return nameExtension;

  if (document.contentType === "application/pdf") return "pdf";
  if (document.contentType.startsWith("image/")) return document.contentType.split("/")[1] || "jpg";
  return "bin";
}

function getUploadPayload(document: UploadedDocument) {
  const match = document.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("The selected file could not be prepared for upload");

  const [, dataUrlContentType, base64Data] = match;
  return {
    binaryData: Uint8Array.from(atob(base64Data), (character) => character.charCodeAt(0)),
    contentType: document.contentType || dataUrlContentType || "application/octet-stream",
  };
}

function mergeResults(
  businessResult: NonNullable<VerificationResult["result"]>,
  addressResult: NonNullable<VerificationResult["result"]>,
) {
  if (businessResult.status === "rejected") return businessResult;
  if (addressResult.status === "rejected") return addressResult;
  if (businessResult.status === "needs_review") return businessResult;
  return addressResult;
}

export default function UtilityBillUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isReferenceFlow = searchParams.get("source") === "reference";
  const requestedDocumentType = searchParams.get("documentType");
  const hasDocumentTypeSelection = isBusinessDocumentType(requestedDocumentType);
  const businessDocumentType = hasDocumentTypeSelection
    ? requestedDocumentType
    : DEFAULT_BUSINESS_DOCUMENT_TYPE;
  const selectedBusinessDocument = BUSINESS_DOCUMENT_TYPES.find((document) => document.id === businessDocumentType)!;
  const nextStepPath = isReferenceFlow
    ? "/venue/facial-recognition?source=reference"
    : "/venue/video-walkthrough";

  const [proofOfAddress, setProofOfAddress] = useState<UploadedDocument | null>(null);
  const [businessDocument, setBusinessDocument] = useState<UploadedDocument | null>(null);
  const [businessLicense, setBusinessLicense] = useState("");
  const [cameraTarget, setCameraTarget] = useState<UploadTarget | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationResult>({ status: "idle" });
  const businessInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const { verifyBusinessDocument, isVerifying } = useBusinessDocVerification();

  useEffect(() => {
    const storedVenueId = localStorage.getItem("jv_current_venue_id");
    if (storedVenueId) setVenueId(storedVenueId);

    const venueDataStr = localStorage.getItem("jv_venue_data");
    if (!venueDataStr) return;

    try {
      const venueData = JSON.parse(venueDataStr);
      if (venueData.id) setVenueId(venueData.id);
      if (venueData.businessLicense) setBusinessLicense(venueData.businessLicense);
    } catch (error) {
      console.warn("[UtilityBillUpload] Failed to read venue data:", error);
    }
  }, []);

  const handleFileChange = (target: UploadTarget) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const document = {
        dataUrl: reader.result as string,
        name: file.name || "Document",
        contentType: file.type || "application/octet-stream",
      };

      if (target === "business") {
        setBusinessDocument(document);
      } else {
        setProofOfAddress(document);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (imageData: string) => {
    const document = {
      dataUrl: imageData,
      name: "Camera capture.jpg",
      contentType: "image/jpeg",
    };

    if (cameraTarget === "business") {
      setBusinessDocument(document);
    } else {
      setProofOfAddress(document);
    }
    setCameraTarget(null);
  };

  const uploadDocument = async (document: UploadedDocument, path: string): Promise<string> => {
    const { binaryData, contentType } = getUploadPayload(document);
    const { data, error } = await supabase.storage
      .from("venue-assets")
      .upload(path, binaryData, { contentType, upsert: true });

    if (error) throw error;

    const { data: publicUrl } = supabase.storage.from("venue-assets").getPublicUrl(data.path);
    return publicUrl.publicUrl;
  };

  const updateVenueStep = async (step: string) => {
    try {
      if (!user) return;
      await supabase.from("venues").update({ registration_step: step }).eq("owner_user_id", user.id);
    } catch (error) {
      console.warn("[UtilityBillUpload] updateVenueStep failed (non-fatal):", error);
    }
  };

  const continueOnSuccess = async (result: NonNullable<VerificationResult["result"]>) => {
    setVerificationStatus({ status: "complete", result });

    if (result.status === "approved" || result.status === "needs_review") {
      toast.success(result.status === "approved" ? "Venue documents verified!" : "Documents submitted for review");
      await updateVenueStep("utility_bill");
      window.setTimeout(() => navigate(nextStepPath), 2000);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Please sign in again before uploading documents");
      return;
    }

    if (!proofOfAddress || (isReferenceFlow && !businessDocument)) {
      toast.error(isReferenceFlow ? "Upload both required venue documents" : "Please upload a utility bill");
      return;
    }

    setVerificationStatus({ status: "uploading" });

    try {
      const venueDataStr = localStorage.getItem("jv_venue_data");
      const venueData = venueDataStr ? JSON.parse(venueDataStr) : {};
      let currentVenueId = venueData.id || venueId || localStorage.getItem("jv_current_venue_id");
      if (!currentVenueId) {
        const { data: venue, error: venueError } = await supabase
          .from("venues")
          .select("id")
          .eq("owner_user_id", user.id)
          .maybeSingle();

        if (venueError || !venue?.id) {
          throw new Error("We could not find your venue. Return to venue details and save it before uploading documents.");
        }

        currentVenueId = venue.id;
        setVenueId(venue.id);
        localStorage.setItem("jv_current_venue_id", venue.id);
        localStorage.setItem("jv_venue_data", JSON.stringify({ ...venueData, id: venue.id }));
      }
      const currentVenueData = { ...venueData, id: currentVenueId };
      const uploadOwnerId = currentVenueId || user.id;
      const timestamp = Date.now();

      const proofOfAddressUrl = await uploadDocument(
        proofOfAddress,
        `venue-docs/${uploadOwnerId}/proof_of_address_${timestamp}.${getFileExtension(proofOfAddress)}`,
      );
      const businessDocumentUrl = isReferenceFlow && businessDocument
        ? await uploadDocument(
          businessDocument,
          `venue-docs/${uploadOwnerId}/${businessDocumentType}_${timestamp}.${getFileExtension(businessDocument)}`,
        )
        : null;

      const updatedVenueData = {
        ...currentVenueData,
        utilityBillUploaded: true,
        businessLicense,
        proofOfAddressUrl,
        ...(businessDocumentUrl
          ? {
            businessDocumentType,
            businessDocumentUploaded: true,
            businessDocumentUrl,
          }
          : {}),
      };
      localStorage.setItem("jv_venue_data", JSON.stringify(updatedVenueData));

      setVerificationStatus({ status: "verifying" });

      if (isReferenceFlow && businessDocumentUrl) {
        const businessResult = await verifyBusinessDocument(currentVenueId, businessDocumentUrl, businessDocumentType);
        if (!businessResult) {
          setVerificationStatus({ status: "idle" });
          return;
        }

        const addressResult = await verifyBusinessDocument(currentVenueId, proofOfAddressUrl, "utility_bill");
        if (!addressResult) {
          setVerificationStatus({ status: "idle" });
          return;
        }

        await continueOnSuccess(mergeResults(businessResult, addressResult));
        return;
      }

      const result = await verifyBusinessDocument(currentVenueId, proofOfAddressUrl, "utility_bill");
      if (!result) {
        setVerificationStatus({ status: "idle" });
        return;
      }

      await continueOnSuccess(result);
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload");
      setVerificationStatus({ status: "idle" });
    }
  };

  const handleSkip = async () => {
    toast.info("You can upload this later. Note: Verification may be delayed.");
    await updateVenueStep("utility_bill");
    navigate(nextStepPath);
  };

  const isProcessing = verificationStatus.status === "uploading" || verificationStatus.status === "verifying" || isVerifying;
  const verificationResult = verificationStatus.result;
  const resultClass = verificationResult?.status === "approved"
    ? "approved"
    : verificationResult?.status === "needs_review"
      ? "review"
      : "rejected";

  if (cameraTarget) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onClose={() => setCameraTarget(null)}
        overlay="document"
        title={`Capture ${cameraTarget === "business" ? selectedBusinessDocument.label : "proof of address"}`}
      />
    );
  }

  return (
    <VenueOnboardingShell step={isReferenceFlow ? 5 : 4} backTo={isReferenceFlow ? "/venue/verification?source=reference" : "/venue/essentials"} wide>
      <section className="venue-onboarding-card venue-verification-card venue-verification-card--wide">
        <div className="venue-onboarding-card__heading venue-verification-card__heading">
          <div className="venue-onboarding-card__icon">
            <Upload aria-hidden="true" />
          </div>
          <h1>Upload venue documents</h1>
          <p>
            {isReferenceFlow
              ? "Add clear copies of the required business documents."
              : "Add a clear proof of address so we can confirm your venue details."}
          </p>
        </div>

        {isReferenceFlow && hasDocumentTypeSelection ? (
          <div className="venue-verification-selected-document">
            <span className="venue-verification-selected-document__label">
              <FileText aria-hidden="true" />
              <span>{selectedBusinessDocument.label}</span>
            </span>
            <button className="venue-verification-change-button" type="button" onClick={() => navigate("/venue/verification?source=reference")} disabled={isProcessing}>
              Change
            </button>
          </div>
        ) : (
          <div className="venue-verification-business-license">
            <label htmlFor="business-license">Business license number <span aria-hidden="true">(optional)</span></label>
            <div className="venue-onboarding-input">
              <input
                id="business-license"
                type="text"
                placeholder="BL123456789"
                value={businessLicense}
                onChange={(event) => setBusinessLicense(event.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>
        )}

        <div className="venue-verification-upload-list">
          {isReferenceFlow && (
            <DocumentUploadRow
              label="Business document"
              document={businessDocument}
              fileInputRef={businessInputRef}
              onFileUpload={handleFileChange("business")}
              onCamera={() => setCameraTarget("business")}
              onRemove={() => setBusinessDocument(null)}
              disabled={isProcessing}
            />
          )}
          <DocumentUploadRow
            label="Proof of address"
            document={proofOfAddress}
            fileInputRef={addressInputRef}
            onFileUpload={handleFileChange("address")}
            onCamera={() => setCameraTarget("address")}
            onRemove={() => setProofOfAddress(null)}
            disabled={isProcessing}
          />
        </div>

        {!isReferenceFlow && (
          <p className="venue-verification-hint">
            Upload an electricity, water, or gas bill from the last three months. It must show the venue address and a business or owner name.
          </p>
        )}

        <button
          className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
          type="button"
          onClick={handleSubmit}
          disabled={isProcessing || !proofOfAddress || (isReferenceFlow && !businessDocument)}
        >
          {isProcessing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          <span>
            {verificationStatus.status === "uploading"
              ? "Uploading..."
              : verificationStatus.status === "verifying" || isVerifying
                ? "Verifying documents..."
                : "Verify and continue"}
          </span>
        </button>

        {verificationStatus.status === "complete" && verificationResult && (
          <div className={`venue-verification-result venue-verification-result--${resultClass}`} role="status">
            <div className="venue-verification-result__title">
              {verificationResult.status === "approved" ? <Check aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
              <span>
                {verificationResult.status === "approved"
                  ? "Documents verified"
                  : verificationResult.status === "needs_review"
                    ? "Submitted for review"
                    : "Verification failed"}
              </span>
            </div>
            {verificationResult.extracted?.business_name && <p>Business: {verificationResult.extracted.business_name}</p>}
            {verificationResult.extracted?.address && <p>Address: {verificationResult.extracted.address}</p>}
            {verificationResult.failure_reason && <p className="venue-verification-result__failure">{verificationResult.failure_reason}</p>}
          </div>
        )}

        {!isReferenceFlow && (
          <div className="venue-verification-skip">
            <button className="venue-verification-skip-button" type="button" onClick={handleSkip} disabled={isProcessing}>
              Skip for now
            </button>
          </div>
        )}
      </section>
    </VenueOnboardingShell>
  );
}

interface DocumentUploadRowProps {
  label: string;
  document: UploadedDocument | null;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onCamera: () => void;
  onRemove: () => void;
  disabled: boolean;
}

function DocumentUploadRow({ label, document, fileInputRef, onFileUpload, onCamera, onRemove, disabled }: DocumentUploadRowProps) {
  const imageDocument = document ? isImageDocument(document) : false;

  return (
    <article className="venue-verification-upload-row">
      <div className="venue-verification-upload-row__heading">
        <strong>{label}</strong>
        <span className={`venue-verification-upload-row__status${document ? " is-complete" : ""}`}>
          {document ? "Uploaded" : "Required"}
        </span>
      </div>

      {document ? (
        <div className="venue-verification-preview">
          {imageDocument ? (
            <img className="venue-verification-preview__media" src={document.dataUrl} alt={`${label} preview`} />
          ) : (
            <div className="venue-verification-preview__file">
              <FileText aria-hidden="true" />
              <span>{document.name}</span>
            </div>
          )}
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
            <span>{document.name}</span>
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
            <FileText aria-hidden="true" />
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
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={onFileUpload} hidden />
        </div>
      )}
    </article>
  );
}
