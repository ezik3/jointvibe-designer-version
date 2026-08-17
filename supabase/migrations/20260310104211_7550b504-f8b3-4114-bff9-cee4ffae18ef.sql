ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS background_mobile text,
  ADD COLUMN IF NOT EXISTS background_desktop text;