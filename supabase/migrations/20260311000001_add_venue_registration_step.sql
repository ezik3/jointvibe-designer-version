-- Add registration_step to venues table for tracking onboarding progress
-- Values: essentials | utility_bill | video | id_verification | facial_recognition | complete
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS registration_step TEXT DEFAULT NULL;

-- Backfill: existing approved venues are considered complete
UPDATE venues
SET registration_step = 'complete'
WHERE registration_step IS NULL
  AND approval_status = 'approved';
