/**
 * Feed Scoring Algorithm
 * 
 * Scores and sorts feed items using:
 * - Distance (40%): Closer posts rank higher
 * - Recency (35%): Newer posts rank higher, decay after 6-24h
 * - Tier (25%): Higher subscription tiers get a boost
 * - Live boost: Active live streams get +50% score multiplier
 */

export interface ScoredFeedItem {
  type: 'post' | 'live';
  id: string;
  created_at: string;
  latitude?: number;
  longitude?: number;
  tier_rank?: number; // 0=free, 1=basic, 2=premium, 3=top
  is_live_now?: boolean;
  data: any;
  _score?: number;
}

const WEIGHT_DISTANCE = 0.4;
const WEIGHT_RECENCY = 0.35;
const WEIGHT_TIER = 0.25;
const LIVE_BOOST = 1.5;
const MAX_RADIUS_KM = 50;

/** Haversine distance in km */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceScore(
  itemLat?: number,
  itemLng?: number,
  viewerLat?: number,
  viewerLng?: number,
): number {
  if (
    viewerLat == null ||
    viewerLng == null ||
    itemLat == null ||
    itemLng == null
  ) {
    return 0.5; // neutral when location unavailable
  }
  const km = haversineKm(viewerLat, viewerLng, itemLat, itemLng);
  return Math.max(0, 1 - km / MAX_RADIUS_KM);
}

function recencyScore(createdAt: string): number {
  const hoursAgo = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (hoursAgo <= 1) return 1;
  if (hoursAgo <= 6) return 1 - 0.15 * (hoursAgo - 1); // gentle decay 1→0.25 over 5h
  if (hoursAgo <= 24) return 0.25 * Math.exp(-0.1 * (hoursAgo - 6)); // exponential decay
  return 0.1; // floor for older posts
}

function tierScore(tierRank?: number): number {
  const tier = tierRank ?? 0;
  return [0.1, 0.2, 0.4, 0.6, 0.8, 1.0][Math.min(tier, 5)];
}

export function scoreFeedItems(
  items: ScoredFeedItem[],
  viewerLat?: number,
  viewerLng?: number,
): ScoredFeedItem[] {
  const scored = items.map((item) => {
    const d = distanceScore(item.latitude, item.longitude, viewerLat, viewerLng);
    const r = recencyScore(item.created_at);
    const t = tierScore(item.tier_rank);

    let score = d * WEIGHT_DISTANCE + r * WEIGHT_RECENCY + t * WEIGHT_TIER;

    if (item.is_live_now) {
      score *= LIVE_BOOST;
    }

    return { ...item, _score: score };
  });

  // Sort descending by score
  scored.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
  return scored;
}
