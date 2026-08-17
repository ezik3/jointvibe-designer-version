-- Add phone column to venues table for storing venue contact phone number
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS phone TEXT;