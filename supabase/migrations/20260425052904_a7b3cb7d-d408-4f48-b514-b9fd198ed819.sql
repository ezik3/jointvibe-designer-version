-- Phase 1: Multi-vehicle driver signup + verification gating (additive only)

-- Enum of supported operating modes (internal value 'runner' = JV Runner in UI)
DO $$ BEGIN
  CREATE TYPE public.driver_mode AS ENUM ('car','motorcycle','bicycle','runner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add new columns to driver_profiles (all nullable / defaulted — backward compatible)
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS vehicle_modes public.driver_mode[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS drivers_license_url text,
  ADD COLUMN IF NOT EXISTS drivers_license_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS id_document_url text,
  ADD COLUMN IF NOT EXISTS id_document_type text,
  ADD COLUMN IF NOT EXISTS id_document_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_18_plus boolean NOT NULL DEFAULT false;

-- Validation triggers (avoid CHECK constraints per project rules)
CREATE OR REPLACE FUNCTION public.validate_driver_profile_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.drivers_license_status NOT IN ('none','pending','verified','rejected') THEN
    RAISE EXCEPTION 'Invalid drivers_license_status: %', NEW.drivers_license_status;
  END IF;
  IF NEW.id_document_status NOT IN ('none','pending','verified','rejected') THEN
    RAISE EXCEPTION 'Invalid id_document_status: %', NEW.id_document_status;
  END IF;
  IF NEW.id_document_type IS NOT NULL
     AND NEW.id_document_type NOT IN ('drivers_license','passport','age_card') THEN
    RAISE EXCEPTION 'Invalid id_document_type: %', NEW.id_document_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_driver_profile_verification_trg ON public.driver_profiles;
CREATE TRIGGER validate_driver_profile_verification_trg
BEFORE INSERT OR UPDATE ON public.driver_profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_driver_profile_verification();

-- Gating trigger: prevent going active (is_available=true) without required verification
-- - Car/Motorcycle modes require drivers_license_status in (pending, verified)
-- - Bicycle/Runner modes require id_document_status in (pending, verified)
CREATE OR REPLACE FUNCTION public.enforce_driver_active_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  needs_license boolean;
  needs_id boolean;
BEGIN
  -- Only enforce when transitioning to available=true
  IF NEW.is_available IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  IF OLD.is_available = true THEN
    RETURN NEW; -- already active, no re-check
  END IF;

  needs_license := ('car'::public.driver_mode = ANY(NEW.vehicle_modes))
                OR ('motorcycle'::public.driver_mode = ANY(NEW.vehicle_modes));
  needs_id      := ('bicycle'::public.driver_mode = ANY(NEW.vehicle_modes))
                OR ('runner'::public.driver_mode = ANY(NEW.vehicle_modes));

  -- Backward compat: if vehicle_modes is empty, infer from legacy vehicle_type
  IF array_length(NEW.vehicle_modes, 1) IS NULL THEN
    needs_license := NEW.vehicle_type IN ('car','motorcycle');
    needs_id := NEW.vehicle_type IN ('bicycle','runner');
  END IF;

  IF needs_license AND NEW.drivers_license_status NOT IN ('pending','verified') THEN
    RAISE EXCEPTION 'Driver license must be uploaded before going active for car/motorcycle modes';
  END IF;

  IF needs_id AND NEW.id_document_status NOT IN ('pending','verified') THEN
    RAISE EXCEPTION 'Government ID (18+) must be uploaded before going active for bicycle/runner modes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_driver_active_verification_trg ON public.driver_profiles;
CREATE TRIGGER enforce_driver_active_verification_trg
BEFORE UPDATE ON public.driver_profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_active_verification();

-- Private storage bucket for driver verification documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-verification', 'driver-verification', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: each user can only access their own folder
DROP POLICY IF EXISTS "Drivers can view own verification docs" ON storage.objects;
CREATE POLICY "Drivers can view own verification docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'driver-verification' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Drivers can upload own verification docs" ON storage.objects;
CREATE POLICY "Drivers can upload own verification docs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'driver-verification' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Drivers can update own verification docs" ON storage.objects;
CREATE POLICY "Drivers can update own verification docs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'driver-verification' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Drivers can delete own verification docs" ON storage.objects;
CREATE POLICY "Drivers can delete own verification docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'driver-verification' AND auth.uid()::text = (storage.foldername(name))[1]);
