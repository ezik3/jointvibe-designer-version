
-- Step 1a: payment_security_settings table
CREATE TABLE IF NOT EXISTS payment_security_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_pin_hash TEXT,
  pin_set_at TIMESTAMPTZ,
  pin_failed_attempts INTEGER DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  face_enabled BOOLEAN DEFAULT false,
  face_threshold TEXT DEFAULT 'never',
  trusted_devices JSONB DEFAULT '[]'::jsonb,
  enrolled_selfie_url TEXT,
  enrolled_at TIMESTAMPTZ,
  last_verification_method TEXT,
  last_verification_at TIMESTAMPTZ,
  total_face_verifications INTEGER DEFAULT 0,
  total_pin_verifications INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Use a trigger for face_threshold validation instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_face_threshold()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.face_threshold NOT IN ('every', 'over_50', 'over_100', 'never') THEN
    RAISE EXCEPTION 'Invalid face_threshold value: %', NEW.face_threshold;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_face_threshold
  BEFORE INSERT OR UPDATE ON payment_security_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_face_threshold();

ALTER TABLE payment_security_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own payment security"
  ON payment_security_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Step 1b: payment_verification_log table
CREATE TABLE IF NOT EXISTS payment_verification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  transaction_amount NUMERIC,
  verification_method TEXT NOT NULL,
  face_match_score NUMERIC,
  liveness_score NUMERIC,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  device_id TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own verification logs"
  ON payment_verification_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role inserts verification logs"
  ON payment_verification_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_verification_log_user_time
  ON payment_verification_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_log_failures
  ON payment_verification_log(user_id, success, created_at DESC)
  WHERE success = false;

-- Step 1c: transaction_limits table
CREATE TABLE IF NOT EXISTS transaction_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_spend_limit NUMERIC DEFAULT 500.00,
  per_transaction_limit NUMERIC DEFAULT 200.00,
  daily_withdrawal_limit NUMERIC DEFAULT 1000.00,
  daily_spent_today NUMERIC DEFAULT 0.00,
  daily_spent_reset_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE transaction_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own transaction limits"
  ON transaction_limits FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
