import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Crown, EyeOff } from "lucide-react";
import VenueOnboardingShell from "@/components/Venue/VenueOnboardingShell";
import { useAuth } from "@/contexts/AuthContext";
import { formatFoundersPrice, getRemainingCount, useCityProduct } from "@/hooks/useFoundersPass";
import { consumeVenueOnboardingReturn } from "@/lib/venueOnboardingReturn";
import "./venue-founders-offer.css";

const OFFER_BENEFITS = [
  "Lifetime Platinum status",
  "12 months of activation rewards",
  "Exclusive Founder badge",
];

const REFERENCE_OFFER = {
  remaining: 5,
  price: "$3,000",
};

export default function VenueFoundersOffer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [citySlug, setCitySlug] = useState<string | null>(null);
  const isReferenceView = searchParams.get("source") === "reference";
  const { data: product, isLoading } = useCityProduct(citySlug ?? "", "venue");
  const remaining = product ? getRemainingCount(product) : 0;
  const hasAvailableOffer = Boolean(citySlug && product && remaining > 0);

  const returnToWorkspace = useCallback(() => {
    navigate(consumeVenueOnboardingReturn(user?.id), { replace: true });
  }, [navigate, user?.id]);

  useEffect(() => {
    const slug = localStorage.getItem("jv_venue_city_slug");
    const dismissed = localStorage.getItem("jv_founders_shown_venue");

    if (!slug || dismissed === "dismissed") {
      if (!isReferenceView) returnToWorkspace();
      return;
    }

    setCitySlug(slug);
  }, [isReferenceView, returnToWorkspace]);

  useEffect(() => {
    if (citySlug && !isLoading && (!product || remaining <= 0) && !isReferenceView) {
      returnToWorkspace();
    }
  }, [citySlug, isLoading, isReferenceView, product, remaining, returnToWorkspace]);

  const handleDismiss = () => {
    localStorage.setItem("jv_founders_shown_venue", "dismissed");
    returnToWorkspace();
  };

  if (!isReferenceView && (!citySlug || (!isLoading && !hasAvailableOffer))) {
    return null;
  }

  if (citySlug && isLoading) {
    return (
      <VenueOnboardingShell step={8} backTo="/venue/home" wide>
        <section className="venue-onboarding-card venue-founders-offer-card venue-founders-offer-card--loading" aria-busy="true">
          <span className="venue-onboarding-spinner" aria-hidden="true" />
          <span>Loading founders offer...</span>
        </section>
      </VenueOnboardingShell>
    );
  }

  const displayRemaining = hasAvailableOffer ? remaining : REFERENCE_OFFER.remaining;
  const displayPrice = product && hasAvailableOffer ? formatFoundersPrice(product.price_cents) : REFERENCE_OFFER.price;

  return (
    <VenueOnboardingShell step={8} backTo="/venue/home" wide>
      <section className="venue-onboarding-card venue-founders-offer-card">
        <div className="venue-onboarding-card__heading">
          <div className="venue-onboarding-card__icon">
            <Crown aria-hidden="true" />
          </div>
          <h1>City founders offer</h1>
          <p>Launch your venue with a limited founders membership.</p>
        </div>

        <p className="venue-founders-offer-card__body">
          City founders membership is available for a limited number of early venue partners.
        </p>

        <div className="venue-founders-offer-details">
          <div>
            <span>Available</span>
            <strong>{displayRemaining.toLocaleString()}</strong>
          </div>
          <div>
            <span>One-time membership</span>
            <strong>{displayPrice}</strong>
          </div>
        </div>

        <ul className="venue-founders-offer-benefits">
          {OFFER_BENEFITS.map((benefit) => (
            <li key={benefit}>
              <Crown aria-hidden="true" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <button
          className="venue-onboarding-button venue-onboarding-button--primary venue-onboarding-button--full"
          type="button"
          onClick={() => {
            if (hasAvailableOffer && citySlug) {
              navigate(`/venue/founders/checkout/${citySlug}`);
              return;
            }
            returnToWorkspace();
          }}
        >
          <span>Continue to workspace</span>
          <ArrowRight aria-hidden="true" />
        </button>

        {!isReferenceView && (
          <div className="venue-founders-offer-actions">
            <button type="button" onClick={returnToWorkspace}>
              Skip for now
            </button>
            <button type="button" onClick={handleDismiss}>
              <EyeOff aria-hidden="true" />
              <span>Don't show this again</span>
            </button>
          </div>
        )}
      </section>
    </VenueOnboardingShell>
  );
}
