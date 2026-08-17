import { ChevronRight, ShieldCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { BUSINESS_DOCUMENT_TYPES } from "./businessDocumentTypes";
import "./venue-verification.css";

export default function BusinessDocumentChooser() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReferenceFlow = searchParams.get("source") === "reference";
  const essentialsPath = isReferenceFlow ? "/venue/essentials?source=reference" : "/venue/essentials";

  return (
    <VenueOnboardingShell step={5} backTo={essentialsPath}>
      <section className="venue-onboarding-card venue-verification-card">
        <div className="venue-onboarding-card__heading venue-verification-card__heading">
          <div className="venue-onboarding-card__icon">
            <ShieldCheck aria-hidden="true" />
          </div>
          <h1>Verify your venue</h1>
          <p>Choose a business document to confirm your venue details.</p>
        </div>

        <div className="venue-verification-option-list">
          {BUSINESS_DOCUMENT_TYPES.map((document) => {
            const Icon = document.icon;

            return (
              <button
                className="venue-verification-option"
                key={document.id}
                type="button"
                onClick={() => navigate(
                  isReferenceFlow
                    ? `/venue/utility-bill?source=reference&documentType=${document.id}`
                    : `/venue/utility-bill?documentType=${document.id}`,
                )}
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
      </section>
    </VenueOnboardingShell>
  );
}
