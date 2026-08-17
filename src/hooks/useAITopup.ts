import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useJVCoinWallet } from '@/hooks/useJVCoinWallet';

// Token packages available for purchase
export const TOKEN_PACKAGES = [
  { tokens: 10000, priceJVC: 5, priceUSD: 0.99, label: '10K tokens' },
  { tokens: 50000, priceJVC: 20, priceUSD: 3.99, label: '50K tokens' },
  { tokens: 200000, priceJVC: 70, priceUSD: 12.99, label: '200K tokens' },
  { tokens: 1000000, priceJVC: 300, priceUSD: 49.99, label: '1M tokens' },
] as const;

export function useAITopup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { balance, fetchBalance } = useJVCoinWallet();
  const [isProcessing, setIsProcessing] = useState(false);

  const purchaseWithWallet = useCallback(async (packageIndex: number) => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to purchase AI tokens",
        variant: "destructive",
      });
      return false;
    }

    const pkg = TOKEN_PACKAGES[packageIndex];
    if (!pkg) return false;

    if (balance.jvc < pkg.priceJVC) {
      toast({
        title: "Insufficient balance",
        description: `You need ${pkg.priceJVC} JVC to purchase this package. Please deposit more funds.`,
        variant: "destructive",
      });
      return false;
    }

    setIsProcessing(true);
    try {
      // Create topup record
      const { data: topup, error: topupError } = await supabase
        .from('ai_topups')
        .insert({
          user_id: user.id,
          tokens_purchased: pkg.tokens,
          amount_jvc: pkg.priceJVC,
          amount_usd: pkg.priceUSD,
          payment_method: 'wallet',
          status: 'pending',
        })
        .select()
        .single();

      if (topupError) throw topupError;

      // Deduct from wallet (using transfer-jvc function)
      const { error: transferError } = await supabase.functions.invoke('transfer-jvc', {
        body: {
          to_user_id: null, // Platform wallet
          amount: pkg.priceJVC,
          description: `AI Token Purchase: ${pkg.label}`,
          platform_fee: 0,
        },
      });

      if (transferError) {
        // Mark topup as failed
        await supabase
          .from('ai_topups')
          .update({ status: 'failed' })
          .eq('id', topup.id);
        throw transferError;
      }

      // Add tokens to subscription
      const { data: existingSub } = await supabase
        .from('ai_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (existingSub) {
        await supabase
          .from('ai_subscriptions')
          .update({
            tokens_purchased: (existingSub.tokens_purchased || 0) + pkg.tokens,
            tokens_remaining: (existingSub.tokens_remaining || 0) + pkg.tokens,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('ai_subscriptions')
          .insert({
            user_id: user.id,
            plan: 'free',
            tokens_purchased: pkg.tokens,
            tokens_remaining: pkg.tokens,
          });
      }

      // Mark topup as completed
      await supabase
        .from('ai_topups')
        .update({ status: 'completed' })
        .eq('id', topup.id);

      await fetchBalance();

      toast({
        title: "Tokens purchased!",
        description: `You now have ${pkg.tokens.toLocaleString()} additional AI tokens.`,
      });

      return true;
    } catch (error) {
      console.error('AI topup error:', error);
      toast({
        title: "Purchase failed",
        description: "Unable to complete the purchase. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [user, balance, toast, fetchBalance]);

  return {
    packages: TOKEN_PACKAGES,
    purchaseWithWallet,
    isProcessing,
    walletBalance: balance.jvc,
  };
}
