
-- Venue status + subscription tracking
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_status TEXT NOT NULL DEFAULT 'testing';
ALTER TABLE venues ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS went_live_at TIMESTAMPTZ;

-- Test users table
CREATE TABLE IF NOT EXISTS venue_test_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE(venue_id, user_id)
);

-- RLS
ALTER TABLE venue_test_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue owners can manage test users"
  ON venue_test_users FOR ALL
  USING (venue_id IN (SELECT id FROM venues WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can see their own test invites"
  ON venue_test_users FOR SELECT
  USING (user_id = auth.uid());

-- Test flags on transactional tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test_order BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(venue_status);
CREATE INDEX IF NOT EXISTS idx_venue_test_users_venue ON venue_test_users(venue_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_venue_test_users_user ON venue_test_users(user_id) WHERE status = 'active';
