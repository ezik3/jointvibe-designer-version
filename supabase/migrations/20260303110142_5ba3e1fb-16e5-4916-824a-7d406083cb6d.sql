
-- Part A: Venue Owner Security Settings
CREATE TABLE IF NOT EXISTS venue_owner_security (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  require_pin_for_withdrawal BOOLEAN DEFAULT true,
  require_face_for_withdrawal BOOLEAN DEFAULT false,
  face_threshold_amount NUMERIC DEFAULT 100,
  withdrawal_daily_limit NUMERIC DEFAULT 10000,
  withdrawal_per_tx_limit NUMERIC DEFAULT 5000,
  pin_hash TEXT,
  pin_salt TEXT,
  pin_failed_attempts INTEGER DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  face_reference_key TEXT,
  face_enrolled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, owner_id)
);

ALTER TABLE venue_owner_security ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own security settings"
  ON venue_owner_security FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can update own security settings"
  ON venue_owner_security FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert own security settings"
  ON venue_owner_security FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins can view all security settings"
  ON venue_owner_security FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Part A: Withdrawal Audit Log
CREATE TABLE IF NOT EXISTS venue_withdrawal_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  verification_method TEXT NOT NULL,
  verification_passed BOOLEAN NOT NULL,
  failure_reason TEXT,
  ip_address TEXT,
  withdrawal_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE venue_withdrawal_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own withdrawal audit"
  ON venue_withdrawal_audit FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Admins can view all withdrawal audits"
  ON venue_withdrawal_audit FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert withdrawal audit"
  ON venue_withdrawal_audit FOR INSERT
  WITH CHECK (true);

-- Part C: Withdrawal Authorization Tokens
CREATE TABLE IF NOT EXISTS withdrawal_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  venue_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  authorized_amount NUMERIC NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE withdrawal_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role should access this table (no user-facing policies)
CREATE POLICY "No direct user access"
  ON withdrawal_auth_tokens FOR ALL
  USING (false);

-- Function to store token
CREATE OR REPLACE FUNCTION public.store_withdrawal_token(
  p_token TEXT,
  p_venue_id UUID,
  p_owner_id UUID,
  p_amount NUMERIC,
  p_expires_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM withdrawal_auth_tokens WHERE expires_at < now();
  INSERT INTO withdrawal_auth_tokens (token, venue_id, owner_id, authorized_amount, expires_at)
  VALUES (p_token, p_venue_id, p_owner_id, p_amount, p_expires_at);
END;
$$;

-- Function to validate and consume a withdrawal token (single-use)
CREATE OR REPLACE FUNCTION public.validate_withdrawal_token(
  p_token TEXT,
  p_venue_id UUID,
  p_owner_id UUID,
  p_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record withdrawal_auth_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token_record
  FROM withdrawal_auth_tokens
  WHERE token = p_token
    AND venue_id = p_venue_id
    AND owner_id = p_owner_id
    AND authorized_amount >= p_amount
    AND used = false
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE withdrawal_auth_tokens
  SET used = true, used_at = now()
  WHERE id = v_token_record.id;

  RETURN true;
END;
$$;
