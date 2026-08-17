
-- Auto-approve all existing pending venues
UPDATE public.venues SET approval_status = 'approved', approved_at = now() WHERE approval_status = 'pending';

-- Create trigger to auto-approve venues on INSERT
CREATE OR REPLACE FUNCTION public.auto_approve_venue_on_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.approval_status IS NULL OR NEW.approval_status = 'pending' THEN
    NEW.approval_status := 'approved';
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_venue ON public.venues;
CREATE TRIGGER trg_auto_approve_venue
  BEFORE INSERT ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_venue_on_insert();
