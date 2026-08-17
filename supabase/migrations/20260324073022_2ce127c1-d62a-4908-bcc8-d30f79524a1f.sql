-- Allow customers to INSERT payment requests for their own orders (pickup/delivery flow)
CREATE POLICY "Customers can create payment requests for their orders"
ON public.payment_requests
FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = payment_requests.order_id
    AND orders.venue_id = payment_requests.venue_id
  )
);