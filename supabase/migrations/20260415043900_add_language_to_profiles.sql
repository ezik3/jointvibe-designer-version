-- Migration: Add language field to profiles table
-- Date: 2026-04-15 04:39 UTC
-- Description: Adds language column to store user's preferred UI language

-- Add language column with default 'en' (English)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.language IS 'User''s preferred UI language (ISO 639-1 code, e.g., ''en'', ''es'', ''ja'')';

-- Create index for faster queries by language
CREATE INDEX IF NOT EXISTS idx_profiles_language ON public.profiles(language);

-- Update updated_at trigger to include language changes
-- (Assuming there's already an updated_at trigger, we don't need to modify it)

-- Insert default language for existing users (all will be 'en')
-- Note: This is already handled by the DEFAULT 'en' above

-- Add RLS policy for language updates (covered by existing update policy)

-- Verify the change
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'language'
  ) THEN
    RAISE NOTICE 'Language column added successfully to profiles table';
  ELSE
    RAISE EXCEPTION 'Failed to add language column to profiles table';
  END IF;
END $$;