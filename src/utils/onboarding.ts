import { supabase } from '@/integrations/supabase/client';

export type OnboardingStep = 
  | 'email_pending'
  | 'phone_pending'
  | 'id_pending'
  | 'face_pending'
  | 'profile_setup'
  | 'vibe_selection'
  | 'complete';

export const POST_ONBOARDING_REDIRECT_KEY = 'jointvibe-post-onboarding-redirect';

export function consumePostOnboardingRedirect() {
  const redirect = sessionStorage.getItem(POST_ONBOARDING_REDIRECT_KEY);
  sessionStorage.removeItem(POST_ONBOARDING_REDIRECT_KEY);
  return redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/app/feed';
}

export async function advanceOnboardingStep(userId: string, nextStep: OnboardingStep): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_step: nextStep })
      .eq('user_id', userId);

    if (error) {
      console.error('[Onboarding] Failed to advance step:', error);
      return false;
    }
    console.log('[Onboarding] Advanced to step:', nextStep);
    return true;
  } catch (e) {
    console.error('[Onboarding] Exception advancing step:', e);
    return false;
  }
}
