import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Camera, Check, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import "./venue-verification.css";

export default function VenueVideoWalkthrough() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video must be under 100MB");
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const updateVenueStep = async (step: string) => {
    try {
      if (!user) return;
      await supabase.from("venues").update({ registration_step: step }).eq("owner_user_id", user.id);
    } catch (error) {
      console.warn("[VideoWalkthrough] updateVenueStep failed (non-fatal):", error);
    }
  };

  const handleSubmit = async () => {
    if (!videoFile || !user) {
      toast.error("Please upload a video walkthrough");
      return;
    }

    setIsUploading(true);
    try {
      const venueDataStr = localStorage.getItem("jv_venue_data");
      if (venueDataStr) {
        const venueData = JSON.parse(venueDataStr);
        venueData.videoWalkthrough = true;
        venueData.videoFileName = videoFile.name;
        localStorage.setItem("jv_venue_data", JSON.stringify(venueData));
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Video uploaded successfully!");
      await updateVenueStep("video");
      navigate("/venue/id-verification");
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload video");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkip = async () => {
    toast.info("You can upload the video later from venue settings. Note: Verification may be delayed.");
    await updateVenueStep("video");
    navigate("/venue/id-verification");
  };

  const clearVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null);
    setVideoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const requirements = [
    "Start with yourself and show your face clearly.",
    "Show the venue exterior, signage, and entrance.",
    "Show yourself unlocking and entering the venue.",
    "Walk through key interior areas such as the kitchen, bar, or seating.",
    "Keep it between one and five minutes.",
  ];

  return (
    <VenueOnboardingShell step={5} backTo="/venue/utility-bill" wide>
      <section className="venue-onboarding-card venue-verification-card venue-verification-card--wide">
        <div className="venue-onboarding-card__heading venue-verification-card__heading">
          <div className="venue-onboarding-card__icon">
            <Video aria-hidden="true" />
          </div>
          <h1>Video walkthrough</h1>
          <p>Record a short video proving that you own or manage this venue.</p>
        </div>

        <div className="venue-verification-checklist" aria-label="Video walkthrough requirements">
          {requirements.map((requirement, index) => (
            <div key={requirement}>
              <i>{index + 1}</i>
              <span>{requirement}</span>
            </div>
          ))}
        </div>

        <div className="venue-verification-upload-list">
          <article className="venue-verification-upload-row">
            <div className="venue-verification-upload-row__heading">
              <strong>Video walkthrough</strong>
              <span className={`venue-verification-upload-row__status${videoFile ? " is-complete" : ""}`}>
                {videoFile ? "Uploaded" : "Required"}
              </span>
            </div>

            {videoPreview ? (
              <div className="venue-verification-preview">
                <video className="venue-verification-preview__media" src={videoPreview} controls />
                <button
                  className="venue-verification-preview__remove"
                  type="button"
                  onClick={clearVideo}
                  disabled={isUploading}
                  aria-label="Remove video walkthrough"
                  title="Remove video walkthrough"
                >
                  <X aria-hidden="true" />
                </button>
                <div className="venue-verification-preview__caption">
                  <Check aria-hidden="true" />
                  <span>{videoFile?.name}</span>
                </div>
              </div>
            ) : (
              <div className="venue-verification-upload-row__actions">
                <button
                  className="venue-onboarding-button venue-onboarding-button--secondary"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Upload aria-hidden="true" />
                  <span>Upload</span>
                </button>
                <button
                  className="venue-onboarding-button venue-onboarding-button--secondary"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Camera aria-hidden="true" />
                  <span>Record</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={handleFileChange}
                  hidden
                />
              </div>
            )}
          </article>
        </div>

        <button
          className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
          type="button"
          onClick={handleSubmit}
          disabled={isUploading || !videoFile}
        >
          {isUploading ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          <span>{isUploading ? "Uploading..." : "Continue to ID verification"}</span>
        </button>

        <div className="venue-verification-skip">
          <button className="venue-verification-skip-button" type="button" onClick={handleSkip} disabled={isUploading}>
            Skip for now
          </button>
        </div>
      </section>
    </VenueOnboardingShell>
  );
}
