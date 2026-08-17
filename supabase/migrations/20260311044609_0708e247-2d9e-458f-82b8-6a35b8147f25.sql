ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ NULL;

UPDATE public.venues
SET verified_at = COALESCE(approved_at, now())
WHERE approval_status = 'approved'
  AND verified_at IS NULL;