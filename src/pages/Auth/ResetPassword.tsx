import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { AuthField } from '@/components/Auth/AuthField';
import { getAuthContextSearch } from '@/components/Auth/authNavigation';
import { AuthShell } from '@/components/Auth/AuthShell';
import { supabase } from '@/integrations/supabase/client';

type ResetFieldErrors = Partial<Record<'password' | 'confirmPassword', string>>;

export default function ResetPassword() {
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ResetFieldErrors>({});
  const [complete, setComplete] = useState(false);
  const authContextSearch = useMemo(() => getAuthContextSearch(location.search), [location.search]);

  useEffect(() => {
    document.title = 'Reset password | JointVibe';
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const nextFieldErrors: ResetFieldErrors = {};

    if (!password) {
      nextFieldErrors.password = 'Enter a new password.';
    } else if (password.length < 6) {
      nextFieldErrors.password = 'Password must contain at least 6 characters.';
    }

    if (!confirmPassword) {
      nextFieldErrors.confirmPassword = 'Confirm your new password.';
    } else if (password && password !== confirmPassword) {
      nextFieldErrors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Unable to update your password. Request a new reset link and try again.');
        return;
      }

      setComplete(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update your password.');
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordToggle = (field: 'new' | 'confirmation') => (
    <button
      className="jv-auth-password-toggle"
      type="button"
      aria-label={`${showPassword ? 'Hide' : 'Show'} ${field} password`}
      aria-pressed={showPassword}
      onClick={(event) => {
        setShowPassword((visible) => !visible);
        event.currentTarget.closest('.jv-auth-input')?.querySelector('input')?.focus();
      }}
      disabled={loading}
    >
      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </button>
  );

  return (
    <AuthShell
      contentClassName="jv-auth-content--recovery"
      topbar={
        <div className="jv-auth-topbar__group">
          <span className="jv-auth-topbar-note">Back to your account?</span>
          <Link className="jv-auth-secondary-action" to={{ pathname: '/auth', search: authContextSearch }}>
            <span>Sign in</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      }
    >
      <div className="jv-auth-heading">
        <p className="jv-auth-section-label">ACCOUNT RECOVERY</p>
        <h1>Choose a new password</h1>
        <p>Use a password you have not used before on JointVibe.</p>
      </div>

      {complete ? (
        <div className="jv-auth-form">
          <p className="jv-auth-form-status" role="status">Your password has been updated.</p>
          <Link className="jv-auth-primary-action" to={{ pathname: '/auth', search: authContextSearch }}>
            <span>Continue to sign in</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <form className="jv-auth-form" onSubmit={handleSubmit} noValidate>
          <AuthField
            id="new-password"
            label="New password"
            icon={<LockKeyhole />}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
              setFieldErrors((current) => ({ ...current, password: undefined, confirmPassword: undefined }));
            }}
            endAdornment={renderPasswordToggle('new')}
            required
            minLength={6}
            disabled={loading}
            error={fieldErrors.password}
          />
          <AuthField
            id="confirm-password"
            label="Confirm new password"
            icon={<LockKeyhole />}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Enter your new password again"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setError('');
              setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
            }}
            endAdornment={renderPasswordToggle('confirmation')}
            required
            minLength={6}
            disabled={loading}
            error={fieldErrors.confirmPassword}
          />

          <button className="jv-auth-primary-action" type="submit" disabled={loading}>
            {loading ? <span className="jv-auth-spinner" aria-hidden="true" /> : <span>Update password</span>}
            {!loading && <ArrowRight aria-hidden="true" />}
          </button>
          {error && <p className="jv-auth-form-status jv-auth-form-status--error" role="alert">{error}</p>}
        </form>
      )}
    </AuthShell>
  );
}
