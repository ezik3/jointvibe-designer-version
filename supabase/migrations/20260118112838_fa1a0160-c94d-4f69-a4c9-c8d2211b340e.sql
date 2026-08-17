-- Fix 1: Allow customers to insert orders and order_items for in-venue ordering
CREATE POLICY "Customers can create orders" ON public.orders
FOR INSERT WITH CHECK (true);

CREATE POLICY "Customers can update their orders" ON public.orders
FOR UPDATE USING (true);

CREATE POLICY "Customers can insert order items" ON public.order_items
FOR INSERT WITH CHECK (true);

CREATE POLICY "Customers can update order items" ON public.order_items
FOR UPDATE USING (true);

-- Fix 2: Allow customers to update payment_requests (for marking as paid)
CREATE POLICY "Customers can update payment requests they paid" ON public.payment_requests
FOR UPDATE USING (paid_by = auth.uid() OR status = 'pending');

-- Fix 3: Allow system/service to insert customer_notifications (relax policy)
DROP POLICY IF EXISTS "System can insert notifications" ON public.customer_notifications;
CREATE POLICY "Anyone can insert notifications" ON public.customer_notifications
FOR INSERT WITH CHECK (true);