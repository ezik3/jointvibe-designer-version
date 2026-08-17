
CREATE TABLE IF NOT EXISTS public.push_credit_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id TEXT NOT NULL UNIQUE,
  venue_id UUID NOT NULL,
  reach_tier TEXT NOT NULL,
  credits_granted INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  fulfilled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_credit_fulfillments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue owners can view their fulfillments"
  ON public.push_credit_fulfillments
  FOR SELECT
  TO authenticated
  USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );
