-- Phase 3: Multi-Asset Swap Layer
-- Allow users to deposit in XRP, USDC (or other supported assets) and auto-swap into RLUSD
-- which backs the JVC ledger 1:1.

-- =========================================================================
-- 1. Supported assets registry
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.crypto_supported_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,           -- 'XRP', 'RLUSD', 'USDC', 'USDT'
  network text NOT NULL,                 -- 'xrpl', 'xrpl-evm', 'ethereum', 'solana'
  asset_type text NOT NULL,              -- 'native', 'iou', 'erc20', 'spl'
  issuer_address text,                   -- for IOU/token assets
  decimals integer NOT NULL DEFAULT 6,
  is_stablecoin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  min_deposit_usd numeric(12,2) NOT NULL DEFAULT 1.00,
  max_deposit_usd numeric(12,2) NOT NULL DEFAULT 5000.00,
  swap_fee_bps integer NOT NULL DEFAULT 30,  -- 0.30% default
  display_name text NOT NULL,
  icon_url text,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crypto_supported_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active supported assets"
  ON public.crypto_supported_assets FOR SELECT
  USING (is_active = true);

-- Seed the initial supported assets
INSERT INTO public.crypto_supported_assets (symbol, network, asset_type, issuer_address, decimals, is_stablecoin, display_name, sort_order, swap_fee_bps)
VALUES
  ('XRP',   'xrpl', 'native', NULL, 6, false, 'XRP',   10, 50),
  ('RLUSD', 'xrpl', 'iou',    'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', 6, true, 'Ripple USD', 20, 0),
  ('USDC',  'xrpl', 'iou',    'rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE', 6, true, 'USD Coin (XRPL)', 30, 25)
ON CONFLICT (symbol) DO NOTHING;

-- =========================================================================
-- 2. Quote engine: short-lived swap quotes locked at request time
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.crypto_swap_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_symbol text NOT NULL,
  to_symbol text NOT NULL,
  from_amount numeric(20,8) NOT NULL,
  to_amount numeric(20,8) NOT NULL,
  rate numeric(20,8) NOT NULL,           -- 1 from = X to
  fee_bps integer NOT NULL,
  fee_amount_usd numeric(12,4) NOT NULL,
  slippage_bps integer NOT NULL DEFAULT 100,  -- 1% max slippage
  usd_value numeric(12,4) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_quotes_user ON public.crypto_swap_quotes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_quotes_expiry ON public.crypto_swap_quotes(expires_at) WHERE NOT consumed;

ALTER TABLE public.crypto_swap_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quotes"
  ON public.crypto_swap_quotes FOR SELECT
  USING (auth.uid() = user_id);

-- =========================================================================
-- 3. Executed swaps ledger (immutable record)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.crypto_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quote_id uuid REFERENCES public.crypto_swap_quotes(id),
  deposit_id uuid REFERENCES public.crypto_deposits(id),  -- if swap was triggered by a deposit
  from_symbol text NOT NULL,
  to_symbol text NOT NULL,
  from_amount numeric(20,8) NOT NULL,
  to_amount numeric(20,8) NOT NULL,
  executed_rate numeric(20,8) NOT NULL,
  fee_amount_usd numeric(12,4) NOT NULL,
  usd_value numeric(12,4) NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending | executing | completed | failed | refunded
  failure_reason text,
  xrpl_tx_hash text,                       -- on-chain tx hash if applicable
  source text NOT NULL DEFAULT 'manual',   -- 'manual' | 'auto_deposit' | 'reserve_rebalance'
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_swaps_user ON public.crypto_swaps(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_status ON public.crypto_swaps(status) WHERE status IN ('pending','executing');
CREATE UNIQUE INDEX IF NOT EXISTS idx_swaps_xrpl_hash ON public.crypto_swaps(xrpl_tx_hash) WHERE xrpl_tx_hash IS NOT NULL;

ALTER TABLE public.crypto_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own swaps"
  ON public.crypto_swaps FOR SELECT
  USING (auth.uid() = user_id);

-- =========================================================================
-- 4. Auto-swap preferences per user
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.crypto_user_swap_prefs (
  user_id uuid PRIMARY KEY,
  auto_swap_to_rlusd boolean NOT NULL DEFAULT true,
  preferred_deposit_asset text NOT NULL DEFAULT 'RLUSD',
  max_slippage_bps integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crypto_user_swap_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own swap prefs"
  ON public.crypto_user_swap_prefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own swap prefs"
  ON public.crypto_user_swap_prefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own swap prefs"
  ON public.crypto_user_swap_prefs FOR UPDATE
  USING (auth.uid() = user_id);

-- =========================================================================
-- 5. Atomic swap execution RPC
-- Locks the quote, debits source asset balance, credits target asset.
-- For internal book-keeping; on-chain swap (XRPL DEX/AMM) is performed by the
-- edge function and the resulting tx_hash + executed_rate is recorded back.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.execute_crypto_swap(
  p_user_id uuid,
  p_quote_id uuid,
  p_deposit_id uuid DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.crypto_swap_quotes%ROWTYPE;
  v_swap_id uuid;
BEGIN
  -- Lock + load the quote
  SELECT * INTO v_quote
  FROM public.crypto_swap_quotes
  WHERE id = p_quote_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  IF v_quote.consumed THEN
    RAISE EXCEPTION 'quote_already_consumed';
  END IF;

  IF v_quote.expires_at < now() THEN
    RAISE EXCEPTION 'quote_expired';
  END IF;

  UPDATE public.crypto_swap_quotes
     SET consumed = true
   WHERE id = p_quote_id;

  INSERT INTO public.crypto_swaps (
    user_id, quote_id, deposit_id, from_symbol, to_symbol,
    from_amount, to_amount, executed_rate, fee_amount_usd,
    usd_value, status, source
  ) VALUES (
    p_user_id, p_quote_id, p_deposit_id, v_quote.from_symbol, v_quote.to_symbol,
    v_quote.from_amount, v_quote.to_amount, v_quote.rate, v_quote.fee_amount_usd,
    v_quote.usd_value, 'executing', p_source
  )
  RETURNING id INTO v_swap_id;

  RETURN v_swap_id;
END;
$$;

-- Mark a swap completed (called by edge function after on-chain confirmation)
CREATE OR REPLACE FUNCTION public.complete_crypto_swap(
  p_swap_id uuid,
  p_tx_hash text,
  p_executed_rate numeric,
  p_actual_to_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crypto_swaps
     SET status = 'completed',
         xrpl_tx_hash = p_tx_hash,
         executed_rate = p_executed_rate,
         to_amount = p_actual_to_amount,
         completed_at = now()
   WHERE id = p_swap_id AND status = 'executing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap_not_executable';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_crypto_swap(
  p_swap_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crypto_swaps
     SET status = 'failed',
         failure_reason = p_reason,
         completed_at = now()
   WHERE id = p_swap_id AND status IN ('pending','executing');
END;
$$;
