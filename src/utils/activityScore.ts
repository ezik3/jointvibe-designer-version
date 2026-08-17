/**
 * Dynamic Activity Score System
 * 
 * Calculates a market activity score for a given location,
 * used to determine which delay mode to apply for deal visibility.
 * 
 * This is purely a read-time system — it does NOT affect how deals
 * are stored, published, or how credits are deducted.
 */

export type DelayMode = 'low' | 'growth' | 'high';

/**
 * Calculate the activity score for a location.
 * @param recentlyActiveUsers - Users active in the last 10–15 minutes in this location
 * @param activeDeals - Deals published/active in the last 60 minutes in this location
 */
export function calculateActivityScore(recentlyActiveUsers: number, activeDeals: number): number {
  return recentlyActiveUsers + (activeDeals * 5);
}

/**
 * Determine the delay mode based on activity score.
 */
export function getDelayMode(activityScore: number): DelayMode {
  if (activityScore >= 300) return 'high';
  if (activityScore >= 50) return 'growth';
  return 'low';
}

/**
 * Minimum thresholds for "sufficient data" at a location level.
 * If neither threshold is met, we fall back to the next broader level.
 */
export function hasSufficientData(activeUsers: number, activeDeals: number): boolean {
  return activeUsers >= 5 || activeDeals >= 3;
}

/**
 * Adaptive minimum exposure guarantee per mode.
 * Prevents empty feeds while avoiding forced content in small locations.
 */
export function getMinExposureGuarantee(mode: DelayMode): number {
  switch (mode) {
    case 'low': return 1;
    case 'growth': return 2;
    case 'high': return 3;
  }
}
