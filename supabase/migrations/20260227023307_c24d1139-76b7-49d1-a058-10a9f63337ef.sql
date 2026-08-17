
-- ============================================================
-- Area 1: Vibe Preference System & Deal Pipeline Tables
-- ============================================================

-- 1. vibe_tags — Master tag list
CREATE TABLE public.vibe_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name text UNIQUE NOT NULL,
  category text NOT NULL,
  created_by_venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vibe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read active vibe_tags"
  ON public.vibe_tags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage vibe_tags"
  ON public.vibe_tags FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Venue owners can insert pending vibe_tags"
  ON public.vibe_tags FOR INSERT TO authenticated
  WITH CHECK (status = 'pending_review' AND created_by_venue_id IS NOT NULL);

-- 2. user_vibe_preferences — User taste profile
CREATE TABLE public.user_vibe_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_name text NOT NULL,
  declared_weight numeric NOT NULL DEFAULT 1.0,
  behavioral_weight numeric NOT NULL DEFAULT 0.0,
  total_weight numeric GENERATED ALWAYS AS (declared_weight + behavioral_weight) STORED,
  selected_at timestamptz NOT NULL DEFAULT now(),
  last_reinforced_at timestamptz,
  UNIQUE(user_id, tag_name)
);

ALTER TABLE public.user_vibe_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vibe preferences"
  ON public.user_vibe_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. venue_vibe_tags — Venue taste profile
CREATE TABLE public.venue_vibe_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  tag_name text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, tag_name)
);

ALTER TABLE public.venue_vibe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read venue_vibe_tags"
  ON public.venue_vibe_tags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Venue owners can manage their venue_vibe_tags"
  ON public.venue_vibe_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

-- 4. venue_deals_library — Persistent deal content
CREATE TABLE public.venue_deals_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  headline text,
  description text,
  discount_text text,
  media_url text,
  media_type text,
  reach_tier text,
  placement_types text[],
  status text NOT NULL DEFAULT 'draft',
  linked_vibe_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  scheduled_for timestamptz,
  expires_at timestamptz
);

ALTER TABLE public.venue_deals_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read published deals"
  ON public.venue_deals_library FOR SELECT TO authenticated
  USING (status = 'published' OR EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

CREATE POLICY "Venue owners can manage their deals"
  ON public.venue_deals_library FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_deals_library;

-- 5. venue_push_credits — Credit ledger
CREATE TABLE public.venue_push_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  reach_tier text NOT NULL,
  credits_remaining integer NOT NULL DEFAULT 0,
  credit_type text NOT NULL DEFAULT 'purchased',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, reach_tier, credit_type)
);

ALTER TABLE public.venue_push_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue owners can read their credits"
  ON public.venue_push_credits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

CREATE POLICY "Venue owners can update their credits"
  ON public.venue_push_credits FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

CREATE POLICY "System can insert credits"
  ON public.venue_push_credits FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

-- 6. venue_deal_redemptions — Redemption tracking
CREATE TABLE public.venue_deal_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.venue_deals_library(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  placement_type text,
  redemption_code text NOT NULL,
  verified_at timestamptz,
  verified_by_staff_id uuid
);

ALTER TABLE public.venue_deal_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own redemptions"
  ON public.venue_deal_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own redemptions"
  ON public.venue_deal_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

CREATE POLICY "Venue owners can update redemptions (verify)"
  ON public.venue_deal_redemptions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.venues WHERE id = venue_id AND owner_user_id = auth.uid()));

-- 7. user_deal_impressions — Daily cap tracking
CREATE TABLE public.user_deal_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.venue_deals_library(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  placement_type text NOT NULL,
  impression_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, deal_id, placement_type, impression_date)
);

ALTER TABLE public.user_deal_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own impressions"
  ON public.user_deal_impressions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Area 5: Behavioral weight trigger on vibe_responses
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_behavioral_weight_on_vibe_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venue_id uuid;
  v_tag record;
BEGIN
  -- Only fire on 'yes' responses
  IF NEW.response != 'yes' THEN
    RETURN NEW;
  END IF;

  -- Get venue_id from the vibe
  SELECT venue_id INTO v_venue_id
  FROM public.venue_vibes
  WHERE id = NEW.vibe_id;

  IF v_venue_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- For each tag on this venue, update user's behavioral weight
  FOR v_tag IN SELECT tag_name FROM public.venue_vibe_tags WHERE venue_id = v_venue_id
  LOOP
    INSERT INTO public.user_vibe_preferences (user_id, tag_name, declared_weight, behavioral_weight, last_reinforced_at)
    VALUES (NEW.user_id, v_tag.tag_name, 0, 0.1, now())
    ON CONFLICT (user_id, tag_name) DO UPDATE SET
      behavioral_weight = LEAST(5.0, public.user_vibe_preferences.behavioral_weight + 0.1),
      last_reinforced_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_behavioral_weight_on_vibe_response
  AFTER INSERT ON public.vibe_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_behavioral_weight_on_vibe_response();

-- ============================================================
-- Seed vibe_tags with initial data
-- ============================================================

INSERT INTO public.vibe_tags (tag_name, category) VALUES
  ('Nightlife', 'Nightlife'),
  ('Live Music', 'Entertainment'),
  ('Cocktail Bars', 'Drinks'),
  ('Pubs & Beer Gardens', 'Drinks'),
  ('Sports Bars', 'Nightlife'),
  ('Fine Dining', 'Dining'),
  ('Casual Dining', 'Dining'),
  ('Cafes & Coffee', 'Dining'),
  ('Brunch', 'Dining'),
  ('Street Food', 'Food Type'),
  ('Rooftop Experiences', 'Experience'),
  ('Late Night Eats', 'Food Type'),
  ('Vegan & Healthy', 'Food Type'),
  ('Bakeries & Desserts', 'Food Type'),
  ('Karaoke', 'Entertainment'),
  ('Comedy Nights', 'Entertainment'),
  ('Wine Bars', 'Drinks'),
  ('Breweries', 'Drinks'),
  ('Food Trucks', 'Food Type'),
  ('Hotel Bars', 'Drinks'),
  ('Gaming', 'Entertainment'),
  ('Pool & Beach Clubs', 'Experience'),
  ('Ladies Night', 'Nightlife'),
  ('DJ Sets', 'Entertainment'),
  ('Live Bands', 'Entertainment'),
  ('Happy Hour', 'Drinks'),
  ('Trivia Nights', 'Entertainment'),
  ('Open Mic', 'Entertainment'),
  ('Bottomless Brunch', 'Dining'),
  ('Whisky Bar', 'Drinks'),
  ('Tapas', 'Food Type'),
  ('Sushi', 'Food Type'),
  ('Pizza', 'Food Type'),
  ('Burgers', 'Food Type'),
  ('Dessert Bars', 'Food Type'),
  ('Bubble Tea', 'Food Type'),
  ('Breakfast All Day', 'Dining'),
  ('Food Markets', 'Experience'),
  ('Pop-up Events', 'Experience')
ON CONFLICT (tag_name) DO NOTHING;
