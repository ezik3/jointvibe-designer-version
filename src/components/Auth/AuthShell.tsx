import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import jvLogo from '@/assets/jv-logo.png';
import './auth.css';

interface AuthShellProps {
  children: ReactNode;
  topbar: ReactNode;
  contentClassName?: string;
}

interface AuthBrandProps {
  className: string;
}

function AuthBrand({ className }: AuthBrandProps) {
  return (
    <Link className={className} to="/auth" aria-label="JointVibe home">
      <img className="jv-auth-brand__mark" src={jvLogo} alt="" />
      <span>JointVibe</span>
    </Link>
  );
}

export function AuthShell({ children, topbar, contentClassName }: AuthShellProps) {
  return (
    <main className="jv-auth-shell">
      <section className="jv-auth-brand-panel" aria-label="JointVibe experience preview">
        <div className="jv-auth-brand-panel__image" role="img" aria-label="Friends enjoying live music at a venue" />
        <div className="jv-auth-brand-panel__scrim" />

        <AuthBrand className="jv-auth-brand" />

        <div className="jv-auth-brand-panel__content">
          <span className="jv-auth-eyebrow"><span className="jv-auth-live-dot" /> Live nightlife, one place</span>
          <h1>Find your night.<br />Join the vibe.</h1>
          <p>Discover the places, people, events, and experiences that make tonight worth going out for.</p>
        </div>

        <div className="jv-auth-venue-preview" aria-label="Featured venue preview">
          <div className="jv-auth-venue-preview__image" />
          <div className="jv-auth-venue-preview__copy">
            <span className="jv-auth-venue-preview__label">Happening now</span>
            <strong>Skyline Sessions</strong>
            <span>Central District - 1.2 km away</span>
          </div>
          <span className="jv-auth-icon-button" aria-hidden="true"><ArrowUpRight /></span>
        </div>
      </section>

      <section className="jv-auth-panel">
        <div className="jv-auth-topbar">{topbar}</div>
        <div className={`jv-auth-content${contentClassName ? ` ${contentClassName}` : ''}`}>
          <AuthBrand className="jv-auth-mobile-brand" />
          {children}
        </div>
      </section>
    </main>
  );
}
