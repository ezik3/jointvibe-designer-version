-- Create payment_requests table for QR and NFC payment flows
CREATE TABLE public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  fee DECIMAL(12,2) DEFAULT 0.10,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
  payment_method TEXT CHECK (payment_method IN ('qr_scan', 'nfc_tap', 'wallet_direct')),
  qr_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  paid_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- Venue staff can view/create payment requests for their venue
CREATE POLICY "Venue staff can view their venue payment requests"
ON public.payment_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employee_venue_links
    WHERE employee_venue_links.venue_id = payment_requests.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  )
  OR created_by = auth.uid()
  OR paid_by = auth.uid()
);

CREATE POLICY "Venue staff can create payment requests"
ON public.payment_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employee_venue_links
    WHERE employee_venue_links.venue_id = payment_requests.venue_id
    AND employee_venue_links.user_id = auth.uid()
    AND employee_venue_links.is_active = true
  )
);

CREATE POLICY "Customers can view payment requests they need to pay"
ON public.payment_requests
FOR SELECT
USING (status = 'pending' AND expires_at > now());

-- Service role can update (for edge functions)
CREATE POLICY "Service role can update payment requests"
ON public.payment_requests
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Enable realtime for payment status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_requests;

-- Index for fast QR token lookups
CREATE INDEX idx_payment_requests_qr_token ON public.payment_requests(qr_token);
CREATE INDEX idx_payment_requests_status ON public.payment_requests(status, expires_at);