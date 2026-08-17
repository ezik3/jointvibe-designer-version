import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { AuthField } from '@/components/Auth/AuthField';
import { getAuthContextSearch } from '@/components/Auth/authNavigation';
import { AuthShell } from '@/components/Auth/AuthShell';
import { supabase } from '@/integrations/supabase/client';

export default function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const authContextSearch = useMemo(() => getAuthContextSearch(location.search), [location.search]);

  useEffect(() => {
    document.title = 'Reset password | JointVibe';
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setEmailError('Enter a valid email address.');
      setError('');
      setStatus('');
      return;
    }

    setLoading(true);
    setEmailError('');
    setError('');
    setStatus('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password${authContextSearch}`,
      });

      if (resetError) {
        setError(resetError.message || 'Unable to send a reset link. Please try again.');
        return;
      }

      setStatus('If an account exists for this email, a reset link is on its way.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to send a reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      contentClassName="jv-auth-content--recovery"
      topbar={
        <div className="jv-auth-topbar__group">
          <span className="jv-auth-topbar-note">Remembered your password?</span>
          <Link className="jv-auth-secondary-action" to={{ pathname: '/auth', search: authContextSearch }}>
            <span>Sign in</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      }
    >
      <div className="jv-auth-heading">
        <p className="jv-auth-section-label">ACCOUNT RECOVERY</p>
        <h1>Reset your password</h1>
        <p>Enter your email and we will send a secure link to reset your password.</p>
      </div>

      <form className="jv-auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          id="reset-email"
          label="Email address"
          icon={<Mail />}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError('');
            setError('');
            setStatus('');
          }}
          error={emailError}
          required
          disabled={loading}
        />

        <button className="jv-auth-primary-action" type="submit" disabled={loading}>
          {loading ? <span className="jv-auth-spinner" aria-hidden="true" /> : <span>Send reset link</span>}
          {!loading && <ArrowRight aria-hidden="true" />}
        </button>
        {error && <p className="jv-auth-form-status jv-auth-form-status--error" role="alert">{error}</p>}
        {status && <p className="jv-auth-form-status" role="status">{status}</p>}
      </form>

      <p className="jv-auth-reset-help">Need help accessing your account? <a href="mailto:support@jointvibe.com">Contact support</a></p>
    </AuthShell>
  );
}
