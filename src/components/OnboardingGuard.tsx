import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { POST_ONBOARDING_REDIRECT_KEY } from '@/utils/onboarding';

const STEP_ROUTES: Record<string, string> = {
  email_pending: '/user/verify-email',
  phone_pending: '/user/verify-phone',
  id_pending: '/user/id-verification',
  face_pending: '/user/facial-recognition',
  profile_setup: '/user/profile-setup',
  vibe_selection: '/user/vibe-selection',
};

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [onboardingStep, setOnboardingStep] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchStep = async () => {
      const setResolvedStep = (step: string) => {
        if (step !== 'complete') {
          sessionStorage.setItem(
            POST_ONBOARDING_REDIRECT_KEY,
            `${location.pathname}${location.search}${location.hash}`,
          );
        }
        setOnboardingStep(step);
      };

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_step')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('[OnboardingGuard] Error fetching step:', error);
          setResolvedStep('complete');
        } else if (data) {
          setResolvedStep(data.onboarding_step || 'complete');
        } else {
          // No profile row found — check if this is a venue user
          const userType = localStorage.getItem('jv_user_type');
          const skipOnboarding = userType === 'venue' || userType === 'advertiser';
          if (skipOnboarding) {
            // Venue/Advertiser users don't use the profiles table for onboarding
            setResolvedStep('complete');
          } else {
            // Enduser with missing profile — create one as safety net
            console.warn('[OnboardingGuard] No profile found for enduser, creating one');
            // Detect legacy accounts: if user was created more than 1 hour ago
            // but has no profile, they predate the onboarding system — mark complete.
            const userCreated = user.created_at ? new Date(user.created_at) : null;
            const isLegacy = userCreated && (Date.now() - userCreated.getTime()) > 60 * 60 * 1000;
            const initialStep = isLegacy ? 'complete' : 'email_pending';

            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                user_id: user.id,
                full_name: user.user_metadata?.full_name || '',
                onboarding_step: initialStep,
              });
            if (insertError) {
              console.error('[OnboardingGuard] Failed to create profile:', insertError);
              setResolvedStep(isLegacy ? 'complete' : 'email_pending');
            } else {
              setResolvedStep(initialStep);
            }
          }
        }
      } catch (e) {
        console.error('[OnboardingGuard] Exception:', e);
        setResolvedStep('complete');
      } finally {
        setLoading(false);
      }
    };

    fetchStep();
  }, [authLoading, location.hash, location.pathname, location.search, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t("common:app.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/auth?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (onboardingStep && onboardingStep !== 'complete') {
    const redirectTo = STEP_ROUTES[onboardingStep];
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
  }

  return <>{children}</>;
}
