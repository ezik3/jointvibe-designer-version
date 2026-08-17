import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { advanceOnboardingStep } from "@/utils/onboarding";
import UserOnboardingShell from "@/components/User/UserOnboardingShell";

export default function UserVerifyEmail() {
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const userEmail = localStorage.getItem("jv_signup_email") || "your email";

  useEffect(() => {
    let cancelled = false;

    const checkInitial = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session?.user?.email_confirmed_at) {
        setAlreadyVerified(true);
        setVerified(true);
      }
    };

    void checkInitial();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (verified) return;

    const interval = window.setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email_confirmed_at) {
        setVerified(true);
        window.clearInterval(interval);
        const userType = localStorage.getItem("jv_user_type");
        if (userType !== "advertiser" && session.user.id) {
          await advanceOnboardingStep(session.user.id, "phone_pending");
        }
        window.setTimeout(() => navigate("/user/verify-phone"), 1500);
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [navigate, verified]);

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
      email: userEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/user/verify-email`,
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Verification email resent!");
    setResendCooldown(60);
  }, [resendCooldown, userEmail]);

  const handleSkip = async () => {
    const userType = localStorage.getItem("jv_user_type");
    if (userType !== "advertiser" && user) {
      await advanceOnboardingStep(user.id, "phone_pending");
    }
    navigate("/user/verify-phone");
  };

  const title = alreadyVerified ? "Email already verified" : verified ? "Email verified" : "Check your inbox";
  const description = alreadyVerified
    ? "Your email is already confirmed. Continue to phone verification."
    : verified
      ? "Your account email is confirmed. Continuing to phone verification."
      : "We sent a verification link to your email address.";

  return (
    <UserOnboardingShell step={1} backTo="/auth?mode=signup">
      <section className="venue-onboarding-card venue-onboarding-status-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            {verified ? <CheckCircle aria-hidden="true" /> : <Mail aria-hidden="true" />}
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        {verified ? (
          alreadyVerified ? (
            <button
              className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
              type="button"
              onClick={handleSkip}
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
              Open the link sent to <strong>{userEmail}</strong>. This page updates automatically once your email is confirmed.
            </p>
            <button
              className="venue-onboarding-button venue-onboarding-button--secondary venue-onboarding-button--full"
              type="button"
              onClick={handleResend}
              disabled={loading || resendCooldown > 0}
            >
              {loading ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
            </button>
            <div className="venue-onboarding-waiting" role="status">
              <span className="venue-onboarding-spinner" aria-hidden="true" />
              <span>Waiting for verification</span>
            </div>
            {import.meta.env.DEV && (
              <div className="venue-onboarding-actions">
                <button type="button" onClick={() => void handleSkip()}>Skip for now (Dev Mode)</button>
              </div>
            )}
          </>
        )}
      </section>
    </UserOnboardingShell>
  );
}
