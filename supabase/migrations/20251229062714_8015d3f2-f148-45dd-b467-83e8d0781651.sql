-- Fix delivery tracking joins + improve driver visibility for ready orders

-- 1) Add FK so PostgREST can join food_delivery_orders -> orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'food_delivery_orders_order_id_fkey'
  ) THEN
    ALTER TABLE public.food_delivery_orders
      ADD CONSTRAINT food_delivery_orders_order_id_fkey
      FOREIGN KEY (order_id)
      REFERENCES public.orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_food_delivery_orders_order_id
  ON public.food_delivery_orders(order_id);

-- 2) Ensure drivers can see unassigned orders when they're available to pick up
-- (so realtime UPDATE to ready_for_pickup is visible and can trigger notifications)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'food_delivery_orders'
      AND policyname = 'Drivers can view pending orders to accept'
  ) THEN
    DROP POLICY "Drivers can view pending orders to accept" ON public.food_delivery_orders;
  END IF;
END $$;

CREATE POLICY "Drivers can view pending orders to accept"
ON public.food_delivery_orders
FOR SELECT
USING (
  (driver_id IS NULL)
  AND (status IN ('venue_confirmed', 'ready_for_pickup'))
);

-- 3) Make realtime payloads reliable for UPDATE events
ALTER TABLE public.food_delivery_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.food_delivery_orders;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      -- Publication might not exist in some environments
      NULL;
  END;
END $$;

-- (Optional but helpful for driver side as well)
DO $$
BEGIN
  IF to_regclass('public.ride_bookings') IS NOT NULL THEN
    ALTER TABLE public.ride_bookings REPLICA IDENTITY FULL;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_bookings;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;