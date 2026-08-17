-- Create venue operating hours table
CREATE TABLE IF NOT EXISTS public.venue_operating_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venue_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.venue_operating_hours ENABLE ROW LEVEL SECURITY;

-- RLS Policies for venue_operating_hours
-- Anyone can view operating hours (public info for customers)
CREATE POLICY "Anyone can view venue operating hours"
  ON public.venue_operating_hours
  FOR SELECT
  USING (true);

-- Venue owners can manage their own operating hours
CREATE POLICY "Venue owners can insert operating hours"
  ON public.venue_operating_hours
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venues
      WHERE id = venue_id AND owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Venue owners can update operating hours"
  ON public.venue_operating_hours
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.venues
      WHERE id = venue_id AND owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Venue owners can delete operating hours"
  ON public.venue_operating_hours
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.venues
      WHERE id = venue_id AND owner_user_id = auth.uid()
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_venue_operating_hours_updated_at
  BEFORE UPDATE ON public.venue_operating_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();