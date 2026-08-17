
-- Add lat/lng to city_products for proximity matching
ALTER TABLE public.city_products ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.city_products ADD COLUMN IF NOT EXISTS longitude double precision;

-- Add founders_pass_dismissed to customer_profiles
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS founders_pass_dismissed boolean DEFAULT false;
