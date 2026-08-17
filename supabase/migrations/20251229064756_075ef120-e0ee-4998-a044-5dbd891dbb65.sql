-- Sync delivery order status when venue updates the POS order status

CREATE OR REPLACE FUNCTION public.sync_food_delivery_status_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when the status actually changes
  IF (TG_OP = 'UPDATE') AND (NEW.status IS DISTINCT FROM OLD.status) THEN

    -- When venue starts preparing in POS, that is effectively "venue confirmed" for delivery
    IF NEW.status = 'preparing' THEN
      UPDATE public.food_delivery_orders
      SET status = 'venue_confirmed',
          updated_at = now()
      WHERE order_id = NEW.id
        AND (status IS NULL OR status = 'pending');

    -- When venue marks ready in POS, delivery becomes ready for driver pickup
    ELSIF NEW.status = 'ready' THEN
      UPDATE public.food_delivery_orders
      SET status = 'ready_for_pickup',
          updated_at = now()
      WHERE order_id = NEW.id
        AND (status IS NULL OR status IN ('pending', 'venue_confirmed'));

    -- If order cancelled in POS, cancel delivery unless already delivered
    ELSIF NEW.status = 'cancelled' THEN
      UPDATE public.food_delivery_orders
      SET status = 'cancelled',
          updated_at = now()
      WHERE order_id = NEW.id
        AND (status IS DISTINCT FROM 'delivered');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_food_delivery_status_from_order ON public.orders;

CREATE TRIGGER sync_food_delivery_status_from_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_food_delivery_status_from_order();
