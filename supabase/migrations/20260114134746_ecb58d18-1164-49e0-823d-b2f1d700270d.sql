-- Allow venue owners to update their own venue
CREATE POLICY "Venue owners can update their own venue"
ON public.venues
FOR UPDATE
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);