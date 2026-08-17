-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Venue staff can create payment requests" ON public.payment_requests;

-- Create a new INSERT policy that allows BOTH venue owners AND staff
CREATE POLICY "Venue owners and staff can create payment requests"
ON public.payment_requests
FOR INSERT
WITH CHECK (
  -- Allow venue owner
  EXISTS (
    SELECT 1 FROM venues 
    WHERE venues.id = payment_requests.venue_id 
    AND venues.owner_user_id = auth.uid()
  )
  OR
  -- Allow active venue staff
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = payment_requests.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  )
);

-- Also update the SELECT policy to include venue owners
DROP POLICY IF EXISTS "Venue staff can view their venue payment requests" ON public.payment_requests;

CREATE POLICY "Venue owners and staff can view payment requests"
ON public.payment_requests
FOR SELECT
USING (
  -- Venue owner
  EXISTS (
    SELECT 1 FROM venues 
    WHERE venues.id = payment_requests.venue_id 
    AND venues.owner_user_id = auth.uid()
  )
  OR
  -- Active venue staff
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = payment_requests.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  )
  OR
  -- Creator of the request
  created_by = auth.uid()
  OR
  -- Customer who paid
  paid_by = auth.uid()
);

-- Add UPDATE policy for venue owners
DROP POLICY IF EXISTS "Customers can update payment requests they paid" ON public.payment_requests;

CREATE POLICY "Venue owners staff and customers can update payment requests"
ON public.payment_requests
FOR UPDATE
USING (
  -- Venue owner
  EXISTS (
    SELECT 1 FROM venues 
    WHERE venues.id = payment_requests.venue_id 
    AND venues.owner_user_id = auth.uid()
  )
  OR
  -- Active venue staff  
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = payment_requests.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  )
  OR
  -- Customer paying (pending requests only)
  (status = 'pending')
);