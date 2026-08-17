
-- ============================================================
-- TIER SYSTEM TABLES
-- ============================================================

-- 1. user_tiers: Core tier state per user
CREATE TABLE public.user_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  current_tier text NOT NULL DEFAULT 'member',
  joint_score integer NOT NULL DEFAULT 0,
  vibe_score integer NOT NULL DEFAULT 0,
  reach_score integer NOT NULL DEFAULT 0,
  venue_impact_label text NOT NULL DEFAULT 'emerging',
  venue_impact_raw integer NOT NULL DEFAULT 0,
  geographic_reach text NOT NULL DEFAULT 'suburb',
  follower_count_snapshot integer NOT NULL DEFAULT 0,
  tier_at_risk boolean NOT NULL DEFAULT false,
  tier_at_risk_since timestamptz,
  streak_weeks integer NOT NULL DEFAULT 0,
  last_streak_week text,
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. tier_point_events: Individual point-earning actions with 90-day expiry
CREATE TABLE public.tier_point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  points integer NOT NULL,
  score_category text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tier_point_events_user_expires ON public.tier_point_events (user_id, expires_at);
CREATE INDEX idx_tier_point_events_user_action ON public.tier_point_events (user_id, action_type);

-- 3. venue_impact_events: Tracks correlation data for Venue Impact Score
CREATE TABLE public.venue_impact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  event_type text NOT NULL,
  impact_value integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_venue_impact_events_user ON public.venue_impact_events (user_id);

-- 4. tier_encouragement_log: Prevents duplicate encouragement notifications
CREATE TABLE public.tier_encouragement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  encouragement_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, encouragement_type)
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.user_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_point_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_impact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_encouragement_log ENABLE ROW LEVEL SECURITY;

-- user_tiers: anyone can read (for profile badge visibility), only service role writes
CREATE POLICY "Anyone can view user tiers" ON public.user_tiers
  FOR SELECT USING (true);

-- tier_point_events: users can read their own
CREATE POLICY "Users can view own point events" ON public.tier_point_events
  FOR SELECT USING (auth.uid() = user_id);

-- venue_impact_events: no public access (service role only)
-- tier_encouragement_log: no public access (service role only)

-- ============================================================
-- TRIGGER: Auto-create user_tiers row when customer_profiles is created
-- ============================================================

CREATE OR REPLACE FUNCTION public.initialize_user_tier()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_tiers (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_customer_profile_created_init_tier
  AFTER INSERT ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_user_tier();

-- ============================================================
-- TRIGGER: Auto-update updated_at on user_tiers
-- ============================================================

CREATE TRIGGER update_user_tiers_updated_at
  BEFORE UPDATE ON public.user_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- ENABLE REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_tiers;
