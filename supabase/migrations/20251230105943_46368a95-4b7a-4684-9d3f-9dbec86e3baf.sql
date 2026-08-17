-- Create table_reservations table for dine-in pre-orders
CREATE TABLE public.table_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.venue_tables(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Reservation timing
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'awaiting_deposit')),
  
  -- Customer info
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  special_requests TEXT,
  
  -- Pre-order tracking
  has_pre_order BOOLEAN NOT NULL DEFAULT false,
  
  -- Deposit tracking (hotel-style)
  deposit_required BOOLEAN NOT NULL DEFAULT false,
  deposit_amount NUMERIC DEFAULT 0,
  deposit_paid BOOLEAN NOT NULL DEFAULT false,
  deposit_paid_at TIMESTAMP WITH TIME ZONE,
  deposit_deadline TIMESTAMP WITH TIME ZONE,
  deposit_forfeited BOOLEAN NOT NULL DEFAULT false,
  
  -- Notification tracking
  notified_hours_before BOOLEAN DEFAULT false,
  notified_1hr_before BOOLEAN DEFAULT false,
  notified_30min_before BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT
);

-- Add reservation settings to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS reservations_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS min_booking_lead_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS max_advance_booking_days INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS default_reservation_duration_minutes INTEGER DEFAULT 90,
ADD COLUMN IF NOT EXISTS time_slot_interval_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS reservation_deposit_percent NUMERIC DEFAULT 20,
ADD COLUMN IF NOT EXISTS deposit_required_within_hours INTEGER DEFAULT 8,
ADD COLUMN IF NOT EXISTS deposit_deadline_hours INTEGER DEFAULT 24;

-- Enable RLS
ALTER TABLE public.table_reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Customers can view own reservations"
ON public.table_reservations
FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Customers can create reservations"
ON public.table_reservations
FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update own reservations"
ON public.table_reservations
FOR UPDATE
USING (auth.uid() = customer_id);

CREATE POLICY "Venue staff can view venue reservations"
ON public.table_reservations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = table_reservations.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  )
  OR
  EXISTS (
    SELECT 1 FROM venues
    WHERE venues.id = table_reservations.venue_id
    AND venues.owner_user_id = auth.uid()
  )
);

CREATE POLICY "Venue staff can update venue reservations"
ON public.table_reservations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM employee_venue_links
    WHERE employee_venue_links.venue_id = table_reservations.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  )
  OR
  EXISTS (
    SELECT 1 FROM venues
    WHERE venues.id = table_reservations.venue_id
    AND venues.owner_user_id = auth.uid()
  )
);

-- Add is_preorder column to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES public.table_reservations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE;

-- Create trigger to update updated_at
CREATE TRIGGER update_table_reservations_updated_at
BEFORE UPDATE ON public.table_reservations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for reservations
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_reservations;