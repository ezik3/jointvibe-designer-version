-- Backfill: set onboarding_step to 'complete' for legacy users whose auth account
-- was created significantly before their profile row (i.e. profile was auto-created
-- by OnboardingGuard, not during normal signup).
UPDATE public.profiles p
SET onboarding_step = 'complete'
FROM auth.users u
WHERE u.id = p.user_id
  AND p.onboarding_step != 'complete'
  AND u.created_at < p.created_at - interval '1 hour';