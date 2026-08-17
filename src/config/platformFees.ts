import { getCountryTier } from './countries';

interface FeeConfig {
  type: 'flat' | 'percentage_capped';
  flatAmount?: number;
  percentage?: number;
  capAmount?: number;
  minAmount?: number;
}

const TIER_FEES: Record<string, FeeConfig> = {
  A: { type: 'flat', flatAmount: 0.10 },
  B: { type: 'flat', flatAmount: 0.05 },
  C: { type: 'percentage_capped', percentage: 0.01, capAmount: 0.03, minAmount: 0.005 },
  D: { type: 'percentage_capped', percentage: 0.005, capAmount: 0.02, minAmount: 0.003 },
};

/**
 * Calculate the platform fee for a transaction.
 * @param orderTotalUSD - Order total in USD equivalent
 * @param countryCode - ISO 2-letter country code of the END USER (person paying)
 * @returns Fee amount in USD
 */
export function calculatePlatformFee(orderTotalUSD: number, countryCode: string): number {
  const tier = getCountryTier(countryCode);
  const config = TIER_FEES[tier] || TIER_FEES['A'];

  if (config.type === 'flat') {
    return config.flatAmount!;
  }

  const calculated = orderTotalUSD * config.percentage!;
  const capped = Math.min(calculated, config.capAmount!);
  const floored = Math.max(capped, config.minAmount!);
  return Math.round(floored * 100) / 100;
}

/** Kept for backward compatibility — returns the old $0.10 default */
export const PLATFORM_FEE_LEGACY = 0.10;
