 /**
  * Subsidy Configuration for 3WC Markets
  * 
  * This controls the fee reimbursement system that makes deposits
  * appear "free" to users in 3rd world countries.
  * 
  * Includes:
  * - User-level caps (prevent individual abuse)
  * - Country-level caps (prevent regional fraud spikes)
  * - Soft ramp-down controls (gradual subsidy reduction)
  * - Pending balance rules (chargeback protection)
  */
 
 // ==========================================
 // MASTER SWITCHES
 // ==========================================
 
 /** Enable/disable the gateway payment rail entirely */
 export const ENABLE_GATEWAY_RAIL = true;
 
 /** Enable/disable fee subsidies (can keep gateway but stop subsidizing) */
 export const ENABLE_SUBSIDY = true;
 
 /** Enable/disable first deposit bonus */
 export const ENABLE_FIRST_DEPOSIT_BONUS = true;
 
 // ==========================================
 // SOFT RAMP-DOWN CONTROLS (Tweak #2)
 // ==========================================
 
 /**
  * Subsidy percentage: 1.0 = 100% subsidy, 0.5 = 50%, 0 = none
  * Use this to gradually reduce subsidies without hard cutoff
  * 
  * Recommended ramp-down schedule:
  * Launch: 1.0 (100%)
  * Month 3: 0.75 (75%)
  * Month 6: 0.5 (50%)
  * Month 12: 0.25 (25%)
  * Month 18: 0 (users habituated, remove subsidy)
  */
 export const SUBSIDY_PERCENTAGE = 1.0;
 
 /**
  * First deposit bonus percentage (as subsidy, not withdrawable)
  * Set to 0 to disable, 0.10 = 10% bonus
  */
 export const FIRST_DEPOSIT_BONUS_PERCENT = 0.10;
 
 // ==========================================
 // USER-LEVEL CAPS
 // ==========================================
 
 /** Maximum total subsidy any single user can receive (in USD) */
 export const MAX_SUBSIDY_PER_USER_USD = 2.00;
 
 /** Maximum number of deposits that can receive subsidy per user */
 export const MAX_SUBSIDIZED_DEPOSITS_PER_USER = 10;
 
 // ==========================================
 // COUNTRY-LEVEL CAPS (Tweak #1)
 // ==========================================
 
 /** Maximum subsidy spend per country per day (in USD) - fraud protection */
 export const MAX_SUBSIDY_PER_COUNTRY_PER_DAY_USD = 500;
 
 /** Maximum subsidy spend per country per month (in USD) */
 export const MAX_SUBSIDY_PER_COUNTRY_PER_MONTH_USD = 10000;
 
 /**
  * Per-country overrides for daily/monthly caps
  * Use this for high-volume countries that need higher limits
  */
 export const COUNTRY_SUBSIDY_OVERRIDES: Record<string, { dailyUsd: number; monthlyUsd: number }> = {
   IN: { dailyUsd: 1000, monthlyUsd: 25000 },  // India: high volume expected
   TH: { dailyUsd: 750, monthlyUsd: 15000 },   // Thailand: tourism market
   PH: { dailyUsd: 500, monthlyUsd: 10000 },   // Philippines
   BR: { dailyUsd: 750, monthlyUsd: 15000 },   // Brazil: large market
 };
 
 // ==========================================
 // PENDING BALANCE RULES (Tweak #3)
 // ==========================================
 
 /** 
  * Hours to hold gateway deposits before they become fully spendable
  * This protects against chargebacks on card-funded crypto deposits
  */
 export const PENDING_BALANCE_HOLD_HOURS = 72;
 
 /**
  * Maximum spend allowed from pending balance (0 = fully locked, 1 = fully spendable)
  * 0.5 means user can spend up to 50% of pending funds
  */
 export const PENDING_BALANCE_SPEND_LIMIT = 0.5;
 
 // ==========================================
 // DEPOSIT LIMITS
 // ==========================================
 
 /** Minimum deposit amount (in USD equivalent) */
 export const MIN_DEPOSIT_USD = 5;
 
 /** Maximum deposit for unverified users (in USD equivalent) */
 export const MAX_DEPOSIT_UNVERIFIED_USD = 100;
 
 /** Maximum deposit for verified users (in USD equivalent) */
 export const MAX_DEPOSIT_VERIFIED_USD = 1000;
 
 // ==========================================
 // KYC REQUIREMENTS FOR SUBSIDY
 // ==========================================
 
 /** Require email verification before granting subsidy */
 export const REQUIRE_EMAIL_VERIFIED = true;
 
 /** Require phone verification before granting subsidy */
 export const REQUIRE_PHONE_VERIFIED = true;
 
 /** Require ID verification before granting subsidy */
 export const REQUIRE_ID_VERIFIED = true;
 
 // ==========================================
 // HELPER FUNCTIONS
 // ==========================================
 
 /**
  * Get country-specific daily subsidy cap
  */
 export function getCountryDailyCap(countryCode: string): number {
   const code = countryCode.toUpperCase();
   return COUNTRY_SUBSIDY_OVERRIDES[code]?.dailyUsd || MAX_SUBSIDY_PER_COUNTRY_PER_DAY_USD;
 }
 
 /**
  * Get country-specific monthly subsidy cap
  */
 export function getCountryMonthlyCap(countryCode: string): number {
   const code = countryCode.toUpperCase();
   return COUNTRY_SUBSIDY_OVERRIDES[code]?.monthlyUsd || MAX_SUBSIDY_PER_COUNTRY_PER_MONTH_USD;
 }
 
 /**
  * Calculate actual subsidy amount after applying percentage
  */
 export function calculateSubsidyAmount(feeAmount: number): number {
   if (!ENABLE_SUBSIDY) return 0;
   return feeAmount * SUBSIDY_PERCENTAGE;
 }
 
 /**
  * Calculate first deposit bonus
  */
 export function calculateFirstDepositBonus(depositAmount: number): number {
   if (!ENABLE_FIRST_DEPOSIT_BONUS) return 0;
   return depositAmount * FIRST_DEPOSIT_BONUS_PERCENT;
 }
 
 /**
  * Check if pending balance can be spent
  */
 export function calculateSpendablePending(pendingAmount: number): number {
   return pendingAmount * PENDING_BALANCE_SPEND_LIMIT;
 }