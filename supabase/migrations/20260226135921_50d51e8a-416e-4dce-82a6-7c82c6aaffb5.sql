
-- =============================================
-- VENUE TIER SYSTEM — COMPLETE DATABASE SCHEMA
-- =============================================

-- 1. venue_classifications
CREATE TABLE public.venue_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) NOT NULL UNIQUE,
  tier_category text NOT NULL,
  size_band text NOT NULL,
  declared_capacity integer,
  country_code text NOT NULL,
  country_name text NOT NULL DEFAULT '',
  city text,
  is_founder_venue boolean DEFAULT false,
  launchpad_mode_ends_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  original_approved_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_venue_class_pool ON public.venue_classifications (country_code, tier_category, size_band);

-- 2. venue_score_counters
CREATE TABLE public.venue_score_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) NOT NULL UNIQUE,
  window_start timestamptz NOT NULL DEFAULT now(),
  window_prev_start timestamptz NOT NULL DEFAULT (now() - interval '90 days'),
  checkins_current integer DEFAULT 0,
  unique_customers_current integer DEFAULT 0,
  returning_customers_current integer DEFAULT 0,
  orders_total_current integer DEFAULT 0,
  orders_completed_current integer DEFAULT 0,
  orders_response_time_sum_minutes numeric DEFAULT 0,
  jvc_transactions_current numeric DEFAULT 0,
  tagged_post_engagements_current integer DEFAULT 0,
  deals_run_current integer DEFAULT 0,
  events_hosted_current integer DEFAULT 0,
  push_notifications_sent_current integer DEFAULT 0,
  live_streams_current integer DEFAULT 0,
  features_used_flags integer DEFAULT 0,
  prev_checkins integer DEFAULT 0,
  prev_unique_customers integer DEFAULT 0,
  prev_returning_customers integer DEFAULT 0,
  prev_orders_total integer DEFAULT 0,
  prev_orders_completed integer DEFAULT 0,
  prev_jvc_transactions numeric DEFAULT 0,
  last_counter_reset timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. venue_tier_scores
CREATE TABLE public.venue_tier_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) NOT NULL UNIQUE,
  current_tier text NOT NULL DEFAULT 'bronze',
  composite_score integer DEFAULT 0,
  raw_score_before_multiplier integer DEFAULT 0,
  size_multiplier numeric DEFAULT 1.0,
  launchpad_active boolean DEFAULT false,
  launchpad_multiplier_applied numeric DEFAULT 1.0,
  return_rate_score integer DEFAULT 0,
  utilization_score integer DEFAULT 0,
  engagement_score integer DEFAULT 0,
  velocity_score integer DEFAULT 0,
  fulfillment_score integer DEFAULT 0,
  participation_score integer DEFAULT 0,
  is_tier_at_risk boolean DEFAULT false,
  at_risk_since timestamptz,
  grace_period_ends_at timestamptz,
  score_frozen boolean DEFAULT false,
  bonus_points integer DEFAULT 0,
  tier_updated_at timestamptz,
  last_calculated_at timestamptz,
  needs_recalculation boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable realtime on venue_tier_scores
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_tier_scores;

-- 4. venue_tier_history
CREATE TABLE public.venue_tier_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) NOT NULL,
  previous_tier text NOT NULL,
  new_tier text NOT NULL,
  composite_score_at_change integer,
  reason text NOT NULL,
  changed_at timestamptz DEFAULT now()
);
CREATE INDEX idx_venue_tier_hist ON public.venue_tier_history (venue_id, changed_at DESC);

-- 5. venue_weekly_competitions
CREATE TABLE public.venue_weekly_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) NOT NULL,
  week_start date NOT NULL,
  country_code text NOT NULL,
  tier_category text NOT NULL,
  size_band text NOT NULL,
  competition_type text NOT NULL,
  metric_value numeric DEFAULT 0,
  rank_in_pool integer,
  pool_size integer DEFAULT 0,
  meets_minimum_threshold boolean DEFAULT false,
  is_winner boolean DEFAULT false,
  winner_badge_expires_at timestamptz,
  score_bonus_applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (venue_id, week_start, competition_type)
);
CREATE INDEX idx_venue_weekly_pool ON public.venue_weekly_competitions (week_start, country_code, tier_category, size_band, competition_type);

-- 6. venue_pioneer_status
CREATE TABLE public.venue_pioneer_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) NOT NULL UNIQUE,
  country_code text NOT NULL,
  tier_category text NOT NULL,
  size_band text NOT NULL,
  pool_size_at_award integer,
  pioneer_badge_awarded_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.venue_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_score_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_tier_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_tier_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_weekly_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_pioneer_status ENABLE ROW LEVEL SECURITY;

-- venue_classifications: owner reads own, admin reads all
CREATE POLICY "Venue owner reads own classification"
  ON public.venue_classifications FOR SELECT
  USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

-- venue_score_counters: owner reads own, admin reads all
CREATE POLICY "Venue owner reads own counters"
  ON public.venue_score_counters FOR SELECT
  USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

-- venue_tier_scores: any authenticated user can read (public badge), admin writes
CREATE POLICY "Authenticated users read venue tier scores"
  ON public.venue_tier_scores FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin manages venue tier scores"
  ON public.venue_tier_scores FOR ALL
  USING (public.is_admin(auth.uid()));

-- venue_tier_history: owner reads own, admin reads all
CREATE POLICY "Venue owner reads own tier history"
  ON public.venue_tier_history FOR SELECT
  USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

-- venue_weekly_competitions: owner reads own, admin reads all
CREATE POLICY "Venue owner reads own competitions"
  ON public.venue_weekly_competitions FOR SELECT
  USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

-- venue_pioneer_status: any authenticated can read (public display)
CREATE POLICY "Authenticated users read pioneer status"
  ON public.venue_pioneer_status FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =============================================
-- CLASSIFICATION TRIGGER
-- =============================================

CREATE OR REPLACE FUNCTION public.classify_venue_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tier_category text;
  v_size_band text;
  v_country_code text;
  v_country_name text;
  v_city text;
  v_pool_count integer;
BEGIN
  -- Only fire when approval_status changes to 'approved'
  IF NEW.approval_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF OLD.approval_status = 'approved' THEN
    RETURN NEW; -- already approved, skip
  END IF;

  -- Skip if already classified
  IF EXISTS (SELECT 1 FROM venue_classifications WHERE venue_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Map venue_type to tier_category
  v_tier_category := CASE
    WHEN NEW.venue_type IN ('nightclub', 'bar', 'lounge', 'pub') THEN 'nightclub_bar_lounge'
    WHEN NEW.venue_type IN ('restaurant', 'cafe', 'bakery', 'fine_dining', 'fast_food') THEN 'restaurant_cafe_bistro'
    WHEN NEW.venue_type IN ('food_truck', 'street_vendor', 'pop_up') THEN 'food_truck_street_stall_popup'
    WHEN NEW.venue_type IN ('concert_hall') THEN 'live_music_entertainment'
    WHEN NEW.venue_type IN ('hotel_bar', 'rooftop') THEN 'hotel_resort'
    WHEN NEW.venue_type IN ('sports_bar', 'brewery', 'winery') THEN 'sports_bar_gaming'
    ELSE 'restaurant_cafe_bistro' -- default
  END;

  -- Derive size_band from capacity, fallback to staff_size
  IF NEW.capacity IS NOT NULL AND NEW.capacity > 0 THEN
    v_size_band := CASE
      WHEN NEW.capacity <= 30 THEN 'micro'
      WHEN NEW.capacity <= 100 THEN 'small'
      WHEN NEW.capacity <= 300 THEN 'medium'
      WHEN NEW.capacity <= 1000 THEN 'large'
      ELSE 'major'
    END;
  ELSE
    v_size_band := CASE
      WHEN NEW.staff_size IN ('solo', 'micro') THEN 'micro'
      WHEN NEW.staff_size = 'small' THEN 'small'
      WHEN NEW.staff_size = 'medium' THEN 'medium'
      WHEN NEW.staff_size = 'large' THEN 'large'
      WHEN NEW.staff_size = 'enterprise' THEN 'major'
      ELSE 'micro' -- default for unknown
    END;
  END IF;

  -- Country
  v_country_code := COALESCE(UPPER(LEFT(NEW.country, 2)), 'US');
  v_country_name := COALESCE(NEW.country, 'Unknown');
  v_city := NEW.city;

  -- Insert classification
  INSERT INTO venue_classifications (
    venue_id, tier_category, size_band, declared_capacity,
    country_code, country_name, city, is_founder_venue,
    launchpad_mode_ends_at, original_approved_at
  ) VALUES (
    NEW.id, v_tier_category, v_size_band, NEW.capacity,
    v_country_code, v_country_name, v_city, false,
    now() + interval '90 days', now()
  );

  -- Insert default tier scores (bronze)
  INSERT INTO venue_tier_scores (
    venue_id, current_tier, composite_score, launchpad_active,
    launchpad_multiplier_applied, needs_recalculation
  ) VALUES (
    NEW.id, 'bronze', 0, true, 1.5, true
  );

  -- Insert score counters
  INSERT INTO venue_score_counters (
    venue_id, window_start, window_prev_start
  ) VALUES (
    NEW.id, now(), now() - interval '90 days'
  );

  -- Check pioneer status
  SELECT COUNT(*) INTO v_pool_count
  FROM venue_classifications
  WHERE country_code = v_country_code
    AND tier_category = v_tier_category
    AND size_band = v_size_band;

  IF v_pool_count <= 5 THEN
    INSERT INTO venue_pioneer_status (
      venue_id, country_code, tier_category, size_band, pool_size_at_award
    ) VALUES (
      NEW.id, v_country_code, v_tier_category, v_size_band, v_pool_count
    ) ON CONFLICT (venue_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_classify_venue_on_approval
  AFTER UPDATE ON public.venues
  FOR EACH ROW
  WHEN (NEW.approval_status = 'approved')
  EXECUTE FUNCTION public.classify_venue_on_approval();

-- =============================================
-- COUNTER UPDATE TRIGGERS
-- =============================================

-- Check-in counter trigger
CREATE OR REPLACE FUNCTION public.update_venue_checkin_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window_start timestamptz;
  v_unique integer;
  v_returning integer;
BEGIN
  -- Only process if venue_id exists in counters
  IF NOT EXISTS (SELECT 1 FROM venue_score_counters WHERE venue_id = NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  SELECT window_start INTO v_window_start
  FROM venue_score_counters WHERE venue_id = NEW.venue_id;

  -- Count unique customers in window
  SELECT COUNT(DISTINCT user_id) INTO v_unique
  FROM check_ins
  WHERE venue_id = NEW.venue_id AND checked_in_at >= v_window_start;

  -- Count returning customers (appeared more than once)
  SELECT COUNT(*) INTO v_returning
  FROM (
    SELECT user_id FROM check_ins
    WHERE venue_id = NEW.venue_id AND checked_in_at >= v_window_start
    GROUP BY user_id HAVING COUNT(*) > 1
  ) sub;

  UPDATE venue_score_counters SET
    checkins_current = checkins_current + 1,
    unique_customers_current = v_unique,
    returning_customers_current = v_returning,
    updated_at = now()
  WHERE venue_id = NEW.venue_id;

  UPDATE venue_tier_scores SET needs_recalculation = true
  WHERE venue_id = NEW.venue_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_venue_checkin_counter
  AFTER INSERT ON public.check_ins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_venue_checkin_counter();

-- Order creation counter trigger
CREATE OR REPLACE FUNCTION public.update_venue_order_created_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.venue_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM venue_score_counters WHERE venue_id = NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  UPDATE venue_score_counters SET
    orders_total_current = orders_total_current + 1,
    features_used_flags = features_used_flags | 1, -- bit 0: POS
    updated_at = now()
  WHERE venue_id = NEW.venue_id;

  UPDATE venue_tier_scores SET needs_recalculation = true
  WHERE venue_id = NEW.venue_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_venue_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_venue_order_created_counter();

-- Order completed counter trigger
CREATE OR REPLACE FUNCTION public.update_venue_order_completed_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_response_minutes numeric;
BEGIN
  IF NEW.venue_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' THEN RETURN NEW; END IF; -- already completed
  IF NOT EXISTS (SELECT 1 FROM venue_score_counters WHERE venue_id = NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  -- Calculate response time in minutes
  v_response_minutes := COALESCE(
    EXTRACT(EPOCH FROM (NEW.updated_at - NEW.created_at)) / 60.0,
    0
  );

  UPDATE venue_score_counters SET
    orders_completed_current = orders_completed_current + 1,
    orders_response_time_sum_minutes = orders_response_time_sum_minutes + v_response_minutes,
    jvc_transactions_current = jvc_transactions_current + COALESCE(NEW.total, 0),
    features_used_flags = features_used_flags | 1,
    updated_at = now()
  WHERE venue_id = NEW.venue_id;

  UPDATE venue_tier_scores SET needs_recalculation = true
  WHERE venue_id = NEW.venue_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_venue_order_completed
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_venue_order_completed_counter();

-- Employee shift counter trigger (bit 7)
CREATE OR REPLACE FUNCTION public.update_venue_shift_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM venue_score_counters WHERE venue_id = NEW.venue_id) THEN
    RETURN NEW;
  END IF;

  UPDATE venue_score_counters SET
    features_used_flags = features_used_flags | 128, -- bit 7
    updated_at = now()
  WHERE venue_id = NEW.venue_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_venue_shift_counter
  AFTER INSERT ON public.employee_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_venue_shift_counter();

-- =============================================
-- 8 SCORING FUNCTIONS
-- =============================================

-- 1. Return Rate Score (0-100)
CREATE OR REPLACE FUNCTION public.calculate_venue_return_rate_score(p_venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_returning integer;
  v_unique integer;
  v_rate numeric;
  v_score numeric;
BEGIN
  SELECT returning_customers_current, unique_customers_current
  INTO v_returning, v_unique
  FROM venue_score_counters WHERE venue_id = p_venue_id;

  IF v_unique IS NULL OR v_unique < 5 THEN RETURN 40; END IF;

  v_rate := (v_returning::numeric / v_unique) * 100;

  v_score := CASE
    WHEN v_rate <= 10 THEN (v_rate / 10.0) * 20
    WHEN v_rate <= 25 THEN 20 + ((v_rate - 10) / 15.0) * 20
    WHEN v_rate <= 45 THEN 40 + ((v_rate - 25) / 20.0) * 20
    WHEN v_rate <= 65 THEN 60 + ((v_rate - 45) / 20.0) * 20
    ELSE 80 + ((v_rate - 65) / 35.0) * 20
  END;

  RETURN LEAST(100, GREATEST(0, v_score::integer));
END;
$$;

-- 2. Utilization Score (bit counting)
CREATE OR REPLACE FUNCTION public.calculate_venue_utilization_score(p_venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_flags integer;
  v_bits integer := 0;
  v_i integer;
BEGIN
  SELECT features_used_flags INTO v_flags
  FROM venue_score_counters WHERE venue_id = p_venue_id;

  IF v_flags IS NULL THEN RETURN 0; END IF;

  FOR v_i IN 0..9 LOOP
    IF (v_flags >> v_i) & 1 = 1 THEN
      v_bits := v_bits + 1;
    END IF;
  END LOOP;

  RETURN LEAST(100, (v_bits * 100) / 10);
END;
$$;

-- 3. Engagement Score
CREATE OR REPLACE FUNCTION public.calculate_venue_engagement_score(p_venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_engagements integer;
  v_checkins integer;
  v_rate numeric;
  v_score numeric;
BEGIN
  SELECT tagged_post_engagements_current, checkins_current
  INTO v_engagements, v_checkins
  FROM venue_score_counters WHERE venue_id = p_venue_id;

  IF v_checkins IS NULL OR v_checkins < 10 THEN RETURN 40; END IF;

  v_rate := (v_engagements::numeric / v_checkins) * 100;

  v_score := CASE
    WHEN v_rate <= 5 THEN (v_rate / 5.0) * 20
    WHEN v_rate <= 15 THEN 20 + ((v_rate - 5) / 10.0) * 20
    WHEN v_rate <= 30 THEN 40 + ((v_rate - 15) / 15.0) * 20
    WHEN v_rate <= 50 THEN 60 + ((v_rate - 30) / 20.0) * 20
    ELSE 80 + LEAST(20, ((v_rate - 50) / 25.0) * 20)
  END;

  RETURN LEAST(100, GREATEST(0, v_score::integer));
END;
$$;

-- 4. Velocity Score
CREATE OR REPLACE FUNCTION public.calculate_venue_velocity_score(p_venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current numeric;
  v_prev numeric;
  v_orders integer;
  v_growth numeric;
  v_score numeric;
BEGIN
  SELECT jvc_transactions_current, prev_jvc_transactions, orders_total_current
  INTO v_current, v_prev, v_orders
  FROM venue_score_counters WHERE venue_id = p_venue_id;

  IF v_orders IS NULL OR v_orders < 5 THEN RETURN 40; END IF;
  IF v_prev IS NULL OR v_prev = 0 THEN
    IF v_current > 0 THEN RETURN 80; ELSE RETURN 40; END IF;
  END IF;

  v_growth := ((v_current - v_prev) / v_prev) * 100;

  v_score := CASE
    WHEN v_growth < 0 THEN GREATEST(0, 30 + (v_growth / 100.0) * 30)
    WHEN v_growth = 0 THEN 30
    WHEN v_growth <= 25 THEN 30 + (v_growth / 25.0) * 25
    WHEN v_growth <= 75 THEN 55 + ((v_growth - 25) / 50.0) * 20
    WHEN v_growth <= 150 THEN 75 + ((v_growth - 75) / 75.0) * 15
    ELSE 90 + LEAST(10, ((v_growth - 150) / 100.0) * 10)
  END;

  RETURN LEAST(100, GREATEST(0, v_score::integer));
END;
$$;

-- 5. Fulfillment Score
CREATE OR REPLACE FUNCTION public.calculate_venue_fulfillment_score(p_venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
  v_completed integer;
  v_response_sum numeric;
  v_fulfillment_rate numeric;
  v_avg_response numeric;
  v_response_score integer;
  v_score integer;
BEGIN
  SELECT orders_total_current, orders_completed_current, orders_response_time_sum_minutes
  INTO v_total, v_completed, v_response_sum
  FROM venue_score_counters WHERE venue_id = p_venue_id;

  IF v_total IS NULL OR v_total < 5 THEN RETURN 50; END IF;

  v_fulfillment_rate := (v_completed::numeric / v_total) * 100;
  v_avg_response := v_response_sum / GREATEST(1, v_completed);

  v_response_score := CASE
    WHEN v_avg_response < 3 THEN 100
    WHEN v_avg_response < 7 THEN 80
    WHEN v_avg_response < 15 THEN 60
    WHEN v_avg_response < 30 THEN 40
    ELSE 20
  END;

  v_score := ((v_fulfillment_rate + v_response_score) / 2)::integer;
  RETURN LEAST(100, GREATEST(0, v_score));
END;
$$;

-- 6. Participation Score
CREATE OR REPLACE FUNCTION public.calculate_venue_participation_score(p_venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deals integer;
  v_events integer;
  v_push integer;
  v_live integer;
  v_points integer := 0;
BEGIN
  SELECT deals_run_current, events_hosted_current,
         push_notifications_sent_current, live_streams_current
  INTO v_deals, v_events, v_push, v_live
  FROM venue_score_counters WHERE venue_id = p_venue_id;

  v_points := v_points + LEAST(3, COALESCE(v_deals, 0)) * 15;
  v_points := v_points + LEAST(3, COALESCE(v_events, 0)) * 15;
  v_points := v_points + LEAST(4, COALESCE(v_push, 0)) * 10;
  v_points := v_points + LEAST(1, COALESCE(v_live, 0)) * 20;

  RETURN LEAST(100, v_points);
END;
$$;

-- 7. Composite Score
CREATE OR REPLACE FUNCTION public.calculate_venue_composite_score(p_venue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rr integer;
  v_util integer;
  v_eng integer;
  v_vel integer;
  v_ful integer;
  v_par integer;
  v_raw numeric;
  v_size_band text;
  v_size_mult numeric;
  v_launchpad_end timestamptz;
  v_launchpad_mult numeric := 1.0;
  v_launchpad_active boolean := false;
  v_bonus integer;
  v_final integer;
BEGIN
  v_rr := calculate_venue_return_rate_score(p_venue_id);
  v_util := calculate_venue_utilization_score(p_venue_id);
  v_eng := calculate_venue_engagement_score(p_venue_id);
  v_vel := calculate_venue_velocity_score(p_venue_id);
  v_ful := calculate_venue_fulfillment_score(p_venue_id);
  v_par := calculate_venue_participation_score(p_venue_id);

  v_raw := (v_rr * 0.25 + v_util * 0.20 + v_eng * 0.20 +
            v_vel * 0.15 + v_ful * 0.10 + v_par * 0.10) * 10;

  SELECT size_band, launchpad_mode_ends_at INTO v_size_band, v_launchpad_end
  FROM venue_classifications WHERE venue_id = p_venue_id;

  v_size_mult := CASE v_size_band
    WHEN 'micro' THEN 2.5
    WHEN 'small' THEN 2.0
    WHEN 'medium' THEN 1.5
    WHEN 'large' THEN 1.0
    WHEN 'major' THEN 0.75
    ELSE 1.0
  END;

  IF v_launchpad_end IS NOT NULL AND now() < v_launchpad_end THEN
    v_launchpad_mult := 1.5;
    v_launchpad_active := true;
  END IF;

  SELECT COALESCE(bonus_points, 0) INTO v_bonus
  FROM venue_tier_scores WHERE venue_id = p_venue_id;

  v_final := LEAST(1000, ROUND(v_raw * v_size_mult * v_launchpad_mult)::integer + COALESCE(v_bonus, 0));

  UPDATE venue_tier_scores SET
    return_rate_score = v_rr,
    utilization_score = v_util,
    engagement_score = v_eng,
    velocity_score = v_vel,
    fulfillment_score = v_ful,
    participation_score = v_par,
    raw_score_before_multiplier = v_raw::integer,
    size_multiplier = v_size_mult,
    launchpad_active = v_launchpad_active,
    launchpad_multiplier_applied = v_launchpad_mult,
    composite_score = v_final,
    last_calculated_at = now(),
    needs_recalculation = false,
    updated_at = now()
  WHERE venue_id = p_venue_id;

  RETURN v_final;
END;
$$;

-- 8. Evaluate Venue Tier (never returns 'member')
CREATE OR REPLACE FUNCTION public.evaluate_venue_tier(p_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_score integer;
  v_new_tier text;
  v_current_tier text;
  v_at_risk boolean;
  v_grace_end timestamptz;
  v_owner_id uuid;
  v_venue_name text;
BEGIN
  SELECT composite_score, current_tier, is_tier_at_risk, grace_period_ends_at
  INTO v_score, v_current_tier, v_at_risk, v_grace_end
  FROM venue_tier_scores WHERE venue_id = p_venue_id;

  IF v_score IS NULL THEN RETURN 'bronze'; END IF;

  -- Determine new tier from score
  v_new_tier := CASE
    WHEN v_score >= 900 THEN 'platinum'
    WHEN v_score >= 800 THEN 'diamond'
    WHEN v_score >= 600 THEN 'gold'
    WHEN v_score >= 300 THEN 'silver'
    ELSE 'bronze'
  END;

  IF v_new_tier = v_current_tier THEN
    -- Same tier: clear at-risk if score recovered
    IF v_at_risk THEN
      UPDATE venue_tier_scores SET
        is_tier_at_risk = false, at_risk_since = NULL, grace_period_ends_at = NULL,
        updated_at = now()
      WHERE venue_id = p_venue_id;
    END IF;
    RETURN v_current_tier;
  END IF;

  -- Get venue info for notifications
  SELECT owner_user_id, name INTO v_owner_id, v_venue_name
  FROM venues WHERE id = p_venue_id;

  -- Promotion
  IF (v_new_tier = 'platinum' AND v_current_tier IN ('diamond','gold','silver','bronze'))
    OR (v_new_tier = 'diamond' AND v_current_tier IN ('gold','silver','bronze'))
    OR (v_new_tier = 'gold' AND v_current_tier IN ('silver','bronze'))
    OR (v_new_tier = 'silver' AND v_current_tier = 'bronze')
  THEN
    UPDATE venue_tier_scores SET
      current_tier = v_new_tier, tier_updated_at = now(),
      is_tier_at_risk = false, at_risk_since = NULL, grace_period_ends_at = NULL,
      updated_at = now()
    WHERE venue_id = p_venue_id;

    INSERT INTO venue_tier_history (venue_id, previous_tier, new_tier, composite_score_at_change, reason)
    VALUES (p_venue_id, v_current_tier, v_new_tier, v_score, 'promotion');

    -- Send promotion notification
    IF v_owner_id IS NOT NULL THEN
      INSERT INTO customer_notifications (user_id, title, message, type, reference_id, reference_type)
      VALUES (v_owner_id,
        '🎉 ' || COALESCE(v_venue_name, 'Your venue') || ' reached ' || initcap(v_new_tier) || '!',
        'Your score hit ' || v_score || '/1000. Keep building!',
        'venue_tier', p_venue_id::text, 'venue_tier_promotion');
    END IF;

    RETURN v_new_tier;
  END IF;

  -- Demotion logic
  -- Bronze/Silver demote immediately
  IF v_current_tier IN ('bronze', 'silver') THEN
    UPDATE venue_tier_scores SET
      current_tier = v_new_tier, tier_updated_at = now(),
      is_tier_at_risk = false, at_risk_since = NULL, grace_period_ends_at = NULL,
      updated_at = now()
    WHERE venue_id = p_venue_id;

    INSERT INTO venue_tier_history (venue_id, previous_tier, new_tier, composite_score_at_change, reason)
    VALUES (p_venue_id, v_current_tier, v_new_tier, v_score, 'demotion');

    RETURN v_new_tier;
  END IF;

  -- Gold+ gets 30-day grace period
  IF NOT COALESCE(v_at_risk, false) THEN
    UPDATE venue_tier_scores SET
      is_tier_at_risk = true,
      at_risk_since = now(),
      grace_period_ends_at = now() + interval '30 days',
      updated_at = now()
    WHERE venue_id = p_venue_id;

    IF v_owner_id IS NOT NULL THEN
      INSERT INTO customer_notifications (user_id, title, message, type, reference_id, reference_type)
      VALUES (v_owner_id,
        '⚠️ Your ' || initcap(v_current_tier) || ' status is at risk',
        'Your score dropped below the threshold. You have 30 days to recover. Current score: ' || v_score || '/1000.',
        'venue_tier', p_venue_id::text, 'venue_tier_at_risk');
    END IF;

    RETURN v_current_tier; -- keep current tier during grace
  END IF;

  -- Already at risk — check if grace expired
  IF now() > COALESCE(v_grace_end, now()) THEN
    UPDATE venue_tier_scores SET
      current_tier = v_new_tier, tier_updated_at = now(),
      is_tier_at_risk = false, at_risk_since = NULL, grace_period_ends_at = NULL,
      updated_at = now()
    WHERE venue_id = p_venue_id;

    INSERT INTO venue_tier_history (venue_id, previous_tier, new_tier, composite_score_at_change, reason)
    VALUES (p_venue_id, v_current_tier, v_new_tier, v_score, 'grace_period_expired');

    IF v_owner_id IS NOT NULL THEN
      INSERT INTO customer_notifications (user_id, title, message, type, reference_id, reference_type)
      VALUES (v_owner_id,
        COALESCE(v_venue_name, 'Your venue') || ' moved to ' || initcap(v_new_tier),
        'Your score fell to ' || v_score || '/1000. You can climb back — the 90-day window resets your opportunity every cycle.',
        'venue_tier', p_venue_id::text, 'venue_tier_demoted');
    END IF;

    RETURN v_new_tier;
  END IF;

  -- Still within grace period
  RETURN v_current_tier;
END;
$$;
