import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TreasuryHealth {
  total_jvc_outstanding: number;
  total_rlusd_reserves: number;
  pending_deposits_usd: number;
  pending_withdrawals_usd: number;
  pending_offramps_usd: number;
}

export interface DailyFlow {
  day: string;
  deposits_usd: number;
  withdrawals_usd: number;
  swaps_usd: number;
  offramps_usd: number;
}

export interface ReconRun {
  id: string;
  run_at: string;
  total_jvc_outstanding: number;
  total_rlusd_reserves: number;
  health_ratio: number;
  surplus_usd: number;
  status: "healthy" | "warning" | "critical" | "error";
}

export interface TreasuryAlert {
  id: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export function useTreasury() {
  const [health, setHealth] = useState<TreasuryHealth | null>(null);
  const [flows, setFlows] = useState<DailyFlow[]>([]);
  const [runs, setRuns] = useState<ReconRun[]>([]);
  const [alerts, setAlerts] = useState<TreasuryAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [h, f, r, a] = await Promise.all([
      supabase.from("v_treasury_health").select("*").maybeSingle(),
      supabase.from("v_treasury_daily_flows").select("*").order("day"),
      supabase.from("treasury_reconciliation_runs").select("*").order("run_at", { ascending: false }).limit(20),
      supabase.from("treasury_alerts").select("*").eq("acknowledged", false).order("created_at", { ascending: false }).limit(20),
    ]);
    setHealth((h.data as TreasuryHealth) ?? null);
    setFlows((f.data as DailyFlow[]) ?? []);
    setRuns((r.data as ReconRun[]) ?? []);
    setAlerts((a.data as TreasuryAlert[]) ?? []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runReconciliation = useCallback(async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("run_treasury_reconciliation");
      if (error) throw error;
      await refresh();
    } finally { setLoading(false); }
  }, [refresh]);

  const acknowledgeAlert = useCallback(async (id: string) => {
    await supabase.from("treasury_alerts").update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    }).eq("id", id);
    await refresh();
  }, [refresh]);

  return { health, flows, runs, alerts, loading, refresh, runReconciliation, acknowledgeAlert };
}
