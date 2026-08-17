CREATE TABLE IF NOT EXISTS public.treasury_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  total_jvc_outstanding numeric(20,4) NOT NULL,
  total_rlusd_reserves numeric(20,4) NOT NULL,
  total_pending_deposits_usd numeric(20,4) NOT NULL DEFAULT 0,
  total_pending_withdrawals_usd numeric(20,4) NOT NULL DEFAULT 0,
  health_ratio numeric(8,4) NOT NULL,
  surplus_usd numeric(20,4) NOT NULL,
  status text NOT NULL,
  notes text,
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_recon_runs_time ON public.treasury_reconciliation_runs(run_at DESC);
ALTER TABLE public.treasury_reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view recon runs" ON public.treasury_reconciliation_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.treasury_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_alerts_open
  ON public.treasury_alerts(created_at DESC) WHERE acknowledged = false;
ALTER TABLE public.treasury_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view alerts" ON public.treasury_alerts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins ack alerts" ON public.treasury_alerts FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.v_treasury_health AS
SELECT
  COALESCE((SELECT SUM(total_jvc_minted_from_crypto) FROM public.crypto_reserve_state), 0) AS total_jvc_outstanding,
  COALESCE((SELECT SUM(total_rlusd_reserve) FROM public.crypto_reserve_state), 0)          AS total_rlusd_reserves,
  COALESCE((SELECT SUM(usd_value_at_receipt) FROM public.crypto_deposits
              WHERE status = 'pending'), 0)                                                AS pending_deposits_usd,
  COALESCE((SELECT SUM(amount_jvc) FROM public.crypto_withdrawals
              WHERE status IN ('pending','processing')), 0)                                AS pending_withdrawals_usd,
  COALESCE((SELECT SUM(source_amount) FROM public.bridge_transfers
              WHERE status IN ('pending','processing') AND direction = 'offramp'), 0)      AS pending_offramps_usd;

CREATE OR REPLACE VIEW public.v_treasury_daily_flows AS
SELECT d::date AS day,
  COALESCE((SELECT SUM(usd_value_at_receipt) FROM public.crypto_deposits
              WHERE detected_at::date = d::date AND status = 'completed'), 0) AS deposits_usd,
  COALESCE((SELECT SUM(amount_jvc) FROM public.crypto_withdrawals
              WHERE created_at::date = d::date AND status = 'completed'), 0)  AS withdrawals_usd,
  COALESCE((SELECT SUM(usd_value) FROM public.crypto_swaps
              WHERE created_at::date = d::date AND status = 'completed'), 0)  AS swaps_usd,
  COALESCE((SELECT SUM(source_amount) FROM public.bridge_transfers
              WHERE created_at::date = d::date AND status = 'completed'), 0)  AS offramps_usd
FROM generate_series(now() - interval '29 days', now(), interval '1 day') d;

CREATE OR REPLACE FUNCTION public.run_treasury_reconciliation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_jvc numeric(20,4); v_rlusd numeric(20,4);
  v_pending_dep numeric(20,4); v_pending_wd numeric(20,4); v_pending_offramp numeric(20,4);
  v_ratio numeric(8,4); v_surplus numeric(20,4); v_status text; v_run_id uuid;
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT total_jvc_outstanding, total_rlusd_reserves,
         pending_deposits_usd, pending_withdrawals_usd, pending_offramps_usd
    INTO v_jvc, v_rlusd, v_pending_dep, v_pending_wd, v_pending_offramp
  FROM public.v_treasury_health;

  v_jvc := COALESCE(v_jvc, 0); v_rlusd := COALESCE(v_rlusd, 0);
  v_surplus := v_rlusd - v_jvc;
  v_ratio := CASE WHEN v_jvc > 0 THEN v_rlusd / v_jvc ELSE 9999 END;
  v_status := CASE WHEN v_ratio < 1.00 THEN 'critical'
                   WHEN v_ratio < 1.05 THEN 'warning'
                   ELSE 'healthy' END;

  INSERT INTO public.treasury_reconciliation_runs (
    total_jvc_outstanding, total_rlusd_reserves,
    total_pending_deposits_usd, total_pending_withdrawals_usd,
    health_ratio, surplus_usd, status, created_by
  ) VALUES (
    v_jvc, v_rlusd, v_pending_dep, v_pending_wd + v_pending_offramp,
    v_ratio, v_surplus, v_status, v_caller
  ) RETURNING id INTO v_run_id;

  IF v_status = 'critical' THEN
    INSERT INTO public.treasury_alerts (alert_type, severity, message, payload)
    VALUES ('shortfall', 'critical',
            format('Reserve shortfall: ratio %s, surplus %s USD', v_ratio, v_surplus),
            jsonb_build_object('run_id', v_run_id, 'ratio', v_ratio, 'surplus', v_surplus));
  ELSIF v_status = 'warning' THEN
    INSERT INTO public.treasury_alerts (alert_type, severity, message, payload)
    VALUES ('low_reserves', 'warning',
            format('Reserve buffer thin: ratio %s', v_ratio),
            jsonb_build_object('run_id', v_run_id, 'ratio', v_ratio));
  END IF;

  RETURN v_run_id;
END;
$$;

GRANT SELECT ON public.v_treasury_health TO authenticated;
GRANT SELECT ON public.v_treasury_daily_flows TO authenticated;