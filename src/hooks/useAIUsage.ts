import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AIUsageInfo {
  remainingTokens: number;
  plan: 'free' | 'plus' | 'pro';
  dailyUsed: number;
  dailyLimit: number;
  isUnlimited: boolean;
  percentUsed: number;
}

export function useAIUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<AIUsageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!user) {
      setUsage(null);
      return;
    }

    setIsLoading(true);
    try {
      // Get current daily usage
      const today = new Date().toISOString().split('T')[0];
      
      const { data: usageData } = await supabase
        .from('ai_usage')
        .select('*')
        .eq('user_id', user.id)
        .eq('period_type', 'daily')
        .eq('period_start', today)
        .single();

      // Get subscription info
      const { data: subscription } = await supabase
        .from('ai_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Get limits for user's plan
      const plan = subscription?.plan || 'free';
      const { data: limits } = await supabase
        .from('ai_token_limits')
        .select('*')
        .eq('plan', plan)
        .single();

      const dailyUsed = (usageData?.discovery_tokens_used || 0) + (usageData?.general_tokens_used || 0);
      const dailyLimit = (limits?.daily_discovery_limit || 5000) + (limits?.daily_general_limit || 0);
      const isUnlimited = dailyLimit < 0;
      
      setUsage({
        remainingTokens: isUnlimited ? -1 : Math.max(0, dailyLimit - dailyUsed),
        plan: plan as 'free' | 'plus' | 'pro',
        dailyUsed,
        dailyLimit: isUnlimited ? -1 : dailyLimit,
        isUnlimited,
        percentUsed: isUnlimited ? 0 : Math.min(100, (dailyUsed / dailyLimit) * 100),
      });
    } catch (error) {
      console.error('Error fetching AI usage:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return { usage, isLoading, refetch: fetchUsage };
}
