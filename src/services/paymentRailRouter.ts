 /**
  * Payment Rail Router Service
  * 
  * Determines which payment provider to use based on:
  * - User's country
  * - Feature flags
  * - User's verification status
  * - Subsidy eligibility and caps
  */
 
 import { supabase } from '@/integrations/supabase/client';
 import { 
   getPaymentRailForCountry, 
   isCountryEligibleForSubsidy,
   type PaymentRail 
 } from '@/config/countryRouting';
 import {
   ENABLE_GATEWAY_RAIL,
   ENABLE_SUBSIDY,
   MAX_SUBSIDY_PER_USER_USD,
   MAX_SUBSIDIZED_DEPOSITS_PER_USER,
   REQUIRE_EMAIL_VERIFIED,
   REQUIRE_PHONE_VERIFIED,
   REQUIRE_ID_VERIFIED,
   getCountryDailyCap,
   getCountryMonthlyCap,
   calculateSubsidyAmount,
   calculateFirstDepositBonus,
   calculateSpendablePending,
   SUBSIDY_PERCENTAGE,
   PENDING_BALANCE_HOLD_HOURS,
   PENDING_BALANCE_SPEND_LIMIT,
 } from '@/config/subsidyConfig';
 
 export interface RailDecision {
   rail: PaymentRail;
   reason: string;
   subsidyEligible: boolean;
   subsidyRemainingBudget: number;
   isFirstDeposit: boolean;
 }
 
 export interface SubsidyEligibility {
   eligible: boolean;
   reason: string;
   remainingBudget: number;
   remainingDeposits: number;
   currentPercentage: number;
 }
 
 export interface WalletBalances {
   regularBalance: number;
   subsidyBalance: number;
   pendingBalance: number;
   pendingUntil: Date | null;
   totalSpendable: number;
   spendablePending: number;
 }
 
 /**
  * Determine which payment rail to use for a user
  */
 export async function determinePaymentRail(
   userId: string,
   countryCode: string,
   amount: number
 ): Promise<RailDecision> {
   // Check feature flag first
   if (!ENABLE_GATEWAY_RAIL) {
     return {
       rail: 'stripe',
       reason: 'Gateway rail disabled',
       subsidyEligible: false,
       subsidyRemainingBudget: 0,
       isFirstDeposit: false,
     };
   }
 
   // Get base rail decision from country
   const baseRail = getPaymentRailForCountry(countryCode);
   
   if (baseRail === 'blocked') {
     return {
       rail: 'blocked',
       reason: 'Country not supported',
       subsidyEligible: false,
       subsidyRemainingBudget: 0,
       isFirstDeposit: false,
     };
   }
 
   // Check subsidy eligibility
   const subsidyCheck = await checkSubsidyEligibility(userId, countryCode);
   const isFirstDeposit = await checkIsFirstDeposit(userId);
 
   return {
     rail: baseRail,
     reason: baseRail === 'gateway' ? '3WC country - gateway preferred' : 'Tier-1 country - Stripe preferred',
     subsidyEligible: subsidyCheck.eligible,
     subsidyRemainingBudget: subsidyCheck.remainingBudget,
     isFirstDeposit,
   };
 }
 
 /**
  * Check if user is eligible for fee subsidy
  */
 export async function checkSubsidyEligibility(
   userId: string,
   countryCode: string
 ): Promise<SubsidyEligibility> {
   // Feature flag check
   if (!ENABLE_SUBSIDY) {
     return {
       eligible: false,
       reason: 'Subsidy system disabled',
       remainingBudget: 0,
       remainingDeposits: 0,
       currentPercentage: 0,
     };
   }
 
   // Country eligibility check
   if (!isCountryEligibleForSubsidy(countryCode)) {
     return {
       eligible: false,
       reason: 'Country not eligible for subsidy',
       remainingBudget: 0,
       remainingDeposits: 0,
       currentPercentage: SUBSIDY_PERCENTAGE,
     };
   }
 
   // Get user's wallet data
   const { data: wallet } = await supabase
     .from('user_wallets')
     .select('subsidy_lifetime_total, subsidized_deposit_count, first_deposit_bonus_claimed')
     .eq('user_id', userId)
     .maybeSingle();
 
   const lifetimeSubsidy = wallet?.subsidy_lifetime_total || 0;
   const depositCount = wallet?.subsidized_deposit_count || 0;
 
   // Check user-level caps
   if (lifetimeSubsidy >= MAX_SUBSIDY_PER_USER_USD) {
     return {
       eligible: false,
       reason: 'User lifetime subsidy cap reached',
       remainingBudget: 0,
       remainingDeposits: MAX_SUBSIDIZED_DEPOSITS_PER_USER - depositCount,
       currentPercentage: SUBSIDY_PERCENTAGE,
     };
   }
 
   if (depositCount >= MAX_SUBSIDIZED_DEPOSITS_PER_USER) {
     return {
       eligible: false,
       reason: 'Maximum subsidized deposits reached',
       remainingBudget: MAX_SUBSIDY_PER_USER_USD - lifetimeSubsidy,
       remainingDeposits: 0,
       currentPercentage: SUBSIDY_PERCENTAGE,
     };
   }
 
   // Check country-level caps
   const countryCapCheck = await checkCountrySubsidyCaps(countryCode);
   if (!countryCapCheck.withinLimits) {
     return {
       eligible: false,
       reason: countryCapCheck.reason,
       remainingBudget: MAX_SUBSIDY_PER_USER_USD - lifetimeSubsidy,
       remainingDeposits: MAX_SUBSIDIZED_DEPOSITS_PER_USER - depositCount,
       currentPercentage: SUBSIDY_PERCENTAGE,
     };
   }
 
   return {
     eligible: true,
     reason: 'Eligible for subsidy',
     remainingBudget: MAX_SUBSIDY_PER_USER_USD - lifetimeSubsidy,
     remainingDeposits: MAX_SUBSIDIZED_DEPOSITS_PER_USER - depositCount,
     currentPercentage: SUBSIDY_PERCENTAGE,
   };
 }
 
 /**
  * Check country-level subsidy caps
  */
 async function checkCountrySubsidyCaps(countryCode: string): Promise<{ withinLimits: boolean; reason: string }> {
   const today = new Date().toISOString().split('T')[0];
   
   const { data: usage } = await supabase
     .from('country_subsidy_usage')
     .select('daily_subsidy_total, monthly_subsidy_total')
     .eq('country_code', countryCode)
     .eq('date', today)
     .maybeSingle();
 
   const dailyCap = getCountryDailyCap(countryCode);
   const monthlyCap = getCountryMonthlyCap(countryCode);
 
   const dailyUsed = usage?.daily_subsidy_total || 0;
   const monthlyUsed = usage?.monthly_subsidy_total || 0;
 
   if (dailyUsed >= dailyCap) {
     return { withinLimits: false, reason: 'Country daily subsidy cap reached' };
   }
 
   if (monthlyUsed >= monthlyCap) {
     return { withinLimits: false, reason: 'Country monthly subsidy cap reached' };
   }
 
   return { withinLimits: true, reason: 'Within limits' };
 }
 
 /**
  * Check if this is the user's first deposit
  */
 export async function checkIsFirstDeposit(userId: string): Promise<boolean> {
   const { data: wallet } = await supabase
     .from('user_wallets')
     .select('first_deposit_bonus_claimed')
     .eq('user_id', userId)
     .maybeSingle();
 
   // If no wallet or bonus not claimed, this is a first deposit
   return !wallet?.first_deposit_bonus_claimed;
 }
 
 /**
  * Calculate subsidy amounts for a deposit
  */
 export function calculateDepositSubsidy(
   intendedAmount: number,
   netReceived: number,
   isFirstDeposit: boolean,
   subsidyEligible: boolean
 ): { feeReimbursement: number; firstDepositBonus: number; totalSubsidy: number } {
   if (!subsidyEligible) {
     return { feeReimbursement: 0, firstDepositBonus: 0, totalSubsidy: 0 };
   }
 
   const feeAmount = intendedAmount - netReceived;
   const feeReimbursement = calculateSubsidyAmount(feeAmount);
   const firstDepositBonus = isFirstDeposit ? calculateFirstDepositBonus(netReceived) : 0;
 
   return {
     feeReimbursement,
     firstDepositBonus,
     totalSubsidy: feeReimbursement + firstDepositBonus,
   };
 }
 
 /**
  * Get user's full balance breakdown (for wallet display)
  */
 export async function getUserBalances(userId: string): Promise<WalletBalances> {
   const { data: wallet } = await supabase
     .from('user_wallets')
     .select('balance_jv_token, subsidy_balance, pending_balance, pending_until')
     .eq('user_id', userId)
     .maybeSingle();
 
   const regularBalance = wallet?.balance_jv_token || 0;
   const subsidyBalance = wallet?.subsidy_balance || 0;
   const pendingBalance = wallet?.pending_balance || 0;
   const pendingUntil = wallet?.pending_until ? new Date(wallet.pending_until) : null;
 
   // Calculate spendable pending (based on PENDING_BALANCE_SPEND_LIMIT)
   const now = new Date();
   let spendablePending = 0;
   
   if (pendingUntil && now >= pendingUntil) {
     // Pending period expired, all pending is spendable
     spendablePending = pendingBalance;
   } else {
     // Still in pending period, apply limit
     spendablePending = calculateSpendablePending(pendingBalance);
   }
 
   return {
     regularBalance,
     subsidyBalance,
     pendingBalance,
     pendingUntil,
     totalSpendable: regularBalance + subsidyBalance + spendablePending,
     spendablePending,
   };
 }
 
 /**
  * Calculate pending expiry time
  */
 export function calculatePendingUntil(): Date {
   const now = new Date();
   return new Date(now.getTime() + PENDING_BALANCE_HOLD_HOURS * 60 * 60 * 1000);
 }