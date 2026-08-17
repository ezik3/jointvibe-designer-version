-- Create table for venue menu items
CREATE TABLE public.venue_menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  base_price NUMERIC NOT NULL DEFAULT 0,
  sizes JSONB DEFAULT '[]'::jsonb,
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  preparation_time INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venue_menu_items ENABLE ROW LEVEL SECURITY;

-- Venue owners and staff can manage menu items
CREATE POLICY "Venue staff can view menu items"
ON public.venue_menu_items
FOR SELECT
USING (true);

CREATE POLICY "Venue staff can create menu items"
ON public.venue_menu_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = venue_menu_items.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM venues
    WHERE venues.id = venue_menu_items.venue_id
    AND venues.owner_user_id = auth.uid()
  )
);

CREATE POLICY "Venue staff can update menu items"
ON public.venue_menu_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = venue_menu_items.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM venues
    WHERE venues.id = venue_menu_items.venue_id
    AND venues.owner_user_id = auth.uid()
  )
);

CREATE POLICY "Venue staff can delete menu items"
ON public.venue_menu_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = venue_menu_items.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM venues
    WHERE venues.id = venue_menu_items.venue_id
    AND venues.owner_user_id = auth.uid()
  )
);

-- Create table for venue menu categories
CREATE TABLE public.venue_menu_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(venue_id, name)
);

-- Enable RLS
ALTER TABLE public.venue_menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view menu categories"
ON public.venue_menu_categories
FOR SELECT
USING (true);

CREATE POLICY "Venue staff can manage categories"
ON public.venue_menu_categories
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = venue_menu_categories.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM venues
    WHERE venues.id = venue_menu_categories.venue_id
    AND venues.owner_user_id = auth.uid()
  )
);

-- Add venue_id to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id);

-- Trigger for updated_at
CREATE TRIGGER update_venue_menu_items_updated_at
  BEFORE UPDATE ON public.venue_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();