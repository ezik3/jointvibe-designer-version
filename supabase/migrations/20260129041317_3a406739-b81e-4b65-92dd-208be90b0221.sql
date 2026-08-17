-- Add columns to referral_rewards for residual tracking
ALTER TABLE public.referral_rewards 
ADD COLUMN IF NOT EXISTS billing_period_start date NULL,
ADD COLUMN IF NOT EXISTS billing_period_end date NULL,
ADD COLUMN IF NOT EXISTS venue_id uuid NULL;

-- Add index for idempotency check on residuals (referral_id + billing_period_start)
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_residual_idempotency 
ON public.referral_rewards (referral_id, billing_period_start) 
WHERE reward_type = 'monthly_residual';

-- Create function to count residual months for a referral
CREATE OR REPLACE FUNCTION public.count_referral_residual_months(p_referral_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)::integer 
  FROM public.referral_rewards 
  WHERE referral_id = p_referral_id 
    AND reward_type = 'monthly_residual' 
    AND status = 'issued';
$$ LANGUAGE sql STABLE;

-- Create function to get total residuals for a referral (in cents)
CREATE OR REPLACE FUNCTION public.get_referral_total_residuals(p_referral_id uuid)
RETURNS integer AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::integer 
  FROM public.referral_rewards 
  WHERE referral_id = p_referral_id 
    AND reward_type = 'monthly_residual' 
    AND status = 'issued';
$$ LANGUAGE sql STABLE;

-- Add comment explaining the residual cap logic
COMMENT ON FUNCTION public.count_referral_residual_months IS 'Counts issued residual months per referral. Max 12 months or $50 lifetime cap per venue.';

-- Add realtime for referral_rewards (so UI can update)
ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_rewards;