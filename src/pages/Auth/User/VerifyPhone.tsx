import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle, LogOut, Phone } from "lucide-react";
import { useFirebasePhoneAuth } from "@/hooks/useFirebasePhoneAuth";
import { useAuth } from "@/contexts/AuthContext";
import { advanceOnboardingStep } from "@/utils/onboarding";
import UserOnboardingShell from "@/components/User/UserOnboardingShell";
import "./user-onboarding-flow.css";

export default function UserVerifyPhone() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { sendOTP, verifyOTP, loading, error, codeSent, verified } = useFirebasePhoneAuth();
  const formattedPhoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

  const handleSendOTP = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendOTP(formattedPhoneNumber);
  };

  const handleVerifyOTP = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const success = await verifyOTP(code, formattedPhoneNumber);
    if (!success) return;

    const userType = localStorage.getItem("jv_user_type");
    if (userType === "advertiser") {
      window.setTimeout(() => navigate("/advertiser/onboarding"), 1500);
    } else {
      if (user) await advanceOnboardingStep(user.id, "id_pending");
      window.setTimeout(() => navigate("/user/id-verification"), 1500);
    }
  };

  const handleSkip = async () => {
    const userType = localStorage.getItem("jv_user_type");
    if (userType === "advertiser") {
      navigate("/advertiser/onboarding");
      return;
    }

    if (user) await advanceOnboardingStep(user.id, "id_pending");
    navigate("/user/id-verification");
  };

  const title = verified ? "Phone verified" : codeSent ? "Enter verification code" : "Verify your phone";
  const description = verified
    ? "Your phone number is confirmed. Continuing to identity verification."
    : codeSent
      ? "Enter the 6-digit code sent via SMS."
      : "Use a mobile number you can access.";

  return (
    <UserOnboardingShell step={2} backTo="/user/verify-email">
      <div id="recaptcha-container" />

      <section className="venue-onboarding-card user-verify-phone-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            {verified ? <CheckCircle aria-hidden="true" /> : <Phone aria-hidden="true" />}
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        {error && <p className="venue-onboarding-error" role="alert">{error}</p>}

        {!verified && !codeSent && (
          <form className="venue-onboarding-form" onSubmit={handleSendOTP}>
            <div className="venue-onboarding-field">
              <label htmlFor="user-phone-number">Phone number</label>
              <div className="venue-onboarding-input">
                <input
                  id="user-phone-number"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+1 (212) 555-0147"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <small>Include the country code.</small>
            </div>

            <button
              className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
              type="submit"
              disabled={loading || phoneNumber.length < 8}
            >
              {loading ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : null}
              <span>{loading ? "Sending code..." : "Send verification code"}</span>
              {!loading && <ArrowRight aria-hidden="true" />}
            </button>

            {import.meta.env.DEV && (
              <div className="venue-onboarding-actions">
                <button type="button" onClick={() => void handleSkip()} disabled={loading}>Skip for now (Dev Mode)</button>
              </div>
            )}
          </form>
        )}

        {!verified && codeSent && (
          <form className="venue-onboarding-form" onSubmit={handleVerifyOTP}>
            <div className="venue-onboarding-field user-verify-phone-card__code-field">
              <label htmlFor="user-phone-code">Verification code</label>
              <div className="venue-onboarding-input user-verify-phone-card__code-input">
                <input
                  id="user-phone-code"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="000000"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={loading}
                  maxLength={6}
                  required
                />
              </div>
            </div>

            <button
              className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
              type="submit"
              disabled={loading || code.length !== 6}
            >
              {loading ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : null}
              <span>{loading ? "Verifying..." : "Verify phone"}</span>
              {!loading && <ArrowRight aria-hidden="true" />}
            </button>

            <div className="venue-onboarding-actions">
              <p>
                Did not receive the code?{" "}
                <button type="button" onClick={() => void sendOTP(formattedPhoneNumber)} disabled={loading}>Resend code</button>
              </p>
              {import.meta.env.DEV && (
                <button type="button" onClick={() => void handleSkip()} disabled={loading}>Skip for now (Dev Mode)</button>
              )}
            </div>
          </form>
        )}

        {verified && (
          <div className="venue-onboarding-waiting" role="status">
            <span className="venue-onboarding-spinner" aria-hidden="true" />
            <span>Continuing to identity verification...</span>
          </div>
        )}
      </section>

      <div className="venue-onboarding-actions">
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate("/auth");
          }}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </button>
      </div>
    </UserOnboardingShell>
  );
}
