
-- Allow venue owners to insert employee invitations
CREATE POLICY "Venue owners can create employee invitations"
ON public.employee_invitations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = invited_by);

-- Allow venue owners to update their invitations
CREATE POLICY "Venue owners can update their invitations"
ON public.employee_invitations
FOR UPDATE
TO authenticated
USING (auth.uid() = invited_by);

-- Allow employees to read their own invitations
CREATE POLICY "Employees can read their invitations"
ON public.employee_invitations
FOR SELECT
TO authenticated
USING (auth.uid() = employee_user_id OR auth.uid() = invited_by);
