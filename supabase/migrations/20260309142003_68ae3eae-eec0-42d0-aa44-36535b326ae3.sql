
-- Venue test invites table
CREATE TABLE public.venue_test_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  test_balance_cents INTEGER NOT NULL DEFAULT 250000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  UNIQUE (venue_id, invited_user_id, status)
);

-- Prevent duplicate active invites (pending or accepted) for same user+venue
CREATE UNIQUE INDEX idx_venue_test_invites_active 
  ON public.venue_test_invites (venue_id, invited_user_id) 
  WHERE status IN ('pending', 'accepted');

-- Venue-scoped test wallet balances
CREATE TABLE public.test_wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  invite_id UUID NOT NULL REFERENCES public.venue_test_invites(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  initial_balance_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

-- Enable RLS
ALTER TABLE public.venue_test_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_wallet_balances ENABLE ROW LEVEL SECURITY;

-- RLS for venue_test_invites
-- Venue owners can see invites for their venues
CREATE POLICY "Venue owners can manage invites" ON public.venue_test_invites
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid())
  );

-- Invited users can see their own invites
CREATE POLICY "Users can view their invites" ON public.venue_test_invites
  FOR SELECT TO authenticated
  USING (invited_user_id = auth.uid());

-- Invited users can update their own invites (accept/decline)
CREATE POLICY "Users can respond to invites" ON public.venue_test_invites
  FOR UPDATE TO authenticated
  USING (invited_user_id = auth.uid())
  WITH CHECK (invited_user_id = auth.uid());

-- RLS for test_wallet_balances
-- Users can see their own test balances
CREATE POLICY "Users can view own test balances" ON public.test_wallet_balances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Venue owners can see test balances for their venues
CREATE POLICY "Venue owners can view test balances" ON public.test_wallet_balances
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid())
  );

-- System inserts via edge functions (service role), but allow authenticated insert for accept flow
CREATE POLICY "Users can create own test balance on accept" ON public.test_wallet_balances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update own test balances (spending)
CREATE POLICY "Users can update own test balances" ON public.test_wallet_balances
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime for notifications (already enabled) and invites
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_test_invites;
