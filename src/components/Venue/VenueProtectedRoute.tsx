import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { buildAuthContextSearch } from '@/components/Auth/authNavigation';
import { supabase } from '@/integrations/supabase/client';
import { rememberVenueOnboardingReturn } from '@/lib/venueOnboardingReturn';

const ONBOARDING_STEP_ROUTES: Record<string, string> = {
  essentials: '/venue/verification',
  utility_bill: '/venue/video-walkthrough',
  video: '/venue/id-verification',
  id_verification: '/venue/facial-recognition',
  facial_recognition: '/venue/profile-setup',
};

interface VenueProtectedRouteProps {
  children: React.ReactNode;
}

export default function VenueProtectedRoute({ children }: VenueProtectedRouteProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const location = useLocation();
  const requestedPath = `${location.pathname}${location.search}${location.hash}`;
  const isReferenceOnboarding = new URLSearchParams(location.search).get('source') === 'reference';

  const getOnboardingPath = useCallback(
    (pathname: string) => isReferenceOnboarding ? `${pathname}?source=reference` : pathname,
    [isReferenceOnboarding],
  );

  const checkVenueStatus = useCallback(async () => {
    let ownerUserId: string | null = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsAuthenticated(false);
        return;
      }

      ownerUserId = user.id;
      setIsAuthenticated(true);

      const { data: venue, error } = await supabase
        .from('venues')
        .select('id, name, registration_step')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking venue status:', error);
        rememberVenueOnboardingReturn(requestedPath, user.id);
        setRedirectTo(getOnboardingPath('/venue/signup'));
        return;
      }

      if (!venue) {
        rememberVenueOnboardingReturn(requestedPath, user.id);
        setRedirectTo(getOnboardingPath('/venue/essentials'));
        return;
      }

      if (venue.registration_step !== 'complete') {
        const nextRoute = ONBOARDING_STEP_ROUTES[venue.registration_step ?? ''] ?? '/venue/essentials';
        rememberVenueOnboardingReturn(requestedPath, user.id);
        setRedirectTo(getOnboardingPath(nextRoute));
        localStorage.setItem('jv_current_venue_id', venue.id);
        return;
      }

      setRedirectTo(null);
      localStorage.setItem('jv_current_venue_id', venue.id);
      localStorage.setItem('jv_current_venue_name', venue.name ?? '');
    } catch (error) {
      console.error('Error:', error);
      if (ownerUserId) rememberVenueOnboardingReturn(requestedPath, ownerUserId);
      setRedirectTo(getOnboardingPath('/venue/signup'));
    } finally {
      setIsLoading(false);
    }
  }, [getOnboardingPath, requestedPath]);

  useEffect(() => {
    void checkVenueStatus();
  }, [checkVenueStatus]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={{ pathname: '/auth', search: buildAuthContextSearch({ role: 'venue', redirect: requestedPath }) }} replace />;
  }

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
