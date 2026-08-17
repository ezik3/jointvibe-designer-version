import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { FoundersInterstitial } from '@/components/FoundersPass/FoundersInterstitial';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

export default function FoundersOffer() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [citySlug, setCitySlug] = useState<string | null>(null);

  useEffect(() => {
    const slug = localStorage.getItem('jv_user_city_slug');
    const dismissed = localStorage.getItem('jv_founders_shown_user');
    if (!slug || dismissed === 'dismissed') {
      navigate('/app/feed', { replace: true });
      return;
    }
    setCitySlug(slug);
  }, [navigate]);

  if (!citySlug) return null;

  const distanceTier = localStorage.getItem('jv_founders_distance_tier') || 'metro';
  const nearestCity = localStorage.getItem('jv_founders_nearest_city') || '';

  return (
    <FoundersInterstitial
      passType="user"
      citySlug={citySlug}
      distanceTier={distanceTier as 'metro' | 'near' | 'far'}
      nearestCity={nearestCity}
      onSkip={() => {
        // Temporary skip — will show again on next login
        navigate('/app/feed', { replace: true });
      }}
      onDismiss={async () => {
        localStorage.setItem('jv_founders_shown_user', 'dismissed');
        // Persist to database
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('customer_profiles')
              .update({ founders_pass_dismissed: true })
              .eq('user_id', user.id);
          }
        } catch (e) {
          console.error('Failed to persist dismissal:', e);
        }
        navigate('/app/feed', { replace: true });
      }}
      onViewPass={(slug) => {
        navigate(`/app/founders/checkout/${slug}`);
      }}
    />
  );
}
