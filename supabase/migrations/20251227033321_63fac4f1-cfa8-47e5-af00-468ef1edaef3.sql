-- Enable REPLICA IDENTITY FULL on orders table for complete realtime updates
ALTER TABLE public.orders REPLICA IDENTITY FULL;