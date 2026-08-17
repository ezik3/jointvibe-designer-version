-- Create venue_terminals table for staff terminal registration
CREATE TABLE public.venue_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  device_id text NOT NULL,
  terminal_name text NOT NULL DEFAULT 'Terminal',
  is_active boolean DEFAULT true,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(venue_id, device_id)
);

-- Add proximity payment fields to payment_requests
ALTER TABLE public.payment_requests 
ADD COLUMN IF NOT EXISTS proximity_token text,
ADD COLUMN IF NOT EXISTS proximity_token_expires_at timestamptz;

-- Create index for fast proximity_token lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_proximity_token 
ON public.payment_requests(proximity_token) 
WHERE proximity_token IS NOT NULL;

-- Enable RLS on venue_terminals
ALTER TABLE public.venue_terminals ENABLE ROW LEVEL SECURITY;

-- Staff can manage their own terminals
CREATE POLICY "Staff can view venue terminals"
ON public.venue_terminals FOR SELECT
USING (
  staff_id = auth.uid() OR
  venue_id IN (
    SELECT venue_id FROM public.employee_venue_links 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

CREATE POLICY "Staff can insert their terminals"
ON public.venue_terminals FOR INSERT
WITH CHECK (
  staff_id = auth.uid() AND
  venue_id IN (
    SELECT venue_id FROM public.employee_venue_links 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

CREATE POLICY "Staff can update their terminals"
ON public.venue_terminals FOR UPDATE
USING (staff_id = auth.uid());

CREATE POLICY "Staff can delete their terminals"
ON public.venue_terminals FOR DELETE
USING (staff_id = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_venue_terminals_updated_at
BEFORE UPDATE ON public.venue_terminals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();