
-- Phase 1: Add columns to employee_invitations for the new invite flow
ALTER TABLE public.employee_invitations
  ADD COLUMN IF NOT EXISTS employee_user_id UUID,
  ADD COLUMN IF NOT EXISTS pin_code TEXT;

-- Add index for fast lookup by employee_user_id
CREATE INDEX IF NOT EXISTS idx_employee_invitations_employee_user_id
  ON public.employee_invitations(employee_user_id);
