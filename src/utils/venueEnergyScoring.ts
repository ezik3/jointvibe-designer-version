/**
 * Venue Energy Scoring — Pure Computation Layer
 *
 * Calculates an internal "energy score" for a venue based on
 * real presence and intent signals. This score powers venue discovery,
 * trending signals, and activity indicators.
 *
 * Architecture rules (do not violate):
 * - This file has zero network calls. It is pure computation only.
 * - Private presence MUST contribute to the score (counted by the server-side
 *   SECURITY DEFINER RPC). User identity is never exposed here.
 * - This system is completely separate from moderation, bans, caution alerts,
 *   incident timelines, and operational notifications.
 * - Weights are intentionally simple. Do not add complex heuristics here;
 *   extend VenueEnergySignals and adjust weights in the config block below.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VenueEnergyState = "quiet" | "building" | "busy" | "trending";

/**
 * Aggregate signal inputs for energy scoring.
 * All counts are identity-free — callers must never pass per-user data here.
 */
export interface VenueEnergySignals {
  /** Users currently checked in (all visibilities, including private). */
  checkedInCount: number;
  /** Users with an active non-expired heading_there intent signal. */
  headingThereCount: number;
  /** Users with an active non-expired maybe_going intent signal. */
  maybeGoingCount: number;
  /**
   * Check-ins created in the last 60 minutes (arrival velocity).
   * May be an approximation if fetched from a client-side query under RLS.
   */
  recentArrivalCount: number;
  /**
   * Transaction / POS inside-proof events in the last 60 minutes.
   * Starts at 0 in the foundation. Future: populate from a server-side
   * SECURITY DEFINER aggregate that counts without exposing user identity.
   */
  insideProofEventCount: number;
}

export interface VenueEnergyResult {
  /** Normalized energy score: 0–100. */
  score: number;
  /** Human-readable energy state derived from the score. */
  state: VenueEnergyState;
  /** The input signals used for this calculation (for debugging / transparency). */
  signals: VenueEnergySignals;
}

// ---------------------------------------------------------------------------
// Scoring config — adjust here, not scattered across call sites
// ---------------------------------------------------------------------------

/**
 * Per-unit contribution to the raw score.
 * Higher-confidence signals carry more weight.
 */
const SIGNAL_WEIGHTS = {
  checkedIn: 10,    // strongest signal — verified physical presence
  headingThere: 5,  // strong intent, imminent arrival
  maybeGoing: 2,    // weak intent, uncertain
  recentArrival: 8, // arrival velocity — indicates momentum
  insideProof: 12,  // transaction/POS confirmation — strongest operational evidence
} as const;

/** Maximum possible score (clamped to this value). */
const SCORE_MAX = 100;

/**
 * State thresholds (inclusive lower bound).
 * Adjust these to calibrate sensitivity as the user base grows.
 */
const STATE_THRESHOLDS = {
  trending: 70,
  busy: 40,
  building: 20,
} as const;

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Calculate a venue's energy level from aggregate presence and intent signals.
 *
 * @param signals - Aggregate counts. Must not contain user identity data.
 * @returns Score (0–100), state, and echoed signals.
 */
export function calculateVenueEnergy(signals: VenueEnergySignals): VenueEnergyResult {
  const raw =
    signals.checkedInCount * SIGNAL_WEIGHTS.checkedIn +
    signals.headingThereCount * SIGNAL_WEIGHTS.headingThere +
    signals.maybeGoingCount * SIGNAL_WEIGHTS.maybeGoing +
    signals.recentArrivalCount * SIGNAL_WEIGHTS.recentArrival +
    signals.insideProofEventCount * SIGNAL_WEIGHTS.insideProof;

  const score = Math.min(SCORE_MAX, Math.max(0, raw));

  let state: VenueEnergyState;
  if (score >= STATE_THRESHOLDS.trending) {
    state = "trending";
  } else if (score >= STATE_THRESHOLDS.busy) {
    state = "busy";
  } else if (score >= STATE_THRESHOLDS.building) {
    state = "building";
  } else {
    state = "quiet";
  }

  return { score, state, signals };
}

/**
 * Returns a display label for a VenueEnergyState.
 * Safe to render in UI directly.
 */
export function venueEnergyStateLabel(state: VenueEnergyState): string {
  switch (state) {
    case "trending": return "Trending";
    case "busy":     return "Busy";
    case "building": return "Building";
    case "quiet":    return "Quiet";
  }
}
