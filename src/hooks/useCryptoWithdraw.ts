import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CryptoWithdrawal {
  id: string;
  network: string;
  destination_address: string;
  destination_tag: number | null;
  asset: string;
  amount_jvc: number;
  fee_usd: number;
  status: string;
  tx_hash: string | null;
  failure_reason: string | null;
  requires_manual_review: boolean;
  created_at: string;
  confirmed_at: string | null;
}

export function useCryptoWithdraw() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CryptoWithdrawal[]>([]);
  const [available, setAvailable] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase
      .from("crypto_withdrawals" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory((data as unknown as CryptoWithdrawal[]) ?? []);
  }, []);

  const fetchAvailable = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.rpc("crypto_available_balance" as any, {
      _user_id: u.user.id,
    });
    if (typeof data === "number") setAvailable(data);
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchAvailable();
  }, [fetchHistory, fetchAvailable]);

  const requestWithdrawal = useCallback(async (params: {
    destination_address: string;
    destination_tag?: number | null;
    asset: "XRP" | "RLUSD";
    amount_jvc: number;
    pin_verified: boolean;
  }) => {
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "xrpl-request-withdrawal",
        { body: params }
      );
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      await fetchHistory();
      await fetchAvailable();
      return data as { withdrawal_id: string; status: string; message: string; fee_usd: number };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      throw new Error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [fetchHistory, fetchAvailable]);

  return { requestWithdrawal, submitting, error, history, available, refetch: fetchHistory };
}
