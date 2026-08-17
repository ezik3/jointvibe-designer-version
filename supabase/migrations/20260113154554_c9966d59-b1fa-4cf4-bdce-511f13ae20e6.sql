-- Add country column to venues table
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS country TEXT;