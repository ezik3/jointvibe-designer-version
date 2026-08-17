import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface WalletTransaction {
  id: string;
  transaction_type: string;
  amount_jvc: number;
  amount_usd: number;
  fee_amount: number;
  status: string;
  description: string | null;
  created_at: string;
  from_wallet_id?: string | null;
  to_wallet_id?: string | null;
  from_wallet_type: string | null;
  to_wallet_type: string | null;
}

interface UseWalletTransactionsOptions {
  venueId?: string;
  limit?: number;
}

export function useWalletTransactions({ venueId, limit = 100 }: UseWalletTransactionsOptions = {}) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let query = supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      query = venueId
        ? query.or(`from_wallet_id.eq.${venueId},to_wallet_id.eq.${venueId}`)
        : query.or(`from_wallet_id.eq.${user.id},to_wallet_id.eq.${user.id}`);

      const { data, error } = await query;
      if (error) throw error;

      let merged = (data || []) as WalletTransaction[];

      // User-only test deposits are part of the same wallet activity feed.
      if (!venueId) {
        const { data: grants } = await supabase
          .from("crypto_sandbox_grants")
          .select("id, amount_usd, created_at, kind")
          .eq("user_id", user.id)
          .eq("kind", "self_simulated")
          .order("created_at", { ascending: false })
          .limit(20);

        const simulatedTransactions: WalletTransaction[] = (grants || []).map((grant) => ({
          id: `sandbox-${grant.id}`,
          transaction_type: "deposit",
          amount_jvc: Number(grant.amount_usd),
          amount_usd: Number(grant.amount_usd),
          fee_amount: 0,
          status: "completed",
          description: "Simulated crypto deposit (test funds)",
          created_at: grant.created_at,
          from_wallet_type: null,
          to_wallet_type: "user",
        }));

        merged = [...merged, ...simulatedTransactions]
          .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
          .slice(0, Math.min(limit, 20));
      }

      setTransactions(merged);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [limit, user, venueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { transactions, loading, refresh };
}
