
-- Allow employees to update their own venue link (for re-accepting invitations)
CREATE POLICY "Employees can update own link"
ON public.employee_venue_links
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
