-- Add is_test flag to table_reservations so test reservations can be
-- identified and wiped when a venue goes live.
ALTER TABLE public.table_reservations
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_table_reservations_is_test
  ON public.table_reservations(venue_id, is_test)
  WHERE is_test = true;
