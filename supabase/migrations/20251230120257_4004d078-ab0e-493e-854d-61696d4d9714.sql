-- Enable RLS for floorplans & venue tables so venues can save and customers can read table options

ALTER TABLE public.floorplans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_tables ENABLE ROW LEVEL SECURITY;

-- Floorplans: authenticated users can read (needed for reservation table lookup)
DO $$ BEGIN
  CREATE POLICY "Floorplans are readable by authenticated users"
  ON public.floorplans
  FOR SELECT
  TO authenticated
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Floorplans: creator can write
DO $$ BEGIN
  CREATE POLICY "Users can create their own floorplans"
  ON public.floorplans
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own floorplans"
  ON public.floorplans
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own floorplans"
  ON public.floorplans
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Venue tables: authenticated users can read (needed for reservation table selection)
DO $$ BEGIN
  CREATE POLICY "Venue tables are readable by authenticated users"
  ON public.venue_tables
  FOR SELECT
  TO authenticated
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Venue tables: only the floorplan creator can write
DO $$ BEGIN
  CREATE POLICY "Users can create tables for their floorplans"
  ON public.venue_tables
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.floorplans fp
      WHERE fp.id = venue_tables.floorplan_id
        AND fp.created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update tables for their floorplans"
  ON public.venue_tables
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.floorplans fp
      WHERE fp.id = venue_tables.floorplan_id
        AND fp.created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete tables for their floorplans"
  ON public.venue_tables
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.floorplans fp
      WHERE fp.id = venue_tables.floorplan_id
        AND fp.created_by = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
