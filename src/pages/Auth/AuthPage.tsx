import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Calculator, Check, Eye, EyeOff, LockKeyhole, Mail, Sparkles, Store, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useReferralCode } from '@/hooks/useReferralCode';
import { supabase } from '@/integrations/supabase/client';
import { AuthField } from '@/components/Auth/AuthField';
import { AuthLanguageSelector } from '@/components/Auth/AuthLanguageSelector';
import { buildAuthContextSearch, isSafeInternalRedirect } from '@/components/Auth/authNavigation';
import { AuthShell } from '@/components/Auth/AuthShell';

type AuthRole = 'user' | 'venue';
type AuthMode = 'sign-in' | 'sign-up';
type AuthFieldErrors = Partial<Record<'fullName' | 'email' | 'password', string>>;

const getRequestedRole = (search: string): AuthRole =>
  new URLSearchParams(search).get('role') === 'venue' ? 'venue' : 'user';

const getRequestedMode = (search: string): AuthMode =>
  new URLSearchParams(search).get('mode') === 'signup' ? 'sign-up' : 'sign-in';

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const { captureReferralFromURL } = useReferralCode();
  const [role, setRole] = useState<AuthRole>(() => getRequestedRole(location.search));
  const [mode, setMode] = useState<AuthMode>(() => getRequestedMode(location.search));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});

  const safeRedirect = useMemo(() => {
    const redirect = new URLSearchParams(location.search).get('redirect');
    return isSafeInternalRedirect(redirect) ? redirect : null;
  }, [location.search]);

  const recoverySearch = useMemo(
    () => buildAuthContextSearch({ role, redirect: safeRedirect }),
    [role, safeRedirect],
  );

  const routeVenueUser = useCallback(async (userId: string, replace = false) => {
    try {
      const { data: venue } = await supabase
        .from('venues')
        .select('id, name, registration_step')
        .eq('owner_user_id', userId)
        .maybeSingle();

      if (!venue) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser?.email_confirmed_at) {
          navigate('/venue/verify-email', { replace });
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('phone_verified')
          .eq('user_id', userId)
          .maybeSingle();

        if (!profile?.phone_verified) {
          navigate('/venue/verify-phone', { replace });
          return;
        }

        navigate('/venue/essentials', { replace });
        return;
      }

      if (venue.registration_step === 'complete') {
        localStorage.setItem('jv_current_venue_id', venue.id);
        localStorage.setItem('jv_current_venue_name', venue.name ?? '');
        navigate('/venue/home', { replace });
        return;
      }

      const venueStepRoutes: Record<string, string> = {
        essentials: '/venue/verification',
        utility_bill: '/venue/video-walkthrough',
        video: '/venue/id-verification',
        id_verification: '/venue/facial-recognition',
        facial_recognition: '/venue/profile-setup',
      };

      navigate(venueStepRoutes[venue.registration_step ?? ''] ?? '/venue/essentials', { replace });
    } catch (error) {
      console.error('[AuthPage] routeVenueUser error:', error);
      navigate('/venue/essentials', { replace });
    }
  }, [navigate]);

  const routeEndUser = useCallback(async (userId: string, replace = false) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_step')
        .eq('user_id', userId)
        .maybeSingle();

      const stepRoutes: Record<string, string> = {
        email_pending: '/user/verify-email',
        phone_pending: '/user/verify-phone',
        id_pending: '/user/id-verification',
        face_pending: '/user/facial-recognition',
        profile_setup: '/user/profile-setup',
        vibe_selection: '/user/vibe-selection',
      };
      const step = data?.onboarding_step || 'complete';
      navigate(stepRoutes[step] ?? '/app/feed', { replace });
    } catch (error) {
      console.error('[AuthPage] routeEndUser error:', error);
      navigate('/app/feed', { replace });
    }
  }, [navigate]);

  useEffect(() => {
    captureReferralFromURL();
  }, [captureReferralFromURL]);

  useEffect(() => {
    setRole(getRequestedRole(location.search));
    setMode(getRequestedMode(location.search));
    setFormError('');
    setFieldErrors({});
  }, [location.search]);

  useEffect(() => {
    if (safeRedirect) {
      setMode('sign-in');
    }
  }, [safeRedirect]);

  useEffect(() => {
    document.title = `${mode === 'sign-up' ? 'Create account' : 'Sign in'} | JointVibe`;
  }, [mode]);

  useEffect(() => {
    if (!user) return;

    if (safeRedirect) {
      navigate(safeRedirect, { replace: true });
      return;
    }

    const storedType = localStorage.getItem('jv_user_type');
    const requestedRole = getRequestedRole(location.search);
    if (requestedRole === 'venue' || storedType === 'venue') {
      void routeVenueUser(user.id, true);
      return;
    }

    if (storedType === 'advertiser') {
      navigate('/advertiser/onboarding', { replace: true });
      return;
    }

    void routeEndUser(user.id, true);
  }, [location.search, navigate, routeEndUser, routeVenueUser, safeRedirect, user]);

  const setAuthMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFormError('');
    setFieldErrors({});
    window.requestAnimationFrame(() => {
      document.getElementById(nextMode === 'sign-up' ? 'full-name' : 'email')?.focus();
    });
  };

  const setAuthRole = (nextRole: AuthRole) => {
    setRole(nextRole);
    setFormError('');
    setFieldErrors({});
  };

  const clearFieldError = (field: keyof AuthFieldErrors) => {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validateForm = () => {
    const nextErrors: AuthFieldErrors = {};

    if (!email.trim()) {
      nextErrors.email = 'Enter your email address.';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!password) {
      nextErrors.password = 'Enter your password.';
    } else if (mode === 'sign-up' && password.length < 8) {
      nextErrors.password = 'Password must contain at least 8 characters.';
    }

    if (mode === 'sign-up' && fullName.trim().length < 2) {
      nextErrors.fullName = 'Enter your full name.';
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError(mode === 'sign-up' ? 'Review the highlighted fields and try again.' : 'Check your email and password and try again.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setFormError('');
    localStorage.setItem('jv_user_type', role);
    localStorage.setItem('jv_signup_email', email);

    try {
      if (mode === 'sign-in') {
        const { error } = await signIn(email, password);
        if (error) {
          setFormError(error.message || 'Unable to sign in. Please try again.');
          return;
        }

        if (safeRedirect) {
          navigate(safeRedirect);
          return;
        }

        if (role === 'venue') {
          const { data: { user: loggedInUser } } = await supabase.auth.getUser();
          if (loggedInUser) {
            await routeVenueUser(loggedInUser.id);
          }
          return;
        }

        const { data: { user: loggedInUser } } = await supabase.auth.getUser();
        if (loggedInUser) {
          await routeEndUser(loggedInUser.id);
        } else {
          navigate('/app/feed');
        }
        return;
      }

      if (role === 'venue') {
        localStorage.setItem('jv_venue_name', fullName.trim());
        const { error } = await signUp(email, password, fullName, {
          emailRedirectTo: `${window.location.origin}/venue/verify-email`,
        });
        if (error) {
          setFormError(error.message || 'Unable to create your venue account. Please try again.');
          return;
        }

        navigate('/venue/verify-email');
        return;
      }

      const { error } = await signUp(email, password, fullName);
      if (error) {
        setFormError(error.message || 'Unable to create your account. Please try again.');
        return;
      }

      navigate('/user/verify-email');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to continue. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isSignIn = mode === 'sign-in';
  const isVenue = role === 'venue';
  const roleLabel = isVenue ? 'VENUE AND BUSINESS ACCESS' : 'END USER ACCESS';
  const heading = isSignIn
    ? (isVenue ? 'Venue control' : 'Welcome back')
    : 'Create account';
  const description = isSignIn
    ? (isVenue ? 'Manage service, staff, and guest experience.' : 'See what is happening near you tonight.')
    : 'Create your account and find your place in tonight\'s scene.';

  return (
    <AuthShell
      topbar={
        <div className="jv-auth-topbar__group">
          <AuthLanguageSelector />
          <span className="jv-auth-topbar-note">{isSignIn ? 'New to JointVibe?' : 'Already have an account?'}</span>
          <button
            className="jv-auth-secondary-action"
            type="button"
            onClick={() => setAuthMode(isSignIn ? 'sign-up' : 'sign-in')}
          >
            <span>{isSignIn ? 'Create account' : 'Sign in'}</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      }
    >
      {isSignIn && (
        <div className="jv-auth-role-switcher" role="tablist" aria-label="Choose account type">
          <button
            className={`jv-auth-role-tab${role === 'user' ? ' jv-auth-role-tab--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={role === 'user'}
            onClick={() => setAuthRole('user')}
          >
            <Sparkles aria-hidden="true" />
            <span>End user</span>
          </button>
          <button
            className={`jv-auth-role-tab${role === 'venue' ? ' jv-auth-role-tab--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={role === 'venue'}
            onClick={() => setAuthRole('venue')}
          >
            <Store aria-hidden="true" />
            <span>Venue</span>
          </button>
        </div>
      )}

      <div className="jv-auth-heading">
        <p className="jv-auth-section-label">{roleLabel}</p>
        <h1>{heading}</h1>
        <p>{description}</p>
      </div>

      <form className={`jv-auth-form${isSignIn ? '' : ' jv-auth-form--signup'}`} onSubmit={handleSubmit} noValidate>
        {!isSignIn && (
          <AuthField
            id="full-name"
            label={isVenue ? 'Venue / business name' : 'Full name'}
            icon={<UserRound />}
            type="text"
            autoComplete="name"
            placeholder={isVenue ? 'Your venue or business name' : 'Your full name'}
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              setFormError('');
              clearFieldError('fullName');
            }}
            error={fieldErrors.fullName}
            required
            disabled={loading}
          />
        )}

        <AuthField
          id="email"
          label="Email address"
          icon={<Mail />}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFormError('');
            clearFieldError('email');
          }}
          error={fieldErrors.email}
          required
          disabled={loading}
        />

        {!isSignIn && (
          <fieldset className="jv-auth-account-type">
            <legend>Sign up as</legend>
            <div className="jv-auth-account-type__options">
              <label className="jv-auth-account-type__option">
                <input
                  name="account-type"
                  type="radio"
                  value="user"
                  checked={role === 'user'}
                  onChange={() => setAuthRole('user')}
                  disabled={loading}
                />
                <span className="jv-auth-radio-control" aria-hidden="true" />
                <span>End user</span>
              </label>
              <label className="jv-auth-account-type__option">
                <input
                  name="account-type"
                  type="radio"
                  value="venue"
                  checked={role === 'venue'}
                  onChange={() => setAuthRole('venue')}
                  disabled={loading}
                />
                <span className="jv-auth-radio-control" aria-hidden="true" />
                <span>Venue</span>
              </label>
            </div>
          </fieldset>
        )}

        <AuthField
          id="password"
          label={isSignIn ? 'Password' : 'Create password'}
          icon={<LockKeyhole />}
          type={showPassword ? 'text' : 'password'}
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          placeholder={isSignIn ? 'Enter your password' : 'At least 8 characters'}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFormError('');
            clearFieldError('password');
          }}
          labelAction={isSignIn ? <Link to={{ pathname: '/auth/forgot-password', search: recoverySearch }}>Forgot password?</Link> : undefined}
          endAdornment={
            <button
              className="jv-auth-password-toggle"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={(event) => {
                setShowPassword((visible) => !visible);
                event.currentTarget.closest('.jv-auth-input')?.querySelector('input')?.focus();
              }}
              disabled={loading}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          }
          required
          minLength={isSignIn ? undefined : 8}
          disabled={loading}
          error={fieldErrors.password}
        />

        {isSignIn && (
          <label className="jv-auth-checkbox">
            <input type="checkbox" name="remember-me" disabled={loading} />
            <span className="jv-auth-checkbox__box" aria-hidden="true"><Check /></span>
            <span>Keep me signed in for 30 days</span>
          </label>
        )}

        <button className="jv-auth-primary-action" type="submit" disabled={loading}>
          {loading ? <span className="jv-auth-spinner" aria-hidden="true" /> : null}
          <span>{loading ? (isSignIn ? 'Signing in...' : 'Creating account...') : (isSignIn ? (isVenue ? 'Sign in to Venue Hub' : 'Sign in to JointVibe') : (isVenue ? 'Sign up for venue' : 'Create account'))}</span>
          {!loading && <ArrowRight aria-hidden="true" />}
        </button>

        {isSignIn && isVenue && (
          <button className="jv-auth-secondary-action jv-auth-saving-action" type="button" onClick={() => navigate('/venue/savings-calculator')}>
            <Calculator aria-hidden="true" />
            <span>Calculate your savings</span>
          </button>
        )}

        {formError && <p className="jv-auth-form-status jv-auth-form-status--error" role="alert">{formError}</p>}
      </form>

      <p className="jv-auth-legal">
        By continuing, you agree to our <Link to={{ pathname: "/terms", search: location.search }}>Terms of Service</Link> and <Link to={{ pathname: "/privacy", search: location.search }}>Privacy Policy</Link>.
      </p>
    </AuthShell>
  );
}
