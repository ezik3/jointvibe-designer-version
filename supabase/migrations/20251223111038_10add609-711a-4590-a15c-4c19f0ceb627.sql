-- 1. Add unique constraint on stripe_payment_intent_id for idempotency
ALTER TABLE public.deposit_records 
ADD CONSTRAINT deposit_records_stripe_payment_intent_id_unique 
UNIQUE (stripe_payment_intent_id);

-- 2. Add wallet_credit_amount field to deposit_records
ALTER TABLE public.deposit_records
ADD COLUMN IF NOT EXISTS wallet_credit_amount numeric;

-- 3. Add stripe_charge_amount field to deposit_records
ALTER TABLE public.deposit_records
ADD COLUMN IF NOT EXISTS stripe_charge_amount numeric;

-- 4. Add eligibility tracking fields to user_wallets
ALTER TABLE public.user_wallets
ADD COLUMN IF NOT EXISTS first_deposit_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_deposit_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_spend_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS locked_balance numeric NOT NULL DEFAULT 0;

-- 5. Add locked_balance field to venue_wallets
ALTER TABLE public.venue_wallets
ADD COLUMN IF NOT EXISTS locked_balance numeric NOT NULL DEFAULT 0;

-- 6. Add processed_at field to withdrawal_records
ALTER TABLE public.withdrawal_records
ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone;

-- 7. Create index for faster eligibility checks
CREATE INDEX IF NOT EXISTS idx_user_wallets_eligibility 
ON public.user_wallets(user_id, first_deposit_at, last_deposit_at, last_spend_at);