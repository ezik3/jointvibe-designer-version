-- 1) Allow admins to create venue wallets (currently blocked by RLS)
CREATE POLICY "Admins can insert venue wallets"
ON public.venue_wallets
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- 2) Enable realtime payload completeness for UPDATEs
ALTER TABLE public.venues REPLICA IDENTITY FULL;
ALTER TABLE public.admin_audit_log REPLICA IDENTITY FULL;

-- 3) Enable realtime stream for admin dashboard tables
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.venues;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_log;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;