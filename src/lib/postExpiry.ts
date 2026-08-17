// Helpers for the 24-hour post lifecycle.
// A post is visible on public surfaces (Feed, Top10, Explore, City, Public Posts,
// Venue feed) for 24 hours after `created_at`. After that it must disappear from
// every public surface and be purged server-side unless the owner has saved it
// to their profile.

export const POST_LIFETIME_HOURS = 24;
export const POST_LIFETIME_MS = POST_LIFETIME_HOURS * 60 * 60 * 1000;

/**
 * Hours remaining (0..24) before a post expires.
 * Returns 0 once the post is past its lifetime.
 */
export function hoursRemaining(createdAt?: string | Date | null): number {
  if (!createdAt) return POST_LIFETIME_HOURS;
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const ts = created.getTime();
  if (!Number.isFinite(ts)) return POST_LIFETIME_HOURS;
  const elapsedMs = Date.now() - ts;
  const remainingMs = POST_LIFETIME_MS - elapsedMs;
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
}

/** ISO timestamp 24h ago — use as `.gte("created_at", cutoffIsoForPublicFeeds())` */
export function cutoffIsoForPublicFeeds(): string {
  return new Date(Date.now() - POST_LIFETIME_MS).toISOString();
}
