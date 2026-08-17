-- Add delivery settings to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS delivery_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS max_delivery_radius_km numeric DEFAULT 20;

-- Create delivery fee configuration table (system-wide settings)
CREATE TABLE IF NOT EXISTS public.delivery_fee_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  base_fee numeric NOT NULL DEFAULT 2.00,
  per_km_rate numeric NOT NULL DEFAULT 0.50,
  min_fee numeric NOT NULL DEFAULT 3.00,
  max_fee numeric NOT NULL DEFAULT 15.00,
  platform_fee numeric NOT NULL DEFAULT 0.10,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create ride fare configuration table
CREATE TABLE IF NOT EXISTS public.ride_fare_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  base_fare numeric NOT NULL DEFAULT 3.00,
  per_km_rate numeric NOT NULL DEFAULT 1.50,
  per_minute_rate numeric NOT NULL DEFAULT 0.20,
  min_fare numeric NOT NULL DEFAULT 5.00,
  max_fare numeric NOT NULL DEFAULT 200.00,
  platform_fee numeric NOT NULL DEFAULT 0.10,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Insert default delivery fee config
INSERT INTO public.delivery_fee_config (base_fee, per_km_rate, min_fee, max_fee, platform_fee)
VALUES (2.00, 0.50, 3.00, 15.00, 0.10)
ON CONFLICT DO NOTHING;

-- Insert default ride fare config
INSERT INTO public.ride_fare_config (base_fare, per_km_rate, per_minute_rate, min_fare, max_fare, platform_fee)
VALUES (3.00, 1.50, 0.20, 5.00, 200.00, 0.10)
ON CONFLICT DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE public.delivery_fee_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_fare_config ENABLE ROW LEVEL SECURITY;

-- Create read-only policies for the config tables (anyone can read)
CREATE POLICY "Anyone can read delivery fee config"
ON public.delivery_fee_config
FOR SELECT
USING (true);

CREATE POLICY "Anyone can read ride fare config"
ON public.ride_fare_config
FOR SELECT
USING (true);

-- Update food_delivery_orders to include calculated delivery fee
ALTER TABLE public.food_delivery_orders 
ADD COLUMN IF NOT EXISTS calculated_delivery_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS driver_earnings numeric DEFAULT 0;

-- Update ride_bookings to include driver earnings
ALTER TABLE public.ride_bookings 
ADD COLUMN IF NOT EXISTS driver_earnings numeric DEFAULT 0;