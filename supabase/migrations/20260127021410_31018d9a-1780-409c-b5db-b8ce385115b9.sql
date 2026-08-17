-- Guest Payments table for non-app customer payments
CREATE TABLE public.guest_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  platform_fee NUMERIC NOT NULL DEFAULT 0.10,
  total_charged NUMERIC GENERATED ALWAYS AS (amount + platform_fee) STORED,
  guest_email TEXT,
  guest_phone TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  claim_token TEXT NOT NULL UNIQUE,
  attributed_user_id UUID,
  attributed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  paid_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 minutes')
);

-- Indexes for performance
CREATE INDEX idx_guest_payments_venue_id ON public.guest_payments(venue_id);
CREATE INDEX idx_guest_payments_claim_token ON public.guest_payments(claim_token);
CREATE INDEX idx_guest_payments_stripe_session ON public.guest_payments(stripe_session_id);
CREATE INDEX idx_guest_payments_guest_email ON public.guest_payments(guest_email) WHERE guest_email IS NOT NULL;
CREATE INDEX idx_guest_payments_status ON public.guest_payments(status);

-- Enable RLS
ALTER TABLE public.guest_payments ENABLE ROW LEVEL SECURITY;

-- Venue owners can view their guest payments
CREATE POLICY "Venue owners can view guest payments"
ON public.guest_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.venues
    WHERE venues.id = guest_payments.venue_id
    AND venues.owner_user_id = auth.uid()
  )
);

-- Public can insert (for creating checkout sessions)
CREATE POLICY "Anyone can create guest payments"
ON public.guest_payments
FOR INSERT
WITH CHECK (true);

-- Service role handles updates (via webhook)
CREATE POLICY "Service role can update guest payments"
ON public.guest_payments
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Enable realtime for POS to see instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_payments;

-- Add comment for documentation
COMMENT ON TABLE public.guest_payments IS 'Tracks payments from customers without the JV app, using Stripe Checkout';
COMMENT ON COLUMN public.guest_payments.claim_token IS 'Unique token for attribution when guest later downloads app';