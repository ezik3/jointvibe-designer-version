import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { SIMULATION_MODE, SIMULATION_DELAY_MS } from '@/config/paymentConfig';
import { useSimulatedPayments, readSimulatedWalletSnapshot } from '@/hooks/useSimulatedPayments';
 import { 
   getUserBalances, 
   determinePaymentRail, 
   checkSubsidyEligibility,
   calculateDepositSubsidy,
   calculatePendingUntil,
   type WalletBalances 
 } from '@/services/paymentRailRouter';
 import { getPaymentRailForCountry } from '@/config/countryRouting';
 import { PENDING_BALANCE_SPEND_LIMIT, calculateSpendablePending } from '@/config/subsidyConfig';

// Transaction fee in USD (flat $0.10 per transaction)
export const TRANSACTION_FEE_USD = 0.10;

// Withdrawal fee in USD (flat $1.00 per withdrawal)
export const WITHDRAWAL_FEE_USD = 1.00;
interface WalletBalance {
  jvc: number;
  usd: number;
  rewards: number;
  pending: number;
  locked: number;
  isFrozen: boolean;
  firstDepositAt: string | null;
  lastDepositAt: string | null;
  lastSpendAt: string | null;
   // New dual-balance fields
   subsidyBalance: number;
   pendingBalance: number;
   pendingUntil: Date | null;
   totalSpendable: number;
   spendablePending: number;
}

interface DepositResult {
  success: boolean;
  transaction_id?: string;
  jvc_amount?: number;
  payment_url?: string;
  checkout_url?: string;
  client_secret?: string;
  status?: string;
  provider?: 'stripe' | 'gateway';
  instructions?: {
    payid?: string;
    address?: string;
    reference?: string;
    message?: string;
  };
  error?: string;
}

interface TransferResult {
  success: boolean;
  transaction_id?: string;
  amount?: number;
  fee?: number;
  total_deducted?: number;
  sender_balance?: number;
  error?: string;
}

interface WithdrawalResult {
  success: boolean;
  withdrawal_id?: string;
  amount?: number;
  fee?: number;
  net_payout?: number;
  status?: string;
  message?: string;
  error?: string;
}

export const useJVCoinWallet = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<WalletBalance>({ 
    jvc: 0, 
    usd: 0, 
    rewards: 0, 
    pending: 0,
    locked: 0,
    isFrozen: false,
    firstDepositAt: null,
    lastDepositAt: null,
     lastSpendAt: null,
     subsidyBalance: 0,
     pendingBalance: 0,
     pendingUntil: null,
     totalSpendable: 0,
     spendablePending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [xrpAddress, setXrpAddress] = useState<string | null>(null);

  // Simulated payments hook
  const simulatedPayments = useSimulatedPayments(user?.id || null);

  // Fetch wallet balance - switches between real and simulated
  const fetchBalance = useCallback(async () => {
    const userId = user?.id;

    if (!userId) {
       setBalance({ 
         jvc: 0, usd: 0, rewards: 0, pending: 0, locked: 0, isFrozen: false, 
         firstDepositAt: null, lastDepositAt: null, lastSpendAt: null,
         subsidyBalance: 0, pendingBalance: 0, pendingUntil: null, totalSpendable: 0, spendablePending: 0
       });
      setLoading(false);
      return;
    }

    // SIMULATION MODE: Read directly from localStorage (prevents render loops)
    if (SIMULATION_MODE) {
      const snap = readSimulatedWalletSnapshot(userId);
      setBalance({
        jvc: snap.balance,
        usd: snap.balance,
        rewards: snap.rewards,
        pending: snap.pending,
        locked: 0,
        isFrozen: false,
        firstDepositAt: null,
        lastDepositAt: null,
        lastSpendAt: null,
         subsidyBalance: 0,
         pendingBalance: 0,
         pendingUntil: null,
         totalSpendable: snap.balance,
         spendablePending: 0,
      });
      setLoading(false);
      return;
    }

    // LIVE MODE: Fetch from database
    try {
      const { data, error } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching wallet:', error);
      }

      if (data) {
         // Calculate spendable amounts
         const regularBalance = data.balance_jv_token || 0;
         const subsidyBalance = data.subsidy_balance || 0;
         const pendingBalance = data.pending_balance || 0;
         const pendingUntil = data.pending_until ? new Date(data.pending_until) : null;
         
         // Calculate spendable pending based on hold period
         const now = new Date();
         let spendablePending = 0;
         if (pendingUntil && now >= pendingUntil) {
           spendablePending = pendingBalance; // Hold period expired
         } else {
           spendablePending = calculateSpendablePending(pendingBalance);
         }
         
         const totalSpendable = regularBalance + subsidyBalance + spendablePending;
         
        setBalance({
           jvc: totalSpendable, // UI shows total spendable
           usd: totalSpendable,
          rewards: data.reward_points || 0,
          pending: data.pending_balance || 0,
          locked: data.locked_balance || 0,
          isFrozen: data.is_frozen || false,
          firstDepositAt: data.first_deposit_at || null,
          lastDepositAt: data.last_deposit_at || null,
          lastSpendAt: data.last_spend_at || null,
           subsidyBalance,
           pendingBalance,
           pendingUntil,
           totalSpendable,
           spendablePending,
        });
      }
    } catch (error) {
      console.error('Wallet fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Initialize wallet if doesn't exist
  const initializeWallet = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data: existing } = await supabase
        .from('user_wallets')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from('user_wallets')
          .insert({
            user_id: user.id,
            balance_jv_token: 0,
            balance_usd: 0,
            reward_points: 0
          });

        if (error) {
          console.error('Wallet creation error:', error);
          return false;
        }
      }

      // Generate XRP address locally for display
      const address = `r${user.id.replace(/-/g, '').slice(0, 24)}`;
      localStorage.setItem(`jv_xrp_address_${user.id}`, address);
      setXrpAddress(address);
      
      await fetchBalance();
      return true;
    } catch (error) {
      console.error('Wallet initialization error:', error);
      return false;
    }
  }, [user, fetchBalance]);

  // Initialize or get XRP wallet (legacy support)
  const initializeXRPWallet = initializeWallet;

  // Deposit via create-topup (routes to Stripe or Gateway based on country)
  // Used for Tier C / gateway countries. Handles GATEWAY_NOT_ENABLED gracefully.
  const depositWithTopup = async (
    amountUsd: number,
    localCurrency?: string,
    countryCode?: string
  ): Promise<DepositResult> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-topup', {
        body: {
          amount: amountUsd,
          currency: localCurrency?.toUpperCase() || 'USD',
          country_code: countryCode,
          payment_preference: 'auto',
        },
      });

      if (error) throw error;

      // Gateway not yet enabled in production — surface cleanly, no crash
      if (data?.error === 'GATEWAY_NOT_ENABLED') {
        return { success: false, error: 'GATEWAY_NOT_ENABLED' };
      }

      // Redirect to checkout if a URL is returned (Stripe or Crossmint)
      const redirectUrl = data?.checkout_url || data?.payment_url;
      if (data?.success && redirectUrl) {
        window.location.replace(redirectUrl);
      }

      return data;
    } catch (err) {
      console.error('Topup deposit error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Deposit failed',
      };
    }
  };

  // Deposit with card (Stripe Checkout)
  const depositWithCard = async (amountUsd: number, localCurrency?: string): Promise<DepositResult> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // SIMULATION MODE: Add funds locally
    if (SIMULATION_MODE) {
      const result = await simulatedPayments.simulateDeposit(amountUsd, 'Card');
      if (result.success) {
        await fetchBalance();
        toast({
          title: '✅ Deposit Successful (Simulated)',
          description: `Added $${amountUsd.toFixed(2)} to your wallet`,
        });
      }
      return { 
        success: result.success, 
        transaction_id: result.transactionId,
        jvc_amount: amountUsd,
        status: 'completed'
      };
    }

    // LIVE MODE: Determine payment rail, then proceed
    try {
      const userCountry = localStorage.getItem('jv_user_country_code') || 'US';
      const userCurrencyCode = localCurrency?.toUpperCase() || localStorage.getItem('jv_user_currency') || 'USD';
      const railDecision = await determinePaymentRail(user.id, userCountry, amountUsd);

      console.log('🚦 PAYMENT RAIL DECISION (card):', {
        country_code: userCountry,
        currency: userCurrencyCode,
        selected_rail: railDecision.rail,
        reason: railDecision.reason,
        subsidy_eligible: railDecision.subsidyEligible,
        is_first_deposit: railDecision.isFirstDeposit,
        amount_usd: amountUsd,
      });

      console.log('🚦 Rail:', railDecision.rail);

      // GATEWAY RAIL: Tier C countries → create-topup
      if (railDecision.rail === 'gateway') {
        console.log('🌐 Gateway rail selected — calling create-topup');
        const { data: gwData, error: gwError } = await supabase.functions.invoke('create-topup', {
          body: {
            amount: amountUsd,
            currency: localCurrency?.toLowerCase() || 'usd',
            country_code: userCountry,
          }
        });

        if (gwError) throw gwError;

        console.log('🌐 Gateway response:', gwData);

        // If funded directly (no redirect needed), refresh balance
        if (gwData?.funded_directly) {
          console.log('✅ Gateway funded directly, refreshing balance');
          await fetchBalance();
          toast({
            title: '✅ Deposit Successful',
            description: `Added $${amountUsd.toFixed(2)} to your wallet`,
          });
          return {
            success: true,
            jvc_amount: amountUsd,
            status: 'completed',
          };
        }

        if (gwData?.checkout_url) {
          console.log('✅ Gateway checkout URL received:', gwData.checkout_url);
          window.location.href = gwData.checkout_url;
        }

        return {
          success: gwData?.success || false,
          transaction_id: gwData?.deposit_id,
          jvc_amount: amountUsd,
          payment_url: gwData?.checkout_url,
          status: 'pending',
        };
      }

      // STRIPE RAIL: Tier A/B countries → deposit-funds (unchanged)
      const { data, error } = await supabase.functions.invoke('deposit-funds', {
        body: {
          deposit_type: 'card',
          amount: amountUsd,
          currency: localCurrency?.toLowerCase() || 'usd',
          return_url: window.location.origin + '/app/wallet'
        }
      });

      if (error) throw error;

      if (data?.payment_url) {
        window.location.replace(data.payment_url);
      }

      return data;
    } catch (error) {
      console.error('Card deposit error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Deposit failed' };
    }
  };

  // Deposit with bank transfer (ACH/BECS - NO FEES)
  const depositWithBankTransfer = async (amountUsd: number, localCurrency?: string): Promise<DepositResult> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // SIMULATION MODE: Add funds locally
    if (SIMULATION_MODE) {
      const result = await simulatedPayments.simulateDeposit(amountUsd, 'Bank Transfer');
      if (result.success) {
        await fetchBalance();
        toast({
          title: '✅ Deposit Successful (Simulated)',
          description: `Added $${amountUsd.toFixed(2)} to your wallet`,
        });
      }
      return { 
        success: result.success, 
        transaction_id: result.transactionId,
        jvc_amount: amountUsd,
        status: 'completed'
      };
    }

    // LIVE MODE: Determine payment rail, then proceed
    try {
      const userCountry = localStorage.getItem('jv_user_country_code') || 'US';
      const userCurrencyCode = localCurrency?.toUpperCase() || localStorage.getItem('jv_user_currency') || 'USD';
      const railDecision = await determinePaymentRail(user.id, userCountry, amountUsd);

      console.log('🚦 PAYMENT RAIL DECISION (bank):', {
        country_code: userCountry,
        currency: userCurrencyCode,
        selected_rail: railDecision.rail,
        reason: railDecision.reason,
        subsidy_eligible: railDecision.subsidyEligible,
        is_first_deposit: railDecision.isFirstDeposit,
        amount_usd: amountUsd,
      });

      console.log('🚦 Rail:', railDecision.rail);

      // GATEWAY RAIL: Tier C countries → create-topup
      if (railDecision.rail === 'gateway') {
        console.log('🌐 Gateway rail selected — calling create-topup');
        const { data: gwData, error: gwError } = await supabase.functions.invoke('create-topup', {
          body: {
            amount: amountUsd,
            currency: localCurrency?.toLowerCase() || 'usd',
            country_code: userCountry,
          }
        });

        if (gwError) throw gwError;

        console.log('🌐 Gateway response (bank):', gwData);

        if (gwData?.funded_directly) {
          console.log('✅ Gateway funded directly, refreshing balance');
          await fetchBalance();
          toast({
            title: '✅ Deposit Successful',
            description: `Added $${amountUsd.toFixed(2)} to your wallet`,
          });
          return {
            success: true,
            jvc_amount: amountUsd,
            status: 'completed',
          };
        }

        if (gwData?.checkout_url) {
          console.log('✅ Gateway checkout URL received:', gwData.checkout_url);
          window.location.href = gwData.checkout_url;
        }

        return {
          success: gwData?.success || false,
          transaction_id: gwData?.deposit_id,
          jvc_amount: amountUsd,
          payment_url: gwData?.checkout_url,
          status: 'pending',
        };
      }

      // STRIPE RAIL: Tier A/B countries → deposit-funds (unchanged)
      const { data, error } = await supabase.functions.invoke('deposit-funds', {
        body: {
          deposit_type: 'bank_transfer',
          amount: amountUsd,
          currency: localCurrency?.toLowerCase() || 'usd',
          return_url: window.location.origin + '/app/wallet'
        }
      });

      if (error) throw error;

      if (data?.payment_url) {
        window.location.replace(data.payment_url);
      }

      return data;
    } catch (error) {
      console.error('Bank transfer error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Bank transfer failed' };
    }
  };

  // Deposit with PayID (Australian instant transfer - NO FEES)
  const depositWithPayID = async (amountUsd: number): Promise<DepositResult> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // SIMULATION MODE: Add funds locally
    if (SIMULATION_MODE) {
      const result = await simulatedPayments.simulateDeposit(amountUsd, 'PayID');
      if (result.success) {
        await fetchBalance();
        toast({
          title: '✅ Deposit Successful (Simulated)',
          description: `Added $${amountUsd.toFixed(2)} to your wallet`,
        });
      }
      return { 
        success: result.success, 
        transaction_id: result.transactionId,
        jvc_amount: amountUsd,
        status: 'completed'
      };
    }

    // LIVE MODE
    try {
      const { data, error } = await supabase.functions.invoke('deposit-funds', {
        body: {
          deposit_type: 'payid',
          amount: amountUsd
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('PayID deposit error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'PayID deposit failed' };
    }
  };

  // Deposit with crypto (XRP)
  const depositWithCrypto = async (amountUsd: number): Promise<DepositResult> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // SIMULATION MODE: Add funds locally
    if (SIMULATION_MODE) {
      const result = await simulatedPayments.simulateDeposit(amountUsd, 'Crypto');
      if (result.success) {
        await fetchBalance();
        toast({
          title: '✅ Deposit Successful (Simulated)',
          description: `Added $${amountUsd.toFixed(2)} to your wallet`,
        });
      }
      return { 
        success: result.success, 
        transaction_id: result.transactionId,
        jvc_amount: amountUsd,
        status: 'completed'
      };
    }

    // LIVE MODE
    try {
      const { data, error } = await supabase.functions.invoke('deposit-funds', {
        body: {
          deposit_type: 'crypto',
          amount: amountUsd
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Crypto deposit error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Crypto deposit failed' };
    }
  };

  // Transfer JVC to another user
  const transferJVC = async (recipientId: string, amount: number, description?: string): Promise<TransferResult> => {
    if (!user) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return { success: false, error: 'Not authenticated' };
    }

    if (!SIMULATION_MODE && balance.isFrozen) {
      toast({ title: 'Wallet Frozen', description: 'Your wallet is frozen. Contact support.', variant: 'destructive' });
      return { success: false, error: 'Wallet frozen' };
    }

    const totalRequired = amount + TRANSACTION_FEE_USD;
    const currentBalance = SIMULATION_MODE && user
      ? readSimulatedWalletSnapshot(user.id).balance
      : balance.jvc;
    
    if (totalRequired > currentBalance) {
      toast({ 
        title: 'Insufficient Balance', 
        description: `Need $${totalRequired.toFixed(2)} ($${amount} + $0.10 fee)`, 
        variant: 'destructive' 
      });
      return { success: false, error: 'Insufficient balance' };
    }

    // SIMULATION MODE: Transfer locally
    if (SIMULATION_MODE) {
      const result = await simulatedPayments.simulateTransfer(recipientId, amount, TRANSACTION_FEE_USD, description);
      if (result.success) {
        await fetchBalance();
        toast({
          title: '✅ Transfer Successful (Simulated)',
          description: `Sent $${amount.toFixed(2)} (Fee: $0.10)`,
        });
      }
      return { 
        success: result.success, 
        transaction_id: result.transactionId,
        amount,
        fee: TRANSACTION_FEE_USD,
        total_deducted: totalRequired
      };
    }

    // LIVE MODE
    try {
      const { data, error } = await supabase.functions.invoke('transfer-jvc', {
        body: {
          recipient_id: recipientId,
          amount: amount,
          description: description
        }
      });

      if (error) throw error;

      if (data?.success) {
        await fetchBalance();
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${amount} JVC (Fee: $0.10)`,
        });
      }

      return data;
    } catch (error) {
      console.error('Transfer error:', error);
      toast({ title: 'Transfer Failed', description: 'Please try again', variant: 'destructive' });
      return { success: false, error: error instanceof Error ? error.message : 'Transfer failed' };
    }
  };

  // Pay at venue (user to venue payment)
   const payVenue = async (venueId: string, amount: number, orderId?: string, venueName?: string, verificationToken?: string): Promise<TransferResult> => {
    if (!user) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return { success: false, error: 'Not authenticated' };
    }

    if (!SIMULATION_MODE && balance.isFrozen) {
      toast({ title: 'Wallet Frozen', description: 'Your wallet is frozen. Contact support.', variant: 'destructive' });
      return { success: false, error: 'Wallet frozen' };
    }

    const totalRequired = amount + TRANSACTION_FEE_USD;
     // Use totalSpendable which includes regular + subsidy + spendable pending
     const currentBalance = SIMULATION_MODE && user
       ? readSimulatedWalletSnapshot(user.id).balance
       : balance.totalSpendable;

    if (totalRequired > currentBalance) {
      toast({ 
        title: 'Insufficient Balance', 
        description: `Need $${totalRequired.toFixed(2)}. Please deposit more funds.`, 
        variant: 'destructive' 
      });
      return { success: false, error: 'Insufficient balance' };
    }

    // SIMULATION MODE: Pay locally
    if (SIMULATION_MODE) {
      const result = await simulatedPayments.simulateVenuePayment(
        venueId, 
        venueName || 'Venue', 
        amount, 
        TRANSACTION_FEE_USD,
        orderId
      );
      if (result.success) {
        await fetchBalance();
        toast({
          title: '✅ Payment Successful (Simulated)',
          description: `Paid $${amount.toFixed(2)} + $0.10 fee`,
        });
      }
      return { 
        success: result.success, 
        transaction_id: result.transactionId,
        amount,
        fee: TRANSACTION_FEE_USD,
        total_deducted: totalRequired
      };
    }

     // LIVE MODE: Spend subsidy balance first, then regular balance
    try {
       // Calculate spend allocation (subsidy first, then regular)
       let subsidySpent = 0;
       let regularSpent = 0;
       let remainingAmount = totalRequired;
       
       // 1. Spend from subsidy balance first (non-withdrawable)
       if (balance.subsidyBalance > 0 && remainingAmount > 0) {
         subsidySpent = Math.min(balance.subsidyBalance, remainingAmount);
         remainingAmount -= subsidySpent;
       }
       
       // 2. Spend from spendable pending
       let pendingSpent = 0;
       if (balance.spendablePending > 0 && remainingAmount > 0) {
         pendingSpent = Math.min(balance.spendablePending, remainingAmount);
         remainingAmount -= pendingSpent;
       }
       
       // 3. Spend from regular balance
       regularSpent = remainingAmount;
       
      const { data, error } = await supabase.functions.invoke('transfer-jvc', {
        body: {
          recipient_venue_id: venueId,
          amount: amount,
          order_id: orderId,
           description: `Payment at venue`,
           verification_token: verificationToken || 'pin_verified',
           subsidy_spent: subsidySpent,
           pending_spent: pendingSpent,
           regular_spent: regularSpent,
        }
      });

      if (error) throw error;

      if (data?.success) {
        await fetchBalance();
        toast({
          title: 'Payment Successful!',
          description: `Paid ${amount} JVC + $0.10 fee`,
        });
      }

      return data;
    } catch (error) {
      console.error('Payment error:', error);
      toast({ title: 'Payment Failed', description: 'Please try again', variant: 'destructive' });
      return { success: false, error: error instanceof Error ? error.message : 'Payment failed' };
    }
  };

  // Request withdrawal
  const requestWithdrawal = async (
    amount: number, 
    method: 'bank' | 'crypto',
    bankDetails?: { account_last4: string; bank_name: string },
    cryptoAddress?: string
  ): Promise<WithdrawalResult> => {
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (balance.isFrozen) {
      return { success: false, error: 'Wallet frozen' };
    }

    if (amount > balance.jvc) {
      return { success: false, error: 'Insufficient balance' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('process-withdrawal', {
        body: {
          amount,
          withdrawal_method: method,
          bank_details: bankDetails,
          crypto_address: cryptoAddress
        }
      });

      if (error) throw error;

      if (data?.success) {
        await fetchBalance();
        toast({
          title: 'Withdrawal Requested',
          description: data.message,
        });
      }

      return data;
    } catch (error) {
      console.error('Withdrawal error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Withdrawal failed' };
    }
  };

  // Verify balance before transaction
  const verifyBalance = async (requiredAmount: number): Promise<boolean> => {
    await fetchBalance();
    return balance.jvc >= (requiredAmount + TRANSACTION_FEE_USD);
  };

  // Legacy processPayment function (now uses payVenue)
  const processPayment = async (venueAddress: string, amount: number, orderId: string): Promise<boolean> => {
    const result = await payVenue(venueAddress, amount, orderId);
    return result.success;
  };

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (user) {
      const storedAddress = localStorage.getItem(`jv_xrp_address_${user.id}`);
      if (storedAddress) {
        setXrpAddress(storedAddress);
      }
    }
  }, [user]);

  return {
    balance,
    loading,
    xrpAddress,
    fetchBalance,
    initializeWallet,
    initializeXRPWallet,
    depositWithTopup,
    depositWithCard,
    depositWithBankTransfer,
    depositWithPayID,
    depositWithCrypto,
    transferJVC,
    payVenue,
    requestWithdrawal,
    verifyBalance,
    processPayment,
    TRANSACTION_FEE_USD
  };
};
