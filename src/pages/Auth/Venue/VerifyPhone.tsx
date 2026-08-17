import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle, Phone } from "lucide-react";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { useFirebasePhoneAuth } from "@/hooks/useFirebasePhoneAuth";
import "./venue-verify-phone.css";

export default function VenueVerifyPhone() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReferencePresentation = searchParams.get("source") === "reference";
  const { sendOTP, verifyOTP, loading, error, codeSent, verified } = useFirebasePhoneAuth();

  const formattedPhoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

  const handleSendOTP = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendOTP(formattedPhoneNumber);
  };

  const handleVerifyOTP = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const success = await verifyOTP(code, formattedPhoneNumber);

    if (success) {
      window.setTimeout(() => navigate(isReferencePresentation ? "/venue/essentials?source=reference" : "/venue/essentials"), 1500);
    }
  };

  return (
    <VenueOnboardingShell step={3} backTo={isReferencePresentation ? "/venue/verify-email?source=reference" : "/venue/verify-email"}>
      {/* Firebase mounts its invisible reCAPTCHA verifier here. */}
      <div id="recaptcha-container" />

      <section className="venue-onboarding-card venue-verify-phone-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            {verified ? <CheckCircle aria-hidden="true" /> : <Phone aria-hidden="true" />}
          </div>
          <h1>{verified ? "Phone verified" : codeSent ? "Enter verification code" : "Verify your phone"}</h1>
          <p>
            {verified
              ? "Your phone number is confirmed. Continuing to your venue details."
              : codeSent
                ? "Enter the 6-digit code sent to your business phone."
                : "Use a number your venue team can access."}
          </p>
        </div>

        {error && <p className="venue-onboarding-error" role="alert">{error}</p>}

        {!verified && !codeSent && (
          <form className="venue-onboarding-form" onSubmit={handleSendOTP}>
            <div className="venue-onboarding-field">
              <label htmlFor="venue-phone-number">Phone number</label>
              <div className="venue-onboarding-input">
                <input
                  id="venue-phone-number"
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

            {!isReferencePresentation && (
              <div className="venue-onboarding-actions">
                <button type="button" onClick={() => navigate(isReferencePresentation ? "/venue/essentials?source=reference" : "/venue/essentials")} disabled={loading}>Skip for now</button>
              </div>
            )}
          </form>
        )}

        {!verified && codeSent && (
          <form className="venue-onboarding-form" onSubmit={handleVerifyOTP}>
            <div className="venue-onboarding-field venue-verify-phone-card__code-field">
              <label htmlFor="venue-phone-code">Verification code</label>
              <div className="venue-onboarding-input venue-verify-phone-card__code-input">
                <input
                  id="venue-phone-code"
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
              <button type="button" onClick={() => navigate(isReferencePresentation ? "/venue/essentials?source=reference" : "/venue/essentials")} disabled={loading}>Skip for now</button>
            </div>
          </form>
        )}

        {verified && (
          <div className="venue-onboarding-waiting" role="status">
            <span className="venue-onboarding-spinner" aria-hidden="true" />
            <span>Continuing to venue details...</span>
          </div>
        )}
      </section>
    </VenueOnboardingShell>
  );
}
