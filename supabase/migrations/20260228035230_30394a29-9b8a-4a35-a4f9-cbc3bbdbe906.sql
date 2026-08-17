
-- ============================================================
-- Founders Pass: 6 new tables + RLS policies
-- ============================================================

-- 1. city_products
CREATE TABLE public.city_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  city text NOT NULL,
  slug text NOT NULL,
  tier text NOT NULL DEFAULT 'C',
  pass_type text NOT NULL DEFAULT 'user',
  total_supply integer NOT NULL DEFAULT 1000,
  sold_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  stripe_price_id text,
  price_cents integer NOT NULL DEFAULT 50000,
  currency text NOT NULL DEFAULT 'usd',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.city_products ADD CONSTRAINT city_products_slug_pass_type_unique UNIQUE (slug, pass_type);

ALTER TABLE public.city_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active city products"
  ON public.city_products FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage city products"
  ON public.city_products FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. founders_purchases
CREATE TABLE public.founders_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_product_id uuid REFERENCES public.city_products(id) NOT NULL,
  pass_type text NOT NULL DEFAULT 'user',
  stripe_checkout_session_id text,
  stripe_customer_id text,
  purchaser_email text NOT NULL,
  claim_code_hash text NOT NULL,
  claim_code_prefix text NOT NULL,
  claimed_by_user_id uuid,
  claim_attempts integer DEFAULT 0,
  status text NOT NULL DEFAULT 'created',
  purchased_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.founders_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own claimed purchases"
  ON public.founders_purchases FOR SELECT
  TO authenticated
  USING (claimed_by_user_id = auth.uid());

-- 3. founder_entitlements
CREATE TABLE public.founder_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pass_type text NOT NULL DEFAULT 'user',
  city_product_id uuid REFERENCES public.city_products(id) NOT NULL,
  status text NOT NULL DEFAULT 'pending_claim',
  start_at timestamptz,
  end_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.founder_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own entitlements"
  ON public.founder_entitlements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4. founder_webhook_events
CREATE TABLE public.founder_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  payload jsonb
);

ALTER TABLE public.founder_webhook_events ENABLE ROW LEVEL SECURITY;
-- No public access; service role only

-- 5. founder_audit_logs
CREATE TABLE public.founder_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.founder_audit_logs ENABLE ROW LEVEL SECURITY;
-- No public access; service role only

-- 6. founder_claim_rate_limits
CREATE TABLE public.founder_claim_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  identifier_type text NOT NULL DEFAULT 'email',
  attempts integer DEFAULT 1,
  first_attempt_at timestamptz DEFAULT now(),
  last_attempt_at timestamptz DEFAULT now(),
  locked_until timestamptz
);

ALTER TABLE public.founder_claim_rate_limits ENABLE ROW LEVEL SECURITY;
-- No public access; service role only
