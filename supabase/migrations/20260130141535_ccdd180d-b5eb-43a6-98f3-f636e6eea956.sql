-- Create venue_modules table for feature flags per venue
CREATE TABLE public.venue_modules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE UNIQUE NOT NULL,
  preset text NOT NULL DEFAULT 'full_suite',
  orders boolean DEFAULT true NOT NULL,
  pos boolean DEFAULT true NOT NULL,
  menu boolean DEFAULT true NOT NULL,
  payments boolean DEFAULT true NOT NULL,
  kitchen boolean DEFAULT false NOT NULL,
  deliveries boolean DEFAULT false NOT NULL,
  reservations boolean DEFAULT false NOT NULL,
  tables boolean DEFAULT false NOT NULL,
  floorplan boolean DEFAULT false NOT NULL,
  inventory boolean DEFAULT false NOT NULL,
  analytics_level text DEFAULT 'basic' NOT NULL,
  staff boolean DEFAULT false NOT NULL,
  wallet boolean DEFAULT true NOT NULL,
  ai_assistant boolean DEFAULT true NOT NULL,
  messaging boolean DEFAULT true NOT NULL,
  push_deals boolean DEFAULT true NOT NULL,
  home_orb_config jsonb DEFAULT '{}' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add comment for documentation
COMMENT ON TABLE public.venue_modules IS 'Stores feature flags and preset configuration for each venue';

-- Create index for fast lookups
CREATE INDEX idx_venue_modules_venue_id ON public.venue_modules(venue_id);

-- Enable RLS
ALTER TABLE public.venue_modules ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Venue owners can manage their own modules
CREATE POLICY "Venue owners can view their modules"
  ON public.venue_modules FOR SELECT
  USING (venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid()));

CREATE POLICY "Venue owners can update their modules"
  ON public.venue_modules FOR UPDATE
  USING (venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid()));

CREATE POLICY "Venue owners can insert their modules"
  ON public.venue_modules FOR INSERT
  WITH CHECK (venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid()));

CREATE POLICY "Venue owners can delete their modules"
  ON public.venue_modules FOR DELETE
  USING (venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid()));

-- Migrate existing venues to full_suite with all modules enabled
INSERT INTO public.venue_modules (
  venue_id, preset, orders, pos, menu, payments, kitchen, deliveries, 
  reservations, tables, floorplan, inventory, analytics_level, staff, 
  wallet, ai_assistant, messaging, push_deals
)
SELECT 
  id, 
  'full_suite', 
  true, true, true, true, true, true, 
  true, true, true, true, 'full', true, 
  true, true, true, true
FROM public.venues
WHERE id NOT IN (SELECT venue_id FROM public.venue_modules WHERE venue_id IS NOT NULL);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_venue_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_venue_modules_timestamp
  BEFORE UPDATE ON public.venue_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_venue_modules_updated_at();