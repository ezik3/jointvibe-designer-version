import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import jvLogo from '@/assets/jv-logo.png';
import './legal-shell.css';

interface LegalShellProps {
  title: string;
  updatedAt: string;
  children: ReactNode;
}

export function LegalShell({ title, updatedAt, children }: LegalShellProps) {
  const location = useLocation();
  const authDestination = { pathname: '/auth', search: location.search };

  return (
    <main className="jv-legal-shell">
      <header className="jv-legal-header">
        <Link className="jv-legal-brand" to={authDestination} aria-label="JointVibe home">
          <img className="jv-legal-brand__mark" src={jvLogo} alt="" />
          <span>JointVibe</span>
        </Link>
        <Link className="jv-legal-back" to={authDestination}>Back to sign in</Link>
      </header>

      <article className="jv-legal-content">
        <p className="jv-legal-label">JointVibe Legal</p>
        <h1>{title}</h1>
        <p className="jv-legal-updated">Last updated: {updatedAt}</p>
        {children}
      </article>
    </main>
  );
}
