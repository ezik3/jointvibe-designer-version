import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import jvLogo from "@/assets/jv-logo.png";
import "./venue-onboarding-shell.css";

interface VenueOnboardingShellProps {
  children: ReactNode;
  step: number;
  backTo: string;
  wide?: boolean;
}

const TOTAL_STEPS = 8;

const VenueOnboardingShell = ({ children, step, backTo, wide = false }: VenueOnboardingShellProps) => {
  const currentStep = Math.max(1, Math.min(step, TOTAL_STEPS));

  return (
    <main className="venue-onboarding-shell">
      <header className="venue-onboarding-shell__header">
        <Link className="venue-onboarding-shell__back" to={backTo} aria-label="Go back" title="Go back">
          <ArrowLeft aria-hidden="true" />
        </Link>
        <Link className="venue-onboarding-shell__brand" to="/auth" aria-label="JointVibe home">
          <img src={jvLogo} alt="" />
          <span>JointVibe</span>
        </Link>
        <span aria-hidden="true" />
      </header>

      <section className={`venue-onboarding-shell__stage${wide ? " venue-onboarding-shell__stage--wide" : ""}`}>
        <div className="venue-onboarding-progress" aria-label={`Step ${currentStep} of ${TOTAL_STEPS}`}>
          <div className="venue-onboarding-progress__dots" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={currentStep}>
            {Array.from({ length: TOTAL_STEPS }, (_, index) => {
              const stepNumber = index + 1;
              const state = stepNumber < currentStep ? "is-complete" : stepNumber === currentStep ? "is-current" : "";

              return <span key={stepNumber} className={state} />;
            })}
          </div>
          <small>Step {currentStep} of {TOTAL_STEPS}</small>
        </div>

        {children}
      </section>
    </main>
  );
};

export default VenueOnboardingShell;
