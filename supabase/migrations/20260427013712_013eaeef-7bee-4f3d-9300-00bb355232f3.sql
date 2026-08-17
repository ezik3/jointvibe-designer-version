ALTER TABLE public.runner_jobs
ADD COLUMN IF NOT EXISTS pickup_venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_runner_jobs_pickup_venue_id
ON public.runner_jobs(pickup_venue_id)
WHERE pickup_venue_id IS NOT NULL;