
-- Add onboarding_step to profiles table to track registration progress
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'email_pending';

-- Backfill all existing users as complete so they are not locked out
UPDATE profiles SET onboarding_step = 'complete' WHERE onboarding_step = 'email_pending';
