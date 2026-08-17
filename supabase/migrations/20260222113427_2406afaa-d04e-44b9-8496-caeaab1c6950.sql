
-- Drop old broken policies that reference auth.users (causing "permission denied for table users")
DROP POLICY IF EXISTS "Invitees can view own invitations" ON public.employee_invitations;
DROP POLICY IF EXISTS "Invitees can update own invitations" ON public.employee_invitations;
DROP POLICY IF EXISTS "Venue managers can manage invitations" ON public.employee_invitations;
