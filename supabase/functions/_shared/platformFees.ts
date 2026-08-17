/**
 * Platform Fee Calculator for Edge Functions (Deno runtime)
 * Duplicated from src/config/platformFees.ts since edge functions can't import from src/
 */

const TIER_FEES: Record<string, { type: string; flatAmount?: number; percentage?: number; capAmount?: number; minAmount?: number }> = {
  A: { type: 'flat', flatAmount: 0.10 },
  B: { type: 'flat', flatAmount: 0.05 },
  C: { type: 'percentage_capped', percentage: 0.01, capAmount: 0.03, minAmount: 0.005 },
  D: { type: 'percentage_capped', percentage: 0.005, capAmount: 0.02, minAmount: 0.003 },
};

const COUNTRY_TIERS: Record<string, string> = {
  // Tier A
  US:'A', AU:'A', CA:'A', GB:'A', IE:'A', NZ:'A', SG:'A', AE:'A', HK:'A',
  JP:'A', CH:'A', DE:'A', FR:'A', NL:'A', AT:'A', BE:'A', DK:'A', SE:'A',
  NO:'A', FI:'A', IT:'A', ES:'A', PT:'A', LU:'A', MT:'A', CY:'A', EE:'A',
  LV:'A', LT:'A', SI:'A', SK:'A', GI:'A', LI:'A',
  // Tier B
  TH:'B', MY:'B', BR:'B', MX:'B', PL:'B', CZ:'B', HU:'B', RO:'B',
  HR:'B', BG:'B', GR:'B', ZA:'B',
  // Tier C
  IN:'C', ID:'C', PH:'C', VN:'C', CO:'C', PE:'C', EG:'C', PK:'C',
  BD:'C', LK:'C', KH:'C', MM:'C', NP:'C', KE:'C', NG:'C', GH:'C',
  AR:'C', CL:'C',
};

export function getCountryTier(countryCode: string): string {
  return COUNTRY_TIERS[countryCode?.toUpperCase()] || 'A';
}

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
