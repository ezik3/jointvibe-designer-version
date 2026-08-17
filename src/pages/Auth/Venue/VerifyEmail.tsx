import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { toast } from "sonner";

export default function VenueVerifyEmail() {
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const venueEmail = localStorage.getItem("jv_signup_email") || "your email";
  // The legacy alias can select its static post-verification presentation;
  // normal verification state is still derived from the active Supabase session.
  const isReferenceVerified = searchParams.get("state") === "email-verified";
  const isReferencePresentation = searchParams.get("source") === "reference";
  const isReferenceVerifiedPresentation = isReferenceVerified && searchParams.get("source") === "reference";
  const showVerifiedCard = verified || isReferenceVerifiedPresentation;
  const signupPath = isReferencePresentation ? "/venue/signup?source=reference" : "/venue/signup";
  const verifyPhonePath = isReferencePresentation ? "/venue/verify-phone?source=reference" : "/venue/verify-phone";
  const emailVerifiedPath = "/venue/verify-email?state=email-verified&source=reference";

  useEffect(() => {
    if (verified) return;

    let active = true;
    const checkVerification = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (active && session?.user?.email_confirmed_at) {
        setVerified(true);
      }
    };

    void checkVerification();
    const interval = window.setInterval(() => void checkVerification(), 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [verified]);

  useEffect(() => {
    if (!verified || isReferenceVerifiedPresentation) return;

    const timeout = window.setTimeout(() => navigate(verifyPhonePath), 1500);
    return () => window.clearTimeout(timeout);
  }, [isReferenceVerifiedPresentation, navigate, verified, verifyPhonePath]);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timeout = window.setTimeout(() => setResendCooldown((remaining) => remaining - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;

    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: venueEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/venue/verify-email${isReferencePresentation ? "?source=reference" : ""}`,
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Verification email resent!");
    setResendCooldown(60);
  }, [isReferencePresentation, resendCooldown, venueEmail]);

  return (
    <VenueOnboardingShell step={2} backTo={signupPath}>
      <section className="venue-onboarding-card venue-onboarding-status-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            {showVerifiedCard ? <CheckCircle aria-hidden="true" /> : <Mail aria-hidden="true" />}
          </div>
          <h1>{showVerifiedCard ? "Email verified" : "Check your inbox"}</h1>
          <p>{showVerifiedCard ? "Your account email is confirmed. Continue to phone verification." : "We sent a verification link to your email address."}</p>
        </div>

        {showVerifiedCard ? (
          isReferencePresentation ? (
            <button
              className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
              type="button"
              onClick={() => navigate(verifyPhonePath)}
            >
              Continue to phone verification
            </button>
          ) : (
            <div className="venue-onboarding-waiting" role="status">
              <span className="venue-onboarding-spinner" aria-hidden="true" />
              <span>Continuing to phone verification...</span>
            </div>
          )
        ) : (
          <>
            <p className="venue-onboarding-status-copy">
              Open the link sent to <strong>{venueEmail}</strong>. The next step will unlock once your email is confirmed.
            </p>
            <button
              className={`venue-onboarding-button venue-onboarding-button--secondary${isReferencePresentation ? "" : " venue-onboarding-button--full"}`}
              type="button"
              onClick={handleResend}
              disabled={loading || resendCooldown > 0}
            >
              {loading ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
            </button>
            {isReferencePresentation ? (
              <div className="venue-onboarding-actions">
                <button className="venue-onboarding-actions__continue" type="button" onClick={() => navigate(emailVerifiedPath)}>
                  <span>I&apos;ve verified my email</span>
                  <ArrowRight aria-hidden="true" />
                </button>
                <button type="button" onClick={() => navigate(verifyPhonePath)}>Skip for now</button>
              </div>
            ) : (
              <>
                <div className="venue-onboarding-waiting" role="status">
                  <span className="venue-onboarding-spinner" aria-hidden="true" />
                  <span>Waiting for verification</span>
                </div>
                <div className="venue-onboarding-actions">
                  <button type="button" onClick={() => navigate("/venue/verify-phone")}>Skip for now</button>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </VenueOnboardingShell>
  );
}
