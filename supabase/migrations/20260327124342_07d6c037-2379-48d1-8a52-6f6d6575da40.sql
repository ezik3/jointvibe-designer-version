
-- Create venue_3d_jobs table
CREATE TABLE public.venue_3d_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'uploading',
  current_stage integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0,
  video_url text,
  preview_model_url text,
  refined_model_url text,
  final_model_url text,
  error_message text,
  priority integer NOT NULL DEFAULT 0,
  queue_position integer,
  worker_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_3d_jobs ENABLE ROW LEVEL SECURITY;

-- RLS: venue owners/staff can read their jobs
CREATE POLICY "Venue staff can read 3d jobs"
  ON public.venue_3d_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_venue_links
      WHERE employee_venue_links.venue_id = venue_3d_jobs.venue_id
        AND employee_venue_links.user_id = auth.uid()
        AND employee_venue_links.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.venues
      WHERE venues.id = venue_3d_jobs.venue_id AND venues.owner_user_id = auth.uid()
    )
  );

-- RLS: venue owners/staff can insert jobs
CREATE POLICY "Venue staff can insert 3d jobs"
  ON public.venue_3d_jobs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_venue_links
      WHERE employee_venue_links.venue_id = venue_3d_jobs.venue_id
        AND employee_venue_links.user_id = auth.uid()
        AND employee_venue_links.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.venues
      WHERE venues.id = venue_3d_jobs.venue_id AND venues.owner_user_id = auth.uid()
    )
  );

-- RLS: service role can update (for webhook callbacks)
CREATE POLICY "Service role can update 3d jobs"
  ON public.venue_3d_jobs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_3d_jobs;

-- Create venue-scan-videos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-scan-videos', 'venue-scan-videos', false);

-- Storage RLS: authenticated users can upload
CREATE POLICY "Auth users can upload scan videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'venue-scan-videos');

-- Storage RLS: authenticated users can read their uploads
CREATE POLICY "Auth users can read scan videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'venue-scan-videos');
