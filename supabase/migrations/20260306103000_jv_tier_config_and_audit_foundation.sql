-- ============================================================
-- JV Tier Engine Foundation: Config + Evaluation Audit (Shadow Mode)
-- ============================================================
-- This migration adds configurable tier infrastructure and audit logging.
-- It does NOT replace or override existing live tier evaluation behavior.

-- 1) Tier threshold config
CREATE TABLE IF NOT EXISTS public.tier_threshold_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL CHECK (tier IN ('member', 'bronze', 'silver', 'gold', 'diamond', 'platinum')),
  promotion_contribution_threshold integer NOT NULL CHECK (promotion_contribution_threshold >= 0),
  maintenance_contribution_threshold integer NOT NULL CHECK (maintenance_contribution_threshold >= 0),
  diamond_gate_required boolean NOT NULL DEFAULT false,
  platinum_gate_required boolean NOT NULL DEFAULT false,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier, config_version)
);

CREATE INDEX IF NOT EXISTS idx_tier_threshold_config_active
  ON public.tier_threshold_config (is_active, effective_from DESC);

-- 2) Tier action weight config
CREATE TABLE IF NOT EXISTS public.tier_action_weight_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  score_category text NOT NULL CHECK (score_category IN ('vibe', 'reach')),
  points integer NOT NULL CHECK (points >= 0),
  daily_cap integer CHECK (daily_cap IS NULL OR daily_cap >= 0),
  rolling_90d_cap integer CHECK (rolling_90d_cap IS NULL OR rolling_90d_cap >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_type, config_version)
);

CREATE INDEX IF NOT EXISTS idx_tier_action_weight_config_active
  ON public.tier_action_weight_config (is_active, effective_from DESC);

-- 3) Tier delay config (deal access release waves)
CREATE TABLE IF NOT EXISTS public.tier_delay_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL CHECK (tier IN ('member', 'bronze', 'silver', 'gold', 'diamond', 'platinum')),
  applies_to text NOT NULL DEFAULT 'deal_push_access',
  delay_min_minutes integer NOT NULL CHECK (delay_min_minutes >= 0),
  delay_max_minutes integer NOT NULL CHECK (delay_max_minutes >= delay_min_minutes),
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier, applies_to, config_version)
);

CREATE INDEX IF NOT EXISTS idx_tier_delay_config_active
  ON public.tier_delay_config (is_active, applies_to, effective_from DESC);

-- 4) Tier milestone config (referral/tier qualification milestones)
CREATE TABLE IF NOT EXISTS public.tier_milestone_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_key text NOT NULL,
  milestone_name text NOT NULL,
  milestone_type text NOT NULL CHECK (milestone_type IN ('referral_qualification', 'referral_reward_qualification', 'tier_gate', 'anti_abuse')),
  description text,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  points_award integer NOT NULL DEFAULT 0 CHECK (points_award >= 0),
  requires_manual_review boolean NOT NULL DEFAULT false,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_key, config_version)
);

CREATE INDEX IF NOT EXISTS idx_tier_milestone_config_active
  ON public.tier_milestone_config (is_active, milestone_type);

-- 5) Tier evaluation logs (auditable promotion/demotion decisions)
CREATE TABLE IF NOT EXISTS public.tier_evaluation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_tier text NOT NULL,
  new_tier text NOT NULL,
  contribution_score integer NOT NULL DEFAULT 0,
  maintenance_score integer NOT NULL DEFAULT 0,
  evaluation_reason text NOT NULL,
  evaluation_source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tier_evaluation_logs_user_created
  ON public.tier_evaluation_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tier_evaluation_logs_created
  ON public.tier_evaluation_logs (created_at DESC);

-- Keep updated_at columns maintained by shared trigger function.
CREATE TRIGGER update_tier_threshold_config_updated_at
  BEFORE UPDATE ON public.tier_threshold_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tier_action_weight_config_updated_at
  BEFORE UPDATE ON public.tier_action_weight_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tier_delay_config_updated_at
  BEFORE UPDATE ON public.tier_delay_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tier_milestone_config_updated_at
  BEFORE UPDATE ON public.tier_milestone_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.tier_threshold_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_action_weight_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_delay_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_milestone_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_evaluation_logs ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users (future UI/admin consumers).
CREATE POLICY "Authenticated users can read tier threshold config"
  ON public.tier_threshold_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read tier action weight config"
  ON public.tier_action_weight_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read tier delay config"
  ON public.tier_delay_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read tier milestone config"
  ON public.tier_milestone_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can read own tier evaluation logs"
  ON public.tier_evaluation_logs FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Admin/system management policies.
CREATE POLICY "Admin manages tier threshold config"
  ON public.tier_threshold_config FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin manages tier action weight config"
  ON public.tier_action_weight_config FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin manages tier delay config"
  ON public.tier_delay_config FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin manages tier milestone config"
  ON public.tier_milestone_config FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "System manages tier evaluation logs"
  ON public.tier_evaluation_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional realtime for admin observability.
ALTER PUBLICATION supabase_realtime ADD TABLE public.tier_evaluation_logs;

-- Seed baseline threshold config (shadow mode only; not yet consumed by live evaluator).
INSERT INTO public.tier_threshold_config (
  tier,
  promotion_contribution_threshold,
  maintenance_contribution_threshold,
  diamond_gate_required,
  platinum_gate_required,
  config_version,
  is_active
)
VALUES
  ('member', 0, 0, false, false, 1, true),
  ('bronze', 150, 150, false, false, 1, true),
  ('silver', 500, 500, false, false, 1, true),
  ('gold', 1000, 1000, false, false, 1, true),
  ('diamond', 3000, 3000, true, false, 1, true),
  ('platinum', 8000, 8000, false, true, 1, true)
ON CONFLICT (tier, config_version) DO NOTHING;

-- Seed baseline action weights from current live logic.
INSERT INTO public.tier_action_weight_config (action_type, score_category, points, config_version, is_active)
VALUES
  ('checkin', 'vibe', 30, 1, true),
  ('first_checkin', 'vibe', 15, 1, true),
  ('order', 'vibe', 20, 1, true),
  ('spend_bonus', 'vibe', 25, 1, true),
  ('refer_user', 'vibe', 75, 1, true),
  ('refer_venue', 'vibe', 300, 1, true),
  ('venue_post', 'reach', 35, 1, true),
  ('fist_bump', 'reach', 3, 1, true),
  ('new_follower', 'reach', 8, 1, true),
  ('live_stream', 'reach', 60, 1, true),
  ('live_stream_viewers', 'reach', 50, 1, true),
  ('streak_bonus', 'vibe', 50, 1, true)
ON CONFLICT (action_type, config_version) DO NOTHING;

-- Seed reference delay config (future release-wave logic).
INSERT INTO public.tier_delay_config (tier, applies_to, delay_min_minutes, delay_max_minutes, config_version, is_active)
VALUES
  ('platinum', 'deal_push_access', 0, 0, 1, true),
  ('diamond', 'deal_push_access', 1, 2, 1, true),
  ('gold', 'deal_push_access', 3, 5, 1, true),
  ('silver', 'deal_push_access', 7, 10, 1, true),
  ('bronze', 'deal_push_access', 12, 20, 1, true),
  ('member', 'deal_push_access', 20, 30, 1, true)
ON CONFLICT (tier, applies_to, config_version) DO NOTHING;

-- Seed referral milestone skeletons (future qualification engine).
INSERT INTO public.tier_milestone_config (
  milestone_key,
  milestone_name,
  milestone_type,
  description,
  conditions,
  points_award,
  requires_manual_review,
  config_version,
  is_active
)
VALUES
  (
    'referral_link_venue_signup',
    'Referral Link Venue Signup Captured',
    'referral_qualification',
    'Venue signup captured from referral link. No major points/reward until activation milestones are met.',
    '{"source":"referral_link","requires":["venue_account_created"]}'::jsonb,
    0,
    false,
    1,
    true
  ),
  (
    'referral_assisted_venue_signup',
    'Assisted Venue Signup Captured',
    'referral_qualification',
    'In-person/manual assisted attribution captured and queued for stronger validation.',
    '{"source":"assisted","requires":["venue_account_created","assisted_evidence"]}'::jsonb,
    0,
    true,
    1,
    true
  ),
  (
    'referral_activation_first_successful_payment',
    'Referral Activation: First Successful Payment',
    'referral_reward_qualification',
    'Referred venue must complete first successful payment before reward qualification.',
    '{"requires":["first_successful_payment"]}'::jsonb,
    0,
    false,
    1,
    true
  ),
  (
    'referral_activation_transaction_floor',
    'Referral Activation: Transaction Floor',
    'referral_reward_qualification',
    'Referred venue must complete minimum verified transaction count before reward qualification.',
    '{"requires":["first_n_transactions"],"n":10}'::jsonb,
    0,
    false,
    1,
    true
  )
ON CONFLICT (milestone_key, config_version) DO NOTHING;
