import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SupportedAsset {
  id: string;
  symbol: string;
  network: string;
  display_name: string;
  is_stablecoin: boolean;
  decimals: number;
  swap_fee_bps: number;
  min_deposit_usd: number;
  max_deposit_usd: number;
  sort_order: number;
}

export interface SwapQuote {
  id: string;
  from_symbol: string;
  to_symbol: string;
  from_amount: number;
  to_amount: number;
  rate: number;
  fee_bps: number;
  fee_amount_usd: number;
  usd_value: number;
  expires_at: string;
}

export interface SwapRecord {
  id: string;
  from_symbol: string;
  to_symbol: string;
  from_amount: number;
  to_amount: number;
  status: string;
  xrpl_tx_hash: string | null;
  source: string;
  created_at: string;
  completed_at: string | null;
}

export function useCryptoSwap() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<SupportedAsset[]>([]);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [history, setHistory] = useState<SwapRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAssets = useCallback(async () => {
    const { data } = await supabase
      .from("crypto_supported_assets")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (data) setAssets(data as SupportedAsset[]);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("crypto_swaps")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setHistory(data as SwapRecord[]);
  }, [user]);

  useEffect(() => {
    loadAssets();
    loadHistory();
  }, [loadAssets, loadHistory]);

  const getQuote = useCallback(async (from_symbol: string, to_symbol: string, from_amount: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("xrpl-quote-swap", {
        body: { from_symbol, to_symbol, from_amount },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setQuote(data.quote as SwapQuote);
      return data.quote as SwapQuote;
    } finally {
      setLoading(false);
    }
  }, []);

  const executeSwap = useCallback(async (quote_id: string, source: string = "manual") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("xrpl-execute-swap", {
        body: { quote_id, source },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setQuote(null);
      await loadHistory();
      return data;
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  return { assets, quote, history, loading, getQuote, executeSwap, refresh: loadHistory };
}
