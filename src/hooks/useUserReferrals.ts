import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Referral {
  id: string;
  referral_code_id: string;
  referrer_type: 'user' | 'venue';
  referrer_id: string;
  referred_venue_id: string | null;
  status: 'pending' | 'qualified' | 'rewarded' | 'expired' | 'rejected';
  qualified_at: string | null;
  rewarded_at: string | null;
  expires_at: string;
  metadata: Record<string, any>;
  created_at: string;
}

interface ReferralReward {
  id: string;
  referral_id: string;
  reward_type: 'one_time_credit' | 'monthly_residual';
  amount_cents: number;
  currency: string;
  status: 'pending' | 'issued' | 'void';
  issued_to_type: 'user' | 'venue';
  issued_to_id: string;
  period_month: string | null;
  issued_at: string | null;
  created_at: string;
}

interface ReferralStats {
  pending: number;
  qualified: number;
  rewarded: number;
  expired: number;
  totalEarnedCents: number;
  pendingCents: number;
  totalResidualCents: number;
  residualPayments: number;
}

export const useUserReferrals = () => {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [stats, setStats] = useState<ReferralStats>({
    pending: 0,
    qualified: 0,
    rewarded: 0,
    expired: 0,
    totalEarnedCents: 0,
    pendingCents: 0,
    totalResidualCents: 0,
    residualPayments: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchReferrals = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch referrals
      const { data: referralsData, error: referralsError } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_type', 'user')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (referralsError) {
        console.error('Error fetching referrals:', referralsError);
      } else {
        setReferrals((referralsData || []) as Referral[]);
      }

      // Fetch rewards
      const { data: rewardsData, error: rewardsError } = await supabase
        .from('referral_rewards')
        .select('*')
        .eq('issued_to_type', 'user')
        .eq('issued_to_id', user.id)
        .order('created_at', { ascending: false });

      if (rewardsError) {
        console.error('Error fetching rewards:', rewardsError);
      } else {
        setRewards((rewardsData || []) as ReferralReward[]);
      }

      // Calculate stats
      const refs = (referralsData || []) as Referral[];
      const rews = (rewardsData || []) as ReferralReward[];
      
      const pending = refs.filter(r => r.status === 'pending').length;
      const qualified = refs.filter(r => r.status === 'qualified').length;
      const rewarded = refs.filter(r => r.status === 'rewarded').length;
      const expired = refs.filter(r => r.status === 'expired').length;
      
      const oneTimeRewards = rews.filter(r => r.reward_type === 'one_time_credit');
      const residualRewards = rews.filter(r => r.reward_type === 'monthly_residual');
      
      const totalEarnedCents = rews
        .filter(r => r.status === 'issued')
        .reduce((sum, r) => sum + r.amount_cents, 0);
      
      const pendingCents = rews
        .filter(r => r.status === 'pending')
        .reduce((sum, r) => sum + r.amount_cents, 0);
      
      const totalResidualCents = residualRewards
        .filter(r => r.status === 'issued')
        .reduce((sum, r) => sum + r.amount_cents, 0);

      setStats({
        pending,
        qualified,
        rewarded,
        expired,
        totalEarnedCents,
        pendingCents,
        totalResidualCents,
        residualPayments: residualRewards.filter(r => r.status === 'issued').length
      });

    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  return {
    referrals,
    rewards,
    stats,
    loading,
    refetch: fetchReferrals
  };
};
