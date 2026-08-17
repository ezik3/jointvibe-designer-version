-- Phase 2: JV Runner system (additive only)

-- Status enum
DO $$ BEGIN
  CREATE TYPE public.runner_job_status AS ENUM (
    'pending','accepted','at_store','awaiting_approval','approved',
    'purchased','delivered','completed','cancelled','rejected','disputed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.runner_price_tier AS ENUM ('quick','standard','priority');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.runner_hold_status AS ENUM ('held','released','captured','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.runner_fraud_flag_type AS ENUM (
    'exceeded_tolerance','cancelled_at_store','failed_delivery','approval_timeout_override'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main jobs table
CREATE TABLE IF NOT EXISTS public.runner_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  runner_id uuid,
  status public.runner_job_status NOT NULL DEFAULT 'pending',

  task_description text NOT NULL,

  pickup_address text,
  pickup_latitude numeric,
  pickup_longitude numeric,
  dropoff_address text NOT NULL,
  dropoff_latitude numeric,
  dropoff_longitude numeric,

  price_tier public.runner_price_tier NOT NULL,
  runner_fee_usd numeric(10,2) NOT NULL,
  tip_usd numeric(10,2) NOT NULL DEFAULT 0,
  est_item_cost_usd numeric(10,2) NOT NULL DEFAULT 0,
  buffer_pct numeric(5,2) NOT NULL DEFAULT 25,
  held_amount_usd numeric(10,2) NOT NULL,

  approved_total_usd numeric(10,2),
  final_item_cost_usd numeric(10,2),

  cart_preview_json jsonb,
  purchase_proof_urls text[] NOT NULL DEFAULT '{}',
  dropoff_proof_urls text[] NOT NULL DEFAULT '{}',

  cancel_reason text,

  approval_requested_at timestamptz,
  approved_at timestamptz,
  accepted_at timestamptz,
  purchased_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  dispute_window_ends_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runner_jobs_status ON public.runner_jobs (status);
CREATE INDEX IF NOT EXISTS idx_runner_jobs_customer ON public.runner_jobs (customer_id);
CREATE INDEX IF NOT EXISTS idx_runner_jobs_runner ON public.runner_jobs (runner_id);
CREATE INDEX IF NOT EXISTS idx_runner_jobs_pending_created ON public.runner_jobs (created_at) WHERE status = 'pending';

-- Wallet holds
CREATE TABLE IF NOT EXISTS public.runner_wallet_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.runner_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount_usd numeric(10,2) NOT NULL,
  status public.runner_hold_status NOT NULL DEFAULT 'held',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runner_holds_job ON public.runner_wallet_holds (job_id);
CREATE INDEX IF NOT EXISTS idx_runner_holds_user ON public.runner_wallet_holds (user_id);

-- Fraud flags
CREATE TABLE IF NOT EXISTS public.runner_fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL,
  job_id uuid REFERENCES public.runner_jobs(id) ON DELETE SET NULL,
  flag_type public.runner_fraud_flag_type NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runner_fraud_runner_created ON public.runner_fraud_flags (runner_id, created_at DESC);

-- updated_at trigger
CREATE TRIGGER trg_runner_jobs_updated_at
BEFORE UPDATE ON public.runner_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_runner_holds_updated_at
BEFORE UPDATE ON public.runner_wallet_holds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger: $50 out-of-pocket cap + ±$0.50 tolerance
CREATE OR REPLACE FUNCTION public.validate_runner_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- $50 hard cap on actual purchase
  IF NEW.final_item_cost_usd IS NOT NULL AND NEW.final_item_cost_usd > 50 THEN
    RAISE EXCEPTION 'Runner purchase exceeds $50 out-of-pocket cap (got %)', NEW.final_item_cost_usd;
  END IF;

  -- est cap also at $50 to keep things consistent at request time
  IF NEW.est_item_cost_usd > 50 THEN
    RAISE EXCEPTION 'Estimated item cost exceeds $50 cap';
  END IF;

  -- Tolerance: if final exceeds approved by > $0.50, force re-approval
  IF NEW.final_item_cost_usd IS NOT NULL
     AND NEW.approved_total_usd IS NOT NULL
     AND NEW.final_item_cost_usd > (NEW.approved_total_usd + 0.50)
     AND NEW.status = 'purchased' THEN
    RAISE EXCEPTION 'Final cost % exceeds approved % by more than $0.50; status must be awaiting_approval',
      NEW.final_item_cost_usd, NEW.approved_total_usd;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_runner_job_trg ON public.runner_jobs;
CREATE TRIGGER validate_runner_job_trg
BEFORE INSERT OR UPDATE ON public.runner_jobs
FOR EACH ROW EXECUTE FUNCTION public.validate_runner_job();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('runner-job-media', 'runner-job-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: customer (owner) and assigned runner can access job folder
DROP POLICY IF EXISTS "Runner job media read" ON storage.objects;
CREATE POLICY "Runner job media read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'runner-job-media'
  AND EXISTS (
    SELECT 1 FROM public.runner_jobs rj
    WHERE rj.id::text = (storage.foldername(name))[1]
      AND (rj.customer_id = auth.uid() OR rj.runner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Runner job media upload" ON storage.objects;
CREATE POLICY "Runner job media upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'runner-job-media'
  AND EXISTS (
    SELECT 1 FROM public.runner_jobs rj
    WHERE rj.id::text = (storage.foldername(name))[1]
      AND (rj.customer_id = auth.uid() OR rj.runner_id = auth.uid())
  )
);

-- Enable RLS
ALTER TABLE public.runner_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runner_wallet_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runner_fraud_flags ENABLE ROW LEVEL SECURITY;

-- runner_jobs policies
CREATE POLICY "Customer can view own runner jobs"
ON public.runner_jobs FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Assigned runner can view job"
ON public.runner_jobs FOR SELECT
USING (auth.uid() = runner_id);

CREATE POLICY "Available runners can view pending jobs"
ON public.runner_jobs FOR SELECT
USING (
  status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.driver_profiles dp
    WHERE dp.user_id = auth.uid() AND dp.is_available = true
  )
);

CREATE POLICY "Customer creates own runner job"
ON public.runner_jobs FOR INSERT
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customer updates own runner job"
ON public.runner_jobs FOR UPDATE
USING (auth.uid() = customer_id);

CREATE POLICY "Assigned runner updates job"
ON public.runner_jobs FOR UPDATE
USING (auth.uid() = runner_id);

-- runner_wallet_holds policies
CREATE POLICY "User views own holds"
ON public.runner_wallet_holds FOR SELECT
USING (auth.uid() = user_id);

-- runner_fraud_flags: read by the runner themselves only (admin uses service role)
CREATE POLICY "Runner views own flags"
ON public.runner_fraud_flags FOR SELECT
USING (auth.uid() = runner_id);
