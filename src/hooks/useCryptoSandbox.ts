import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface CryptoSandboxBalance {
  balance_usd: number;
  total_granted_usd: number;
  total_spent_usd: number;
  is_locked: boolean;
  locked_at: string | null;
  locked_reason: string | null;
}

export interface CryptoSandboxGrant {
  id: string;
  venue_id: string | null;
  amount_usd: number;
  kind: 'venue_grant' | 'self_simulated';
  note: string | null;
  created_at: string;
}

export const useCryptoSandbox = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<CryptoSandboxBalance | null>(null);
  const [grants, setGrants] = useState<CryptoSandboxGrant[]>([]);
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: bal }, { data: grantRows }, { data: invites }, { count: realDepositCount }] = await Promise.all([
      (supabase as any).from('crypto_sandbox_balances').select('*').eq('user_id', user.id).maybeSingle(),
      (supabase as any).from('crypto_sandbox_grants').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      (supabase as any).from('venue_test_invites').select('venue_id, status, venues:venue_id(venue_status)').eq('invited_user_id', user.id).eq('status', 'accepted'),
      (supabase as any).from('crypto_deposits').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['credited', 'pending']),
    ]);
    setBalance(bal ?? { balance_usd: 0, total_granted_usd: 0, total_spent_usd: 0, is_locked: false, locked_at: null, locked_reason: null });
    setGrants((grantRows ?? []) as CryptoSandboxGrant[]);
    const hasActiveInvite = (invites ?? []).some((i: any) => (i.venues?.venue_status ?? 'testing') === 'testing');
    const hasNoRealDeposit = (realDepositCount ?? 0) === 0;
    // Eligible if: (a) active venue tester, OR (b) end-user with zero real crypto deposits — and not locked.
    setEligible((hasActiveInvite || hasNoRealDeposit) && !(bal?.is_locked));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const channel = supabase
      .channel(createRealtimeChannelTopic(`crypto-sandbox-${user.id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crypto_sandbox_balances', filter: `user_id=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crypto_sandbox_grants', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  const simulateDeposit = useCallback(async (amountUsd: number) => {
    const { data, error } = await (supabase as any).rpc('simulate_crypto_sandbox_deposit', { _amount_usd: amountUsd });
    if (error || !data?.success) {
      toast({ title: 'Sandbox deposit failed', description: data?.error ?? error?.message ?? 'Unknown error', variant: 'destructive' });
      return false;
    }
    toast({ title: 'Sandbox funds added', description: `+ $${amountUsd.toFixed(2)} test balance` });
    refresh();
    return true;
  }, [refresh]);

  return { balance, grants, eligible, loading, refresh, simulateDeposit };
};
