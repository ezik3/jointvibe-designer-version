import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannelTopic } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';

export interface CryptoDepositAddress {
  network: string;
  address: string;
  destination_tag: number;
  memo: string;
}

export interface CryptoDeposit {
  id: string;
  asset_received: string;
  amount_received: number;
  usd_value_at_receipt: number;
  jvc_credited: number;
  status: string;
  pending_until: string | null;
  detected_at: string;
  tx_hash: string;
}

export const useCryptoDeposit = () => {
  const { user } = useAuth();
  const [address, setAddress] = useState<CryptoDepositAddress | null>(null);
  const [deposits, setDeposits] = useState<CryptoDeposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAddress = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('xrpl-get-deposit-address');
      if (error) throw error;
      setAddress(data as CryptoDepositAddress);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load deposit address');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchDeposits = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('crypto_deposits')
      .select('*')
      .eq('user_id', user.id)
      .order('detected_at', { ascending: false })
      .limit(20);
    if (data) setDeposits(data as CryptoDeposit[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchAddress();
    fetchDeposits();

    const channel = supabase
      .channel(createRealtimeChannelTopic(`crypto-deposits-${user.id}`))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'crypto_deposits',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchDeposits())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAddress, fetchDeposits]);

  return { address, deposits, loading, error, refresh: fetchDeposits };
};
