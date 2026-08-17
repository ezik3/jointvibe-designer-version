
-- Fix 2A: Add face enrollment columns to employee_venue_links
ALTER TABLE public.employee_venue_links
ADD COLUMN IF NOT EXISTS face_reference_key TEXT,
ADD COLUMN IF NOT EXISTS face_enrolled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS face_enrollment_status TEXT DEFAULT 'not_enrolled';

-- Add check constraint via trigger (not CHECK constraint per guidelines)
CREATE OR REPLACE FUNCTION public.validate_face_enrollment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.face_enrollment_status NOT IN ('not_enrolled', 'enrolled', 'failed') THEN
    RAISE EXCEPTION 'Invalid face_enrollment_status: %', NEW.face_enrollment_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_face_enrollment_status
  BEFORE INSERT OR UPDATE ON public.employee_venue_links
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_face_enrollment_status();

-- Fix 2A: Employee face auth audit log
CREATE TABLE IF NOT EXISTS public.employee_face_auth_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  venue_id UUID NOT NULL,
  success BOOLEAN NOT NULL,
  confidence_score NUMERIC,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employee_face_auth_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue owners can view their auth logs"
  ON public.employee_face_auth_log FOR SELECT
  USING (venue_id IN (SELECT id FROM venues WHERE owner_user_id = auth.uid()));

CREATE POLICY "Admins can view all auth logs"
  ON public.employee_face_auth_log FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "System inserts auth logs"
  ON public.employee_face_auth_log FOR INSERT
  WITH CHECK (true);

-- Fix 2A: Employee verification tokens (short-lived, for face auth sessions)
CREATE TABLE IF NOT EXISTS public.employee_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employee_verification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System manages verification tokens"
  ON public.employee_verification_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

-- Fix 2A: Private storage bucket for employee face photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-faces', 'employee-faces', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Employees can upload own face"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'employee-faces'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "System can read employee faces"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'employee-faces');

-- Fix 2E: Add require_employee_face_id setting to venues
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS require_employee_face_id BOOLEAN DEFAULT false;
