-- Fix RLS policy to allow drivers to accept unassigned orders
DROP POLICY IF EXISTS "Drivers can update assigned orders" ON public.food_delivery_orders;

-- Allow drivers to update orders they're assigned to OR to accept unassigned orders
CREATE POLICY "Drivers can update orders" 
ON public.food_delivery_orders 
FOR UPDATE 
USING (
  -- Driver can update if they are the assigned driver
  (auth.uid() = driver_id)
  -- OR driver can accept an unassigned order (driver_id is null)
  OR (driver_id IS NULL AND status IN ('venue_confirmed', 'ready_for_pickup'))
  -- Customer can also update their own order (for ratings etc)
  OR (auth.uid() = customer_id)
);