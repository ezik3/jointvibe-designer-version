 /**
  * Country Routing Configuration
  * Determines which payment rail to use based on user's country
  */
 
 // Tier-1: Stripe is default (low friction, high trust, established markets)
 export const STRIPE_COUNTRIES = [
   'AU', 'US', 'CA', 'GB', 'NZ', 'SG', 'AE', 'JP', 'KR', 'HK',
   'AT', 'BE', 'DK', 'FI', 'FR', 'DE', 'IE', 'IT', 'NL', 'NO', 
   'ES', 'SE', 'CH', 'PT', 'LU', 'CZ', 'PL', 'GR'
 ];
 
 // 3WC: Gateway is default (with fee subsidy to remove friction)
 export const GATEWAY_COUNTRIES = [
   // Asia
   'IN', 'TH', 'PH', 'VN', 'ID', 'MY', 'BD', 'PK', 'LK', 'NP', 'MM',
   // Latin America
   'BR', 'MX', 'AR', 'CO', 'PE', 'CL', 'EC', 'VE',
   // Africa
   'ZA', 'NG', 'KE', 'EG', 'GH', 'TZ', 'UG', 'MA'
 ];
 
 // Hybrid: Show both options (user can choose)
 export const HYBRID_COUNTRIES = [
   'TW', 'IL', 'SA', 'QA', 'KW', 'BH'
 ];
 
 // Blocked: Sanctions or high-risk (no service)
 export const BLOCKED_COUNTRIES = [
   'KP', 'IR', 'SY', 'CU', 'RU', 'BY'
 ];
 
 export type PaymentRail = 'stripe' | 'gateway' | 'both' | 'blocked';
 
/**
 * Determine which payment rail to use for a given country
 */
export function getPaymentRailForCountry(countryCode: string): PaymentRail {
  const code = countryCode.toUpperCase();
   
   if (BLOCKED_COUNTRIES.includes(code)) return 'blocked';
   if (GATEWAY_COUNTRIES.includes(code)) return 'gateway';
   if (HYBRID_COUNTRIES.includes(code)) return 'both';
   if (STRIPE_COUNTRIES.includes(code)) return 'stripe';
   
  // Default all non-Stripe, non-blocked countries to the crypto/stablecoin gateway rail.
  return 'gateway';
 }
 
 /**
  * Check if a country is eligible for fee subsidy (only 3WC countries)
  */
 export function isCountryEligibleForSubsidy(countryCode: string): boolean {
  return getPaymentRailForCountry(countryCode) === 'gateway';
 }
 
 /**
  * Get display name for a country (for UI)
  */
 export const COUNTRY_NAMES: Record<string, string> = {
   AU: 'Australia', US: 'United States', CA: 'Canada', GB: 'United Kingdom',
   IN: 'India', TH: 'Thailand', PH: 'Philippines', VN: 'Vietnam',
   ID: 'Indonesia', MY: 'Malaysia', BR: 'Brazil', MX: 'Mexico',
   AR: 'Argentina', CO: 'Colombia', ZA: 'South Africa', NG: 'Nigeria',
   // Add more as needed
 };