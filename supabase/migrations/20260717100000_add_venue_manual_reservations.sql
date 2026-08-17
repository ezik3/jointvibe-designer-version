-- Venue teams can record bookings for guests who do not have a JointVibe account.
ALTER TABLE public.table_reservations
  ALTER COLUMN customer_id DROP NOT NULL;

DROP POLICY IF EXISTS "Venue staff can create venue reservations" ON public.table_reservations;

CREATE POLICY "Venue staff can create venue reservations"
ON public.table_reservations
FOR INSERT
WITH CHECK (
  table_reservations.customer_id IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public.employee_venue_links
      WHERE employee_venue_links.venue_id = table_reservations.venue_id
        AND employee_venue_links.user_id = auth.uid()
        AND employee_venue_links.is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.venues
      WHERE venues.id = table_reservations.venue_id
        AND venues.owner_user_id = auth.uid()
    )
  )
);
