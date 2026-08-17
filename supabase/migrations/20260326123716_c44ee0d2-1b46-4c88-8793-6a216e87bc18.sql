
-- Create venue_3d_models table
CREATE TABLE public.venue_3d_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE NOT NULL,
  model_url TEXT,
  model_type TEXT NOT NULL DEFAULT 'glb',
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  hotspots JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id)
);

ALTER TABLE public.venue_3d_models ENABLE ROW LEVEL SECURITY;

-- Venue owners can manage their own models
CREATE POLICY "Venue owners can manage their 3d models"
  ON public.venue_3d_models
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venues
      WHERE id = venue_3d_models.venue_id AND owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.employee_venue_links
      WHERE venue_id = venue_3d_models.venue_id
        AND user_id = auth.uid()
        AND is_active = true
        AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venues
      WHERE id = venue_3d_models.venue_id AND owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.employee_venue_links
      WHERE venue_id = venue_3d_models.venue_id
        AND user_id = auth.uid()
        AND is_active = true
        AND role IN ('owner', 'manager')
    )
  );

-- Authenticated users can read ready models (for customer check-in view)
CREATE POLICY "Authenticated users can read ready 3d models"
  ON public.venue_3d_models
  FOR SELECT
  TO authenticated
  USING (status = 'ready');

-- Storage bucket for 3D model files
INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-3d-models', 'venue-3d-models', true);

-- Storage policies
CREATE POLICY "Venue owners can upload 3d models"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'venue-3d-models');

CREATE POLICY "Anyone can view 3d models"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'venue-3d-models');

CREATE POLICY "Venue owners can delete their 3d models"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'venue-3d-models');
