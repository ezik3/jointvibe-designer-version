-- =============================================
-- REFERRAL SYSTEM TABLES
-- =============================================

-- Create referral_codes table
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'venue')),
  owner_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create referrals table
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  referrer_type TEXT NOT NULL CHECK (referrer_type IN ('user', 'venue')),
  referrer_id UUID NOT NULL,
  referred_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'rewarded', 'expired', 'rejected')),
  qualified_at TIMESTAMP WITH TIME ZONE,
  rewarded_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days'),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create referral_rewards table
CREATE TABLE public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('one_time_credit', 'monthly_residual')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JVC_CREDIT',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'void')),
  issued_to_type TEXT NOT NULL CHECK (issued_to_type IN ('user', 'venue')),
  issued_to_id UUID NOT NULL,
  period_month DATE,
  issued_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_referral_codes_owner ON public.referral_codes(owner_type, owner_id);
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_type, referrer_id);
CREATE INDEX idx_referrals_referred_venue ON public.referrals(referred_venue_id);
CREATE INDEX idx_referrals_status ON public.referrals(status);
CREATE INDEX idx_referral_rewards_referral ON public.referral_rewards(referral_id);
CREATE INDEX idx_referral_rewards_recipient ON public.referral_rewards(issued_to_type, issued_to_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- referral_codes policies
CREATE POLICY "Users can view own referral code"
  ON public.referral_codes FOR SELECT
  USING (owner_type = 'user' AND owner_id = auth.uid());

CREATE POLICY "Users can insert own referral code"
  ON public.referral_codes FOR INSERT
  WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

CREATE POLICY "Venues can view own referral code"
  ON public.referral_codes FOR SELECT
  USING (owner_type = 'venue' AND EXISTS (
    SELECT 1 FROM public.venues 
    WHERE venues.id = owner_id AND venues.owner_user_id = auth.uid()
  ));

CREATE POLICY "Venues can insert own referral code"
  ON public.referral_codes FOR INSERT
  WITH CHECK (owner_type = 'venue' AND EXISTS (
    SELECT 1 FROM public.venues 
    WHERE venues.id = owner_id AND venues.owner_user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all referral codes"
  ON public.referral_codes FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "System can manage referral codes"
  ON public.referral_codes FOR ALL
  USING (true);

-- referrals policies
CREATE POLICY "Users can view own referrals"
  ON public.referrals FOR SELECT
  USING (referrer_type = 'user' AND referrer_id = auth.uid());

CREATE POLICY "Venues can view own referrals"
  ON public.referrals FOR SELECT
  USING (referrer_type = 'venue' AND EXISTS (
    SELECT 1 FROM public.venues 
    WHERE venues.id = referrer_id AND venues.owner_user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all referrals"
  ON public.referrals FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "System can manage referrals"
  ON public.referrals FOR ALL
  USING (true);

-- referral_rewards policies
CREATE POLICY "Users can view own rewards"
  ON public.referral_rewards FOR SELECT
  USING (issued_to_type = 'user' AND issued_to_id = auth.uid());

CREATE POLICY "Venues can view own rewards"
  ON public.referral_rewards FOR SELECT
  USING (issued_to_type = 'venue' AND EXISTS (
    SELECT 1 FROM public.venues 
    WHERE venues.id = issued_to_id AND venues.owner_user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all rewards"
  ON public.referral_rewards FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "System can manage rewards"
  ON public.referral_rewards FOR ALL
  USING (true);

-- =============================================
-- FUNCTION: Generate unique referral code
-- =============================================

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'JV-';
  i INTEGER;
  code_exists BOOLEAN;
BEGIN
  LOOP
    result := 'JV-';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = result) INTO code_exists;
    
    IF NOT code_exists THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$;

-- =============================================
-- TRIGGER: Auto-create referral code for new users
-- =============================================

CREATE OR REPLACE FUNCTION public.create_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.referral_codes (code, owner_type, owner_id)
  VALUES (public.generate_referral_code(), 'user', NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_customer_profile_created_referral_code
  AFTER INSERT ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_referral_code();

-- =============================================
-- TRIGGER: Auto-create referral code for new venues  
-- =============================================

CREATE OR REPLACE FUNCTION public.create_venue_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.referral_codes (code, owner_type, owner_id)
  VALUES (public.generate_referral_code(), 'venue', NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_venue_created_referral_code
  AFTER INSERT ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.create_venue_referral_code();

-- =============================================
-- UPDATE TRIGGER
-- =============================================

CREATE TRIGGER update_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();