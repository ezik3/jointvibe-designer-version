/**
 * Tier-based delay tables for deal visibility.
 * 
 * These delays are applied at READ TIME only — they do not affect
 * deal creation, publishing, credit deduction, or any other flow.
 * 
 * Vibes are EXEMPT from this system (always near-instant).
 */

import type { TierName } from '@/hooks/useUserTier';
import type { DelayMode } from '@/utils/activityScore';

/** Maximum delay allowed (15 minutes = 900 seconds) */
const MAX_DELAY_CAP_SECS = 900;

/** Delay tables in seconds */
const DELAY_TABLES: Record<DelayMode, Record<TierName, number | [number, number]>> = {
  low: {
    platinum: 0,
    diamond: 5,
    gold: 10,
    silver: 20,
    bronze: 30,
    member: 60,
  },
  growth: {
    platinum: 0,
    diamond: 30,
    gold: 60,
    silver: 120,
    bronze: 180,
    member: 300,
  },
  high: {
    platinum: 0,
    diamond: [60, 120],
    gold: [180, 300],
    silver: [420, 600],
    bronze: [720, 900],   // capped at 900
    member: [900, 900],   // capped at 900 (was 1200-1800)
  },
};

/**
 * Get the delay in seconds for a given tier and mode.
 * Applies randomization for HIGH mode ranges and enforces the 15-minute cap.
 */
export function getTierDelaySecs(tier: TierName, mode: DelayMode): number {
  const entry = DELAY_TABLES[mode][tier];
  let delay: number;

  if (Array.isArray(entry)) {
    const [min, max] = entry;
    delay = min + Math.random() * (max - min);
  } else {
    delay = entry;
  }

  // Hard cap at 15 minutes
  return Math.min(Math.round(delay), MAX_DELAY_CAP_SECS);
}

/**
 * Get the maximum possible delay for the lowest tier (member) in a given mode.
 * Used to show venues the estimated reach time.
 */
export function getMaxDelayForMode(mode: DelayMode): number {
  const entry = DELAY_TABLES[mode].member;
  const raw = Array.isArray(entry) ? entry[1] : entry;
  return Math.min(raw, MAX_DELAY_CAP_SECS);
}
