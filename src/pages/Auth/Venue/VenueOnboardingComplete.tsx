import { ArrowRight, CheckCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { consumeVenueOnboardingReturn } from "@/lib/venueOnboardingReturn";
import "./venue-onboarding-flow.css";

export default function VenueOnboardingComplete() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isReferencePresentation = searchParams.get("source") === "reference";

  return (
    <VenueOnboardingShell step={8} backTo={isReferencePresentation ? "/venue/profile-setup?source=reference" : "/venue/profile-setup"}>
      <section className="venue-onboarding-card venue-onboarding-status-card venue-onboarding-complete-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            <CheckCircle aria-hidden="true" />
          </div>
          <h1>Venue profile created</h1>
          <p>Your venue workspace is ready to configure.</p>
        </div>

        <p className="venue-onboarding-status-copy">
          You can configure staff, menus, and service settings from the workspace.
        </p>

        <button
          className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
          type="button"
          onClick={() => navigate(isReferencePresentation ? "/venue/founders/offer?source=reference" : "/venue/founders/offer")}
        >
          <span>View founders offer</span>
          <ArrowRight aria-hidden="true" />
        </button>

        <div className="venue-onboarding-actions">
          <button type="button" onClick={() => navigate(consumeVenueOnboardingReturn(user?.id))}>Open venue workspace</button>
        </div>
      </section>
    </VenueOnboardingShell>
  );
}
