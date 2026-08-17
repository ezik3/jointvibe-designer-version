-- Create driver_profiles table for users who sign up to be drivers
CREATE TABLE public.driver_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  drivers_license_id TEXT,
  license_verified BOOLEAN DEFAULT false,
  vehicle_type TEXT, -- 'car', 'motorcycle', 'bicycle'
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_plate TEXT,
  is_available BOOLEAN DEFAULT false,
  current_latitude NUMERIC,
  current_longitude NUMERIC,
  last_location_update TIMESTAMP WITH TIME ZONE,
  total_deliveries INTEGER DEFAULT 0,
  total_rides INTEGER DEFAULT 0,
  average_rating NUMERIC DEFAULT 5.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create food_delivery_orders table
CREATE TABLE public.food_delivery_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID, -- references existing orders table
  customer_id UUID NOT NULL,
  venue_id UUID NOT NULL,
  driver_id UUID,
  status TEXT DEFAULT 'pending', -- pending, venue_confirmed, driver_assigned, picked_up, en_route, delivered, cancelled
  pickup_address TEXT,
  pickup_latitude NUMERIC,
  pickup_longitude NUMERIC,
  delivery_address TEXT NOT NULL,
  delivery_latitude NUMERIC,
  delivery_longitude NUMERIC,
  delivery_fee NUMERIC DEFAULT 0,
  platform_fee NUMERIC DEFAULT 0.10, -- $0.10 JV fee
  estimated_pickup_time TIMESTAMP WITH TIME ZONE,
  estimated_delivery_time TIMESTAMP WITH TIME ZONE,
  actual_pickup_time TIMESTAMP WITH TIME ZONE,
  actual_delivery_time TIMESTAMP WITH TIME ZONE,
  special_instructions TEXT,
  driver_rating NUMERIC,
  customer_rating NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ride_bookings table for Uber-like rides
CREATE TABLE public.ride_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  driver_id UUID,
  status TEXT DEFAULT 'pending', -- pending, driver_assigned, driver_en_route, picked_up, in_transit, completed, cancelled
  pickup_address TEXT NOT NULL,
  pickup_latitude NUMERIC,
  pickup_longitude NUMERIC,
  destination_address TEXT NOT NULL,
  destination_latitude NUMERIC,
  destination_longitude NUMERIC,
  estimated_fare NUMERIC,
  actual_fare NUMERIC,
  platform_fee NUMERIC DEFAULT 0.10, -- $0.10 JV fee
  distance_km NUMERIC,
  estimated_duration_minutes INTEGER,
  actual_duration_minutes INTEGER,
  driver_rating NUMERIC,
  customer_rating NUMERIC,
  payment_status TEXT DEFAULT 'pending', -- pending, completed, refunded
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create driver_shifts table for tracking when drivers are online
CREATE TABLE public.driver_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL,
  shift_type TEXT NOT NULL, -- 'delivery', 'ride', 'both'
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active', -- active, ended
  deliveries_completed INTEGER DEFAULT 0,
  rides_completed INTEGER DEFAULT 0,
  earnings NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_shifts ENABLE ROW LEVEL SECURITY;

-- Driver profiles policies
CREATE POLICY "Drivers can view and update own profile"
ON public.driver_profiles FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view available drivers"
ON public.driver_profiles FOR SELECT
USING (is_available = true);

-- Food delivery orders policies
CREATE POLICY "Customers can view own delivery orders"
ON public.food_delivery_orders FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Drivers can view assigned orders"
ON public.food_delivery_orders FOR SELECT
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can view pending orders to accept"
ON public.food_delivery_orders FOR SELECT
USING (status = 'venue_confirmed' AND driver_id IS NULL);

CREATE POLICY "Customers can create delivery orders"
ON public.food_delivery_orders FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Drivers can update assigned orders"
ON public.food_delivery_orders FOR UPDATE
USING (auth.uid() = driver_id OR auth.uid() = customer_id);

-- Ride bookings policies
CREATE POLICY "Customers can view own ride bookings"
ON public.ride_bookings FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Drivers can view assigned rides"
ON public.ride_bookings FOR SELECT
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can view pending rides to accept"
ON public.ride_bookings FOR SELECT
USING (status = 'pending' AND driver_id IS NULL);

CREATE POLICY "Customers can create ride bookings"
ON public.ride_bookings FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Drivers and customers can update rides"
ON public.ride_bookings FOR UPDATE
USING (auth.uid() = driver_id OR auth.uid() = customer_id);

-- Driver shifts policies
CREATE POLICY "Drivers can manage own shifts"
ON public.driver_shifts FOR ALL
USING (auth.uid() = driver_id);

-- Add trigger for updated_at columns
CREATE TRIGGER update_driver_profiles_updated_at
BEFORE UPDATE ON public.driver_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_food_delivery_orders_updated_at
BEFORE UPDATE ON public.food_delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ride_bookings_updated_at
BEFORE UPDATE ON public.ride_bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.food_delivery_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_bookings;