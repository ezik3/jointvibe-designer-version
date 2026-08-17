-- Allow employees to INSERT into employee_venue_links when they have a pending invitation
CREATE POLICY "Employees can accept invitations"
ON public.employee_venue_links
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.employee_invitations
    WHERE employee_user_id = auth.uid()
      AND venue_id = employee_venue_links.venue_id
      AND status = 'pending'
  )
);

-- Allow employees to UPDATE their own invitations (e.g. mark as accepted, update pin_code)
CREATE POLICY "Employees can update own invitations"
ON public.employee_invitations
FOR UPDATE
TO authenticated
USING (auth.uid() = employee_user_id)
WITH CHECK (auth.uid() = employee_user_id);