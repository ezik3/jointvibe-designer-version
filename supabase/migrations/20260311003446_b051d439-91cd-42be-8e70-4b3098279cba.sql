
-- Add registration_step column (idempotent via IF NOT EXISTS pattern)
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS registration_step TEXT NULL;

-- Backfill approved venues as complete
UPDATE public.venues
SET registration_step = 'complete'
WHERE approval_status = 'approved'
  AND registration_step IS NULL;
