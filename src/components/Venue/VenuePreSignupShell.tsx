import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import jvLogo from "@/assets/jv-logo.png";
import "./venue-pre-signup-shell.css";

interface VenuePreSignupShellProps {
  children: ReactNode;
}

const VenuePreSignupShell = ({ children }: VenuePreSignupShellProps) => (
  <div className="venue-pre-signup-shell">
    <header className="venue-pre-signup-shell__header">
      <div className="venue-pre-signup-shell__header-inner">
        <Link className="venue-pre-signup-shell__brand" to="/auth" aria-label="Return to JointVibe sign in">
          <img src={jvLogo} alt="" />
          <span>
            <strong>JointVibe</strong>
            <small>Savings calculator</small>
          </span>
        </Link>
        <Link className="venue-pre-signup-shell__sign-in" to="/auth?role=venue">
          Venue sign in
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </header>

    <main className="venue-pre-signup-shell__content">{children}</main>

    <footer className="venue-pre-signup-shell__footer">
      <div className="venue-pre-signup-shell__footer-inner">
        <span>Copyright {new Date().getFullYear()} JointVibe. All rights reserved.</span>
        <nav aria-label="Legal links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </nav>
      </div>
    </footer>
  </div>
);

export default VenuePreSignupShell;
