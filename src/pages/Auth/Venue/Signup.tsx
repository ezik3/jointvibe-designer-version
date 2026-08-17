import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Building2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";

export default function VenueSignup() {
  const [email, setEmail] = useState(() => localStorage.getItem("jv_signup_email") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [venueName, setVenueName] = useState(() => localStorage.getItem("jv_venue_name") || "");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReferencePresentation = searchParams.get("source") === "reference";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const passwordConfirmation = isReferencePresentation ? password : confirmPassword;

    if (password !== passwordConfirmation) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!venueName.trim()) {
      setError("Please enter your venue name");
      return;
    }

    setLoading(true);
    localStorage.setItem("jv_user_type", "venue");
    localStorage.setItem("jv_signup_email", email);
    localStorage.setItem("jv_venue_name", venueName);
    localStorage.setItem("jv_venue_data", JSON.stringify({ venueName }));

    const result = await signUp(email, password, venueName, {
      emailRedirectTo: `${window.location.origin}/venue/verify-email${isReferencePresentation ? "?source=reference" : ""}`,
    });

    if (!result.error) {
      navigate(isReferencePresentation ? "/venue/verify-email?source=reference" : "/venue/verify-email");
    } else {
      setError(result.error.message || "Signup failed");
    }

    setLoading(false);
  };

  return (
    <VenueOnboardingShell step={1} backTo="/auth?role=venue">
      <section className="venue-onboarding-card venue-onboarding-card--form">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            <Building2 aria-hidden="true" />
          </div>
          <h1>Create your venue</h1>
          <p>Set up the account your team will use to run the venue.</p>
        </div>

        {error && <p className="venue-onboarding-error" role="alert">{error}</p>}

        <form className="venue-onboarding-form" onSubmit={handleSubmit}>
          <div className="venue-onboarding-field">
            <label htmlFor="venue-name">Venue name</label>
            <div className="venue-onboarding-input">
              <input
                id="venue-name"
                type="text"
                autoComplete="organization"
                placeholder="The Electric Lounge"
                value={venueName}
                onChange={(event) => setVenueName(event.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="venue-onboarding-field">
            <label htmlFor="venue-email">Email address</label>
            <div className="venue-onboarding-input">
              <input
                id="venue-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="venue-onboarding-field">
            <label htmlFor="venue-password">Create password</label>
            <div className="venue-onboarding-input">
              <input
                id="venue-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
              <button
                className="venue-onboarding-password-toggle"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={loading}
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
          </div>

          {!isReferencePresentation && (
            <div className="venue-onboarding-field">
              <label htmlFor="venue-confirm-password">Confirm password</label>
              <div className="venue-onboarding-input">
                <input
                  id="venue-confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <button className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full" type="submit" disabled={loading}>
            {loading ? <span className="venue-onboarding-spinner" aria-hidden="true" /> : null}
            <span>{loading ? "Creating account..." : "Create venue account"}</span>
            {!loading && <ArrowRight aria-hidden="true" />}
          </button>
        </form>

        <p className="venue-onboarding-note">
          Already have an account? <Link to="/auth?role=venue">Sign in</Link>
        </p>
      </section>
    </VenueOnboardingShell>
  );
}
