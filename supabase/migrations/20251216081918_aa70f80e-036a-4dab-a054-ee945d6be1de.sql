-- Add approval_status column to venues table for admin approval workflow
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS business_license text;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS business_email text;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Create index for faster queries on approval_status
CREATE INDEX IF NOT EXISTS idx_venues_approval_status ON public.venues(approval_status);
CREATE INDEX IF NOT EXISTS idx_venues_owner_user_id ON public.venues(owner_user_id);

-- Update RLS policy to allow venue owners to insert their own venues
DROP POLICY IF EXISTS "Venue owners can insert their own venue" ON public.venues;
CREATE POLICY "Venue owners can insert their own venue" 
ON public.venues 
FOR INSERT 
WITH CHECK (auth.uid() = owner_user_id);

-- Allow venue owners to view their own venue
DROP POLICY IF EXISTS "Venue owners can view their own venue" ON public.venues;
CREATE POLICY "Venue owners can view their own venue"
ON public.venues
FOR SELECT
USING (auth.uid() = owner_user_id OR approval_status = 'approved');

-- Allow admins to update venues (for approval)
DROP POLICY IF EXISTS "Admins can update venues" ON public.venues;
CREATE POLICY "Admins can update venues"
ON public.venues
FOR UPDATE
USING (is_admin(auth.uid()));