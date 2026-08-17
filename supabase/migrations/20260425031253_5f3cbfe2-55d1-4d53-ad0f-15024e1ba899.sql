
DO $$ BEGIN
  ALTER TYPE public.ad_placement_type ADD VALUE IF NOT EXISTS 'driver_signup';
EXCEPTION WHEN others THEN NULL; END $$;
