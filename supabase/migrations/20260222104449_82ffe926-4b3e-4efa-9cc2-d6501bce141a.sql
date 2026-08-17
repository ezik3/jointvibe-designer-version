-- Allow venue owners to manage roster for their venues
CREATE POLICY "Venue owners can manage roster"
ON public.employee_roster
FOR ALL
TO authenticated
USING (
  auth.uid() = (SELECT owner_user_id FROM public.venues WHERE id = venue_id)
)
WITH CHECK (
  auth.uid() = (SELECT owner_user_id FROM public.venues WHERE id = venue_id)
);

-- Allow employees to view their own roster
CREATE POLICY "Employees can view their roster"
ON public.employee_roster
FOR SELECT
TO authenticated
USING (auth.uid() = employee_id);