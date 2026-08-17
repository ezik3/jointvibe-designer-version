/**
 * Venue Friend Momentum — Pure Computation Layer
 *
 * Derives a user-facing social momentum result from aggregate counts of
 * how many people the viewer follows are at, heading to, or interested
 * in a given venue.
 *
 * Architecture rules (do not violate):
 * - Zero network calls. Pure computation only.
 * - Only PUBLIC check-ins count toward currently_at (enforced by the
 *   server-side SECURITY DEFINER RPC; this layer just reflects that).
 * - No user identity data flows through this file; only aggregate counts.
 * - Completely isolated from energy scoring, moderation, bans, caution
 *   alerts, incident timelines, and operational notifications.
 *
 * Extension point:
 * - Identity-level previews (e.g., first 2-3 avatars of followed users
 *   who are publicly at the venue) are a documented future extension.
 *   When needed, add a separate `VenueFriendPreview` type and a matching
 *   RPC that returns public profile data for the CURRENTLY_AT subset only.
 *   Intent-signal identities (heading/maybe) must remain aggregate-only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Aggregate friend momentum signal counts for a venue.
 * All counts are identity-free.
 *
 * Privacy invariant:
 *   currentlyAtCount reflects PUBLIC check-ins only.
 *   Private check-ins must never be included here.
 */
export interface VenueFriendMomentumSignals {
  /** Followed users currently checked in with PUBLIC visibility. */
  currentlyAtCount: number;
  /** Followed users with an active heading_there intent signal. */
  headingThereCount: number;
  /** Followed users with an active maybe_going intent signal. */
  maybeGoingCount: number;
  /**
   * Total followed users with any active signal at this venue.
   * Equals currentlyAtCount + headingThereCount + maybeGoingCount.
   */
  totalFriendCount: number;
}

export interface VenueFriendMomentumResult {
  /** Raw aggregate signal counts. */
  signals: VenueFriendMomentumSignals;
  /** True when at least one followed user has any signal at this venue. */
  hasFriendActivity: boolean;
  /**
   * Primary user-facing label summarising the most prominent signal.
   * Empty string when there is no friend activity.
   * Examples:
   *   "2 people you follow are here"
   *   "1 person you follow is heading there"
   *   "3 people you follow are interested"
   *   "2 are here, 1 heading there"
   */
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * Produce a concise, user-facing momentum label from the aggregate counts.
 * Priority order: currently_at > heading_there > maybe_going.
 */
export function buildFriendMomentumLabel(signals: VenueFriendMomentumSignals): string {
  const { currentlyAtCount, headingThereCount, maybeGoingCount } = signals;

  if (currentlyAtCount === 0 && headingThereCount === 0 && maybeGoingCount === 0) {
    return "";
  }

  const parts: string[] = [];

  if (currentlyAtCount > 0) {
    parts.push(
      `${currentlyAtCount} ${pluralise(currentlyAtCount, "person you follow is", "people you follow are")} here`,
    );
  }

  if (headingThereCount > 0) {
    if (currentlyAtCount === 0) {
      // Lead with heading-there when no one is checked in yet
      parts.push(
        `${headingThereCount} ${pluralise(headingThereCount, "person you follow is", "people you follow are")} heading there`,
      );
    } else {
      parts.push(`${headingThereCount} heading there`);
    }
  }

  if (maybeGoingCount > 0 && currentlyAtCount === 0 && headingThereCount === 0) {
    // Only surface maybe-going when there are no stronger signals
    parts.push(
      `${maybeGoingCount} ${pluralise(maybeGoingCount, "person you follow is", "people you follow are")} interested`,
    );
  }

  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute the friend momentum result from aggregate signal counts.
 *
 * @param signals - Aggregate counts from the server-side RPC.
 *                  Must contain only public-check-in counts for currently_at.
 */
export function calculateFriendMomentum(
  signals: VenueFriendMomentumSignals,
): VenueFriendMomentumResult {
  const hasFriendActivity = signals.totalFriendCount > 0;
  const label = buildFriendMomentumLabel(signals);

  return { signals, hasFriendActivity, label };
}

/** Returns a zero-signal baseline (no activity). */
export function emptyFriendMomentumSignals(): VenueFriendMomentumSignals {
  return {
    currentlyAtCount: 0,
    headingThereCount: 0,
    maybeGoingCount: 0,
    totalFriendCount: 0,
  };
}
