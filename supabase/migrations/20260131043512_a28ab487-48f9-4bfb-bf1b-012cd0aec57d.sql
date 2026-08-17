-- AI Usage Tracking for intent classification and quota enforcement
-- Tracks token usage per user with daily/monthly periods

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'monthly')),
  period_start DATE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'plus', 'pro')),
  tokens_used BIGINT NOT NULL DEFAULT 0,
  venue_tokens_used BIGINT NOT NULL DEFAULT 0,
  discovery_tokens_used BIGINT NOT NULL DEFAULT 0,
  general_tokens_used BIGINT NOT NULL DEFAULT 0,
  last_reset TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_start)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS ai_usage_user_period_idx ON public.ai_usage (user_id, period_type, period_start);

-- AI subscription plans for users
CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'pro')),
  tokens_purchased BIGINT NOT NULL DEFAULT 0,
  tokens_remaining BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_subscriptions_user_idx ON public.ai_subscriptions (user_id);

-- Token limits configuration
CREATE TABLE IF NOT EXISTS public.ai_token_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan TEXT NOT NULL UNIQUE CHECK (plan IN ('free', 'plus', 'pro')),
  daily_discovery_limit BIGINT NOT NULL DEFAULT 5000,
  daily_general_limit BIGINT NOT NULL DEFAULT 0,
  monthly_discovery_limit BIGINT NOT NULL DEFAULT 50000,
  monthly_general_limit BIGINT NOT NULL DEFAULT 0,
  venue_unlimited BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default limits
INSERT INTO public.ai_token_limits (plan, daily_discovery_limit, daily_general_limit, monthly_discovery_limit, monthly_general_limit, venue_unlimited)
VALUES 
  ('free', 5000, 0, 50000, 0, true),
  ('plus', 50000, 50000, 500000, 500000, true),
  ('pro', -1, -1, -1, -1, true) -- -1 means unlimited
ON CONFLICT (plan) DO NOTHING;

-- AI top-up purchases
CREATE TABLE IF NOT EXISTS public.ai_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tokens_purchased BIGINT NOT NULL,
  amount_jvc NUMERIC(18,2) NOT NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('wallet', 'stripe')),
  stripe_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_topups_user_idx ON public.ai_topups (user_id);

-- Enable RLS
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_token_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_topups ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own AI usage"
ON public.ai_usage FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert/update AI usage"
ON public.ai_usage FOR ALL
USING (true);

CREATE POLICY "Users can view their own AI subscription"
ON public.ai_subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can manage AI subscriptions"
ON public.ai_subscriptions FOR ALL
USING (true);

CREATE POLICY "Anyone can view token limits"
ON public.ai_token_limits FOR SELECT
USING (true);

CREATE POLICY "Users can view their own top-ups"
ON public.ai_topups FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can manage top-ups"
ON public.ai_topups FOR ALL
USING (true);

-- Function to get or create user usage for current period
CREATE OR REPLACE FUNCTION public.get_or_create_ai_usage(
  p_user_id UUID,
  p_period_type TEXT DEFAULT 'daily'
)
RETURNS public.ai_usage AS $$
DECLARE
  v_usage public.ai_usage;
  v_period_start DATE;
  v_tier TEXT;
BEGIN
  -- Calculate period start
  IF p_period_type = 'daily' THEN
    v_period_start := CURRENT_DATE;
  ELSE
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  END IF;

  -- Get user tier
  SELECT COALESCE(plan, 'free') INTO v_tier
  FROM public.ai_subscriptions
  WHERE user_id = p_user_id;
  
  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  -- Try to get existing usage
  SELECT * INTO v_usage
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND period_type = p_period_type
    AND period_start = v_period_start;

  -- Create if doesn't exist
  IF v_usage.id IS NULL THEN
    INSERT INTO public.ai_usage (user_id, period_type, period_start, tier)
    VALUES (p_user_id, p_period_type, v_period_start, v_tier)
    RETURNING * INTO v_usage;
  END IF;

  RETURN v_usage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can use AI (returns remaining tokens or -1 for unlimited)
CREATE OR REPLACE FUNCTION public.check_ai_quota(
  p_user_id UUID,
  p_intent TEXT -- 'VENUE', 'DISCOVERY', 'GENERAL'
)
RETURNS JSON AS $$
DECLARE
  v_daily_usage public.ai_usage;
  v_monthly_usage public.ai_usage;
  v_limits public.ai_token_limits;
  v_subscription public.ai_subscriptions;
  v_remaining BIGINT;
  v_allowed BOOLEAN;
BEGIN
  -- Get user's subscription
  SELECT * INTO v_subscription
  FROM public.ai_subscriptions
  WHERE user_id = p_user_id;

  -- Get limits for user's plan
  SELECT * INTO v_limits
  FROM public.ai_token_limits
  WHERE plan = COALESCE(v_subscription.plan, 'free');

  -- VENUE is always unlimited
  IF p_intent = 'VENUE' THEN
    RETURN json_build_object('allowed', true, 'remaining', -1, 'intent', 'VENUE');
  END IF;

  -- Get current usage
  v_daily_usage := public.get_or_create_ai_usage(p_user_id, 'daily');
  v_monthly_usage := public.get_or_create_ai_usage(p_user_id, 'monthly');

  IF p_intent = 'DISCOVERY' THEN
    -- Check daily limit (-1 means unlimited)
    IF v_limits.daily_discovery_limit = -1 THEN
      v_remaining := -1;
      v_allowed := true;
    ELSE
      v_remaining := GREATEST(0, v_limits.daily_discovery_limit - v_daily_usage.discovery_tokens_used);
      v_allowed := v_remaining > 0;
    END IF;
  ELSIF p_intent = 'GENERAL' THEN
    -- Check if general is allowed at all
    IF v_limits.daily_general_limit = 0 AND v_limits.monthly_general_limit = 0 THEN
      -- Check for purchased tokens
      IF COALESCE(v_subscription.tokens_remaining, 0) > 0 THEN
        v_remaining := v_subscription.tokens_remaining;
        v_allowed := true;
      ELSE
        v_remaining := 0;
        v_allowed := false;
      END IF;
    ELSIF v_limits.daily_general_limit = -1 THEN
      v_remaining := -1;
      v_allowed := true;
    ELSE
      v_remaining := GREATEST(0, v_limits.daily_general_limit - v_daily_usage.general_tokens_used);
      v_allowed := v_remaining > 0;
    END IF;
  ELSE
    v_remaining := 0;
    v_allowed := false;
  END IF;

  RETURN json_build_object(
    'allowed', v_allowed,
    'remaining', v_remaining,
    'intent', p_intent,
    'plan', COALESCE(v_subscription.plan, 'free'),
    'daily_used', CASE 
      WHEN p_intent = 'DISCOVERY' THEN v_daily_usage.discovery_tokens_used
      WHEN p_intent = 'GENERAL' THEN v_daily_usage.general_tokens_used
      ELSE 0
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record token usage
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_user_id UUID,
  p_intent TEXT,
  p_tokens_used BIGINT
)
RETURNS VOID AS $$
DECLARE
  v_daily_usage public.ai_usage;
BEGIN
  -- Get or create daily usage
  v_daily_usage := public.get_or_create_ai_usage(p_user_id, 'daily');
  
  -- Update the appropriate counter
  IF p_intent = 'VENUE' THEN
    UPDATE public.ai_usage
    SET venue_tokens_used = venue_tokens_used + p_tokens_used,
        tokens_used = tokens_used + p_tokens_used,
        updated_at = now()
    WHERE id = v_daily_usage.id;
  ELSIF p_intent = 'DISCOVERY' THEN
    UPDATE public.ai_usage
    SET discovery_tokens_used = discovery_tokens_used + p_tokens_used,
        tokens_used = tokens_used + p_tokens_used,
        updated_at = now()
    WHERE id = v_daily_usage.id;
  ELSIF p_intent = 'GENERAL' THEN
    UPDATE public.ai_usage
    SET general_tokens_used = general_tokens_used + p_tokens_used,
        tokens_used = tokens_used + p_tokens_used,
        updated_at = now()
    WHERE id = v_daily_usage.id;
    
    -- Also deduct from purchased tokens if applicable
    UPDATE public.ai_subscriptions
    SET tokens_remaining = GREATEST(0, tokens_remaining - p_tokens_used),
        updated_at = now()
    WHERE user_id = p_user_id AND tokens_remaining > 0;
  END IF;
  
  -- Also update monthly usage
  UPDATE public.ai_usage
  SET tokens_used = tokens_used + p_tokens_used,
      venue_tokens_used = CASE WHEN p_intent = 'VENUE' THEN venue_tokens_used + p_tokens_used ELSE venue_tokens_used END,
      discovery_tokens_used = CASE WHEN p_intent = 'DISCOVERY' THEN discovery_tokens_used + p_tokens_used ELSE discovery_tokens_used END,
      general_tokens_used = CASE WHEN p_intent = 'GENERAL' THEN general_tokens_used + p_tokens_used ELSE general_tokens_used END,
      updated_at = now()
  WHERE user_id = p_user_id 
    AND period_type = 'monthly'
    AND period_start = DATE_TRUNC('month', CURRENT_DATE)::DATE;
    
  -- Create monthly record if it doesn't exist
  INSERT INTO public.ai_usage (user_id, period_type, period_start, tier, tokens_used, venue_tokens_used, discovery_tokens_used, general_tokens_used)
  SELECT p_user_id, 'monthly', DATE_TRUNC('month', CURRENT_DATE)::DATE, COALESCE(s.plan, 'free'), 
         p_tokens_used,
         CASE WHEN p_intent = 'VENUE' THEN p_tokens_used ELSE 0 END,
         CASE WHEN p_intent = 'DISCOVERY' THEN p_tokens_used ELSE 0 END,
         CASE WHEN p_intent = 'GENERAL' THEN p_tokens_used ELSE 0 END
  FROM (SELECT 1 AS dummy) d
  LEFT JOIN public.ai_subscriptions s ON s.user_id = p_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_usage 
    WHERE user_id = p_user_id 
      AND period_type = 'monthly'
      AND period_start = DATE_TRUNC('month', CURRENT_DATE)::DATE
  )
  ON CONFLICT (user_id, period_type, period_start) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;