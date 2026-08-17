/**
 * Post ranking & diversity utilities.
 * Pure functions – no side-effects, no imports from React.
 */

interface RankablePost {
  id: string;
  user_id: string;
  pounds_count: number;
  comments_count: number;
  created_at: string;
  avg_watch_time_ms?: number;
}

/** Compute an engagement + recency score for a single post. */
export function computePostScore<T extends RankablePost>(post: T): number {
  const now = Date.now();
  const created = new Date(post.created_at).getTime();
  const ageHours = (now - created) / (1000 * 60 * 60);

  const pounds = post.pounds_count || 0;
  const comments = post.comments_count || 0;

  const engagementScore = pounds * 1 + comments * 2;
  const recencyBoost = Math.max(0, 24 - ageHours); // posts < 24h get a boost
  const watchBoost = (post.avg_watch_time_ms ?? 0) > 5000 ? 5 : 0;

  return engagementScore + recencyBoost + watchBoost;
}

/** Rank posts by score (descending). Returns a new array. */
export function rankPosts<T extends RankablePost>(posts: T[]): T[] {
  const scored = posts.map((p) => ({ post: p, _score: computePostScore(p) }));
  scored.sort((a, b) => b._score - a._score);
  return scored.map(({ post }) => post);
}

/**
 * Limit each creator to at most `maxPerCreator` posts in the feed.
 * Preserves the existing order.
 */
export function diversifyPosts<T extends RankablePost>(
  posts: T[],
  maxPerCreator = 2,
): T[] {
  const seen = new Map<string, number>();
  const result: T[] = [];

  for (const post of posts) {
    const count = seen.get(post.user_id) || 0;
    if (count < maxPerCreator) {
      result.push(post);
      seen.set(post.user_id, count + 1);
    }
  }

  return result;
}

/** Convenience: rank then diversify. */
export function rankAndDiversify<T extends RankablePost>(
  posts: T[],
  maxPerCreator = 2,
): T[] {
  return diversifyPosts(rankPosts(posts), maxPerCreator);
}
