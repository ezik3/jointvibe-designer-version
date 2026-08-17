/**
 * Simple in-memory cache for performance optimization
 * Used by Top 10 and Explore pages to reduce unnecessary fetches
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class PerformanceCache {
  private cache = new Map<string, CacheEntry<any>>();
  
  /**
   * Get cached data if still valid
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key); // Expired
      return null;
    }
    
    return entry.data as T;
  }
  
  /**
   * Set data in cache with TTL
   */
  set<T>(key: string, data: T, ttl: number = 60000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  /**
   * Clear specific cache key
   */
  clear(key: string): void {
    this.cache.delete(key);
  }
  
  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
  }
  
  /**
   * Check if cache has valid data for key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
}

// Global cache instance
export const performanceCache = new PerformanceCache();

// Cache keys
export const CACHE_KEYS = {
  TOP10_USERS: 'top10:users',
  TOP10_VENUES: 'top10:venues',
  TOP10_POST_IMAGES: 'top10:postImages',
  EXPLORE_TRENDING: 'explore:trending',
  EXPLORE_HOT_VENUES: 'explore:hotVenues',
  EXPLORE_LIVE_STREAMS: 'explore:liveStreams',
  EXPLORE_RISING_CREATORS: 'explore:risingCreators',
  EXPLORE_FOLLOWING: (userId: string) => `explore:following:${userId}`,
  EXPLORE_CITY: (city: string) => `explore:city:${city}`,
  EXPLORE_FOR_YOU: (userId: string) => `explore:foryou:${userId}`,
} as const;