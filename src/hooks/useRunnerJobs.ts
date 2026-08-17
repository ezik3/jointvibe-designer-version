import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';

export type RunnerPriceTier = 'quick' | 'standard' | 'priority';
export type RunnerJobStatus =
  | 'pending'
  | 'accepted'
  | 'at_store'
  | 'awaiting_approval'
  | 'approved'
  | 'purchased'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'disputed';

export interface RunnerCartItem {
  name: string;
  est_price: number;
}

export interface RunnerJob {
  id: string;
  customer_id: string;
  runner_id: string | null;
  status: RunnerJobStatus;
  task_description: string;
  pickup_address: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_address: string;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  price_tier: RunnerPriceTier;
  runner_fee_usd: number;
  tip_usd: number;
  est_item_cost_usd: number;
  distance_surcharge_usd?: number;
  platform_fee_usd?: number;
  buffer_pct: number;
  held_amount_usd: number;
  approved_total_usd: number | null;
  final_item_cost_usd: number | null;
  cart_preview_json: RunnerCartItem[] | null;
  purchase_proof_urls: string[];
  dropoff_proof_urls: string[];
  cancel_reason: string | null;
  approval_requested_at: string | null;
  approved_at: string | null;
  accepted_at: string | null;
  purchased_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  dispute_window_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

// Tier → fee
// Standard is the cheapest "best effort" pickup; Quick is faster (mid price);
// Priority is top-of-queue (most expensive). Display order in the UI is
// Standard → Quick → Priority.
export const RUNNER_TIER_FEES: Record<RunnerPriceTier, number> = {
  standard: 3,
  quick: 6,
  priority: 10,
};

export const RUNNER_OUT_OF_POCKET_CAP = 50;
export const RUNNER_BUFFER_PCT = 25;
export const RUNNER_TOLERANCE = 0.5;
export const RUNNER_PLATFORM_FEE_USD = 0.1;

/**
 * Distance surcharge ($) added to the runner fee when the trip exceeds the
 * Runner-tier short-walk range (~0.5 km). The base price tier (Quick / Standard
 * / Priority) controls *priority*; this surcharge controls *distance pay*.
 *
 * 0–0.5 km   → $0   (Runner)
 * 0.5–3 km   → $2   (bike)
 * 3–10 km    → $5   (moto)
 * 10–20 km   → $10  (car)
 * 20–50 km   → $15  (long-haul car)
 * ≥ 50 km    → block at the UI layer
 */
export const RUNNER_MAX_TRIP_KM = 50;

export function calcDistanceSurcharge(tripKm: number): number {
  if (!Number.isFinite(tripKm) || tripKm <= 0.5) return 0;
  if (tripKm <= 3) return 2;
  if (tripKm <= 10) return 5;
  if (tripKm <= 20) return 10;
  if (tripKm <= RUNNER_MAX_TRIP_KM) return 15;
  return 15;
}

export function calcHeldAmount(
  estItemCost: number,
  tier: RunnerPriceTier,
  tip: number,
  distanceSurcharge = 0,
  platformFee = RUNNER_PLATFORM_FEE_USD,
): number {
  const fee = RUNNER_TIER_FEES[tier];
  const buffer = estItemCost * (RUNNER_BUFFER_PCT / 100);
  return (
    Math.round((estItemCost + fee + distanceSurcharge + tip + buffer + platformFee) * 100) / 100
  );
}

export function calcRunnerSpendableWallet(balance?: {
  usd?: number;
  subsidyBalance?: number;
  spendablePending?: number;
  totalSpendable?: number;
} | null): number {
  const total = Number(balance?.totalSpendable ?? NaN);
  if (Number.isFinite(total) && total > 0) return total;
  const visible = Number(balance?.usd ?? 0);
  const subsidy = Number(balance?.subsidyBalance ?? 0);
  const pending = Number(balance?.spendablePending ?? 0);
  return Math.max(visible, visible + subsidy + pending);
}

export function useRunnerJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<RunnerJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('runner_jobs' as any)
      .select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setJobs((data ?? []) as unknown as RunnerJob[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Realtime updates for own jobs
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(createRealtimeChannelTopic(`runner_jobs_customer_${user.id}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'runner_jobs', filter: `customer_id=eq.${user.id}` },
        () => fetchJobs(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchJobs]);

  const createJob = useCallback(
    async (input: {
      task_description: string;
      pickup_address?: string;
      pickup_latitude?: number;
      pickup_longitude?: number;
      pickup_venue_id?: string;
      dropoff_address: string;
      dropoff_latitude?: number;
      dropoff_longitude?: number;
      price_tier: RunnerPriceTier;
      est_item_cost_usd: number;
      tip_usd?: number;
      distance_surcharge_usd?: number;
      platform_fee_usd?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-runner-job', {
        body: input,
      });
      if (error) {
        // Surface the real server error message instead of the generic
        // "Edge Function returned a non-2xx status code".
        let msg = (error as any)?.message ?? 'Failed to create runner job';
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) {
              msg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
            }
          }
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      await fetchJobs();
      return data as { job_id: string };
    },
    [fetchJobs],
  );

  const approveCart = useCallback(
    async (jobId: string, approvedTotal: number) => {
      const { error } = await supabase.functions.invoke('approve-runner-cart', {
        body: { job_id: jobId, approved_total_usd: approvedTotal },
      });
      if (error) throw error;
      await fetchJobs();
    },
    [fetchJobs],
  );

  const cancelJob = useCallback(
    async (jobId: string, reason: string) => {
      const { error } = await supabase.functions.invoke('cancel-runner-job', {
        body: { job_id: jobId, reason, by: 'customer' },
      });
      if (error) throw error;
      await fetchJobs();
    },
    [fetchJobs],
  );

  const confirmDelivery = useCallback(
    async (jobId: string) => {
      const { error } = await supabase.functions.invoke('settle-runner-job', {
        body: { job_id: jobId, action: 'confirm' },
      });
      if (error) throw error;
      await fetchJobs();
    },
    [fetchJobs],
  );

  return { jobs, loading, fetchJobs, createJob, approveCart, cancelJob, confirmDelivery };
}
