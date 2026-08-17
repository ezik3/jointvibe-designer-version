-- Enable REPLICA IDENTITY FULL on check_ins table for complete realtime updates
ALTER TABLE public.check_ins REPLICA IDENTITY FULL;

-- Add table to realtime publication if not already added
ALTER PUBLICATION supabase_realtime ADD TABLE public.check_ins;