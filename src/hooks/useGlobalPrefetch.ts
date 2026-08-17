import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// Global cache for instant page loads
export const globalCache = {
  posts: null as any[] | null,
  venues: null as any[] | null,
  topUsers: null as any[] | null,
  notifications: null as any[] | null,
  messages: null as any[] | null,
  publicPosts: null as any[] | null, // For City View
  publicPostsWithProfiles: null as any[] | null, // For City View with profiles
  trendingPosts: null as any[] | null, // For Explore
  hotVenues: null as any[] | null, // For Explore
  liveStreams: null as any[] | null, // For Explore
  risingCreators: null as any[] | null, // For Explore
  userProfiles: new Map<string, any>(), // Profile cache
  top10PostImages: new Map<string, string>(), // Top 10 user post images
  lastFetch: {
    posts: 0,
    venues: 0,
    topUsers: 0,
    notifications: 0,
    messages: 0,
    publicPosts: 0,
    publicPostsWithProfiles: 0,
    trendingPosts: 0,
    hotVenues: 0,
    liveStreams: 0,
    risingCreators: 0,
    top10PostImages: 0,
  },
  // Track if initial prefetch is complete
  initialPrefetchDone: false,
};

const CACHE_TTL = 60_000; // 1 minute cache validity

// Persist City View data so it can render instantly "from last visit"
const CITY_CACHE_KEY = "jv_cache_city_view_v1";
const CITY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

type CityCachePayload = {
  ts: number;
  publicPosts: any[] | null;
  publicPostsWithProfiles: any[] | null;
};

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const loadCityCacheFromStorage = () => {
  try {
    const payload = safeJsonParse<CityCachePayload>(localStorage.getItem(CITY_CACHE_KEY));
    if (!payload) return;
    if (!payload.ts || Date.now() - payload.ts > CITY_CACHE_TTL) return;

    if (payload.publicPostsWithProfiles?.length) {
      globalCache.publicPostsWithProfiles = payload.publicPostsWithProfiles;
      globalCache.lastFetch.publicPostsWithProfiles = payload.ts;
    }

    if (payload.publicPosts?.length) {
      globalCache.publicPosts = payload.publicPosts;
      globalCache.lastFetch.publicPosts = payload.ts;
    }
  } catch {
    // ignore
  }
};

const saveCityCacheToStorage = () => {
  try {
    const payload: CityCachePayload = {
      ts: Date.now(),
      publicPosts: globalCache.publicPosts,
      publicPostsWithProfiles: globalCache.publicPostsWithProfiles,
    };
    localStorage.setItem(CITY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

// Hydrate cache immediately (synchronous) so City View can render instantly.
loadCityCacheFromStorage();

// Keep selects lean to avoid timeouts and improve performance.
const FEED_POST_SELECT =
  "id, user_id, venue_id, content, image_url, video_url, pounds_count, comments_count, created_at, visibility, post_type, is_live";
const PUBLIC_POST_SELECT =
  "id, user_id, content, image_url, video_url, post_type, is_live, created_at, pounds_count, comments_count";

const attachProfilesToPublicPosts = async (posts: any[]): Promise<void> => {
  const userIdSet = new Set<string>();
  posts.forEach((p: any) => userIdSet.add(String(p.user_id)));
  const userIds = Array.from(userIdSet) as readonly string[];
  if (userIds.length === 0) return;

  // Query both customer_profiles and profiles tables for fallback
  const [{ data: customerProfiles }, { data: profilesFallback }] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select("user_id, display_name, avatar_url, age, relationship_status, location, connection_count")
      .in("user_id", userIds),
    supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds),
  ]);

  const customerProfileMap = new Map(customerProfiles?.map((p) => [p.user_id, p]) || []);
  const fallbackMap = new Map(profilesFallback?.map((p) => [p.user_id, p]) || []);

  globalCache.publicPostsWithProfiles = posts.map((post) => {
    const customerProfile = customerProfileMap.get(post.user_id);
    const fallback = fallbackMap.get(post.user_id);
    
    // Merge data - prioritize customer_profiles but fallback to profiles table
    const displayName = customerProfile?.display_name?.trim() || fallback?.full_name?.trim() || null;
    const avatarUrl = (customerProfile?.avatar_url && customerProfile.avatar_url !== '/placeholder.svg') 
      ? customerProfile.avatar_url 
      : (fallback?.avatar_url || null);
    
    return {
      ...post,
      profile: {
        ...(customerProfile || {}),
        display_name: displayName,
        avatar_url: avatarUrl,
      },
    };
  });
  globalCache.lastFetch.publicPostsWithProfiles = Date.now();
  saveCityCacheToStorage();
};

// Track the in-flight module-level prefetch so the React hook can await it
// before deciding whether a query still needs to run. Without this, the hook
// fires the same 6 queries again ~50 ms after module load because the async
// results haven't resolved and globalCache entries are still null.
let _modulePrefetchPromise: Promise<void> | null = null;

// Prefetch all critical data immediately on module load
const prefetchAllImmediately = async () => {
  try {
    // Parallel fetch all critical data including City View posts
    const [
      postsResult,
      venuesResult,
      topUsersResult,
      trendingResult,
      hotVenuesResult,
      publicPostsResult,
    ] = await Promise.all([
      // Posts for feed (24h lifecycle)
      globalCache.posts
        ? Promise.resolve({ data: null })
        : supabase
            .from("posts")
            .select(FEED_POST_SELECT)
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(20),

      // Venues for maps and explore
      globalCache.venues
        ? Promise.resolve({ data: null })
        : supabase
            .from("venues")
            .select(
              "id, name, image_url, city, country, venue_type, vibe_score, description, latitude, longitude, delivery_enabled, max_delivery_radius_km, reservations_enabled, capacity, current_occupancy, address",
            )
            .eq("approval_status", "approved")
            .order("vibe_score", { ascending: false })
            .limit(50),

      // Top users
      globalCache.topUsers
        ? Promise.resolve({ data: null })
        : supabase.from("top_users_by_pounds").select("*").order("total_pounds", { ascending: false }).limit(10),

      // Trending posts for explore
      globalCache.trendingPosts
        ? Promise.resolve({ data: null })
        : supabase
            .from("posts")
            .select(PUBLIC_POST_SELECT)
            .eq("visibility", "public")
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order("pounds_count", { ascending: false })
            .limit(20),

      // Hot venues for explore
      globalCache.hotVenues
        ? Promise.resolve({ data: null })
        : supabase
            .from("venues")
            .select("id, name, image_url, city, current_occupancy")
            .eq("approval_status", "approved")
            .order("current_occupancy", { ascending: false })
            .limit(10),

      // Public posts for City View - prefetch immediately (24h lifecycle)
      globalCache.publicPosts
        ? Promise.resolve({ data: null })
        : supabase
            .from("posts")
            .select(PUBLIC_POST_SELECT)
            .eq("visibility", "public")
            .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(30),
    ]);

    const now = Date.now();

    // Process posts
    if (postsResult.data && postsResult.data.length > 0) {
      globalCache.posts = postsResult.data;
      globalCache.lastFetch.posts = now;

      // Fetch profiles in background
      const userIdSet = new Set<string>();
      postsResult.data.forEach((p: any) => userIdSet.add(String(p.user_id)));
      const userIds = Array.from(userIdSet) as readonly string[];
      supabase
        .from("customer_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds)
        .then(({ data: profiles }) => {
          if (profiles && globalCache.posts) {
            const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
            globalCache.posts = globalCache.posts.map((post) => ({
              ...post,
              customer_profiles: profileMap.get(post.user_id) || null,
            }));
          }
        });
    }

    // Process venues
    if (venuesResult.data) {
      globalCache.venues = venuesResult.data;
      globalCache.lastFetch.venues = now;
    }

    // Process top users and prefetch their post images
    if (topUsersResult.data) {
      globalCache.topUsers = topUsersResult.data;
      globalCache.lastFetch.topUsers = now;
      
      // Immediately fetch post images for top users
      const userIds = topUsersResult.data.map((u: any) => u.user_id).filter(Boolean);
      if (userIds.length > 0) {
        try {
          const { data: postsData } = await supabase
            .from('posts')
            .select('user_id, image_url, video_url, pounds_count')
            .in('user_id', userIds)
            .eq('visibility', 'public')
            .order('pounds_count', { ascending: false });

          if (postsData) {
            postsData.forEach((post: any) => {
              if (!globalCache.top10PostImages.has(post.user_id)) {
                const mediaUrl = post.image_url || post.video_url;
                if (mediaUrl && mediaUrl.length > 0) {
                  globalCache.top10PostImages.set(post.user_id, mediaUrl);
                }
              }
            });
            globalCache.lastFetch.top10PostImages = now;
          }
        } catch {
          // ignore
        }
      }
    }

    // Process trending posts
    if (trendingResult.data) {
      globalCache.trendingPosts = trendingResult.data;
      globalCache.lastFetch.trendingPosts = now;
    }

    // Process hot venues
    if (hotVenuesResult.data) {
      globalCache.hotVenues = hotVenuesResult.data.map((v: any) => ({
        ...v,
        activity_score: v.current_occupancy * 10,
        check_ins_count: v.current_occupancy,
      }));
      globalCache.lastFetch.hotVenues = now;
    }

    // Process public posts for City View with profiles - AWAIT to ensure profiles are ready
    if (publicPostsResult.data && publicPostsResult.data.length > 0) {
      globalCache.publicPosts = publicPostsResult.data;
      globalCache.lastFetch.publicPosts = now;
      
      // Attach profiles eagerly and AWAIT so CityView can render real avatars/names immediately
      try {
        await attachProfilesToPublicPosts(publicPostsResult.data);
      } catch {
        // ignore but still save cache
        saveCityCacheToStorage();
      }
    }

    globalCache.initialPrefetchDone = true;
  } catch (err) {
    console.error("Prefetch error:", err);
  }
};

// Start prefetching immediately when this module is loaded.
// Store the promise so the hook can await it and avoid duplicate fetches.
_modulePrefetchPromise = prefetchAllImmediately();

export function useGlobalPrefetch(userId?: string) {
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;

    // Prefetch all data in parallel on app mount.
    // First await the module-level prefetch so we don't fire duplicate
    // queries for data that is already being fetched or was just stored.
    const prefetchAll = async () => {
      if (_modulePrefetchPromise) {
        await _modulePrefetchPromise;
      }
      const now = Date.now();

      // Prefetch posts (for Feed) — 24h lifecycle
      if (!globalCache.posts || now - globalCache.lastFetch.posts > CACHE_TTL) {
        supabase
          .from("posts")
          .select(FEED_POST_SELECT)
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(20)
          .then(({ data }) => {
            if (data) {
              globalCache.posts = data;
              globalCache.lastFetch.posts = Date.now();
            }
          });
      }

      // Prefetch venues (for Venues page) - fetched sorted by vibe_score for instant display
      if (!globalCache.venues || now - globalCache.lastFetch.venues > CACHE_TTL) {
        supabase
          .from("venues")
          .select(
            "id, name, image_url, city, country, venue_type, vibe_score, description, latitude, longitude, delivery_enabled, max_delivery_radius_km, reservations_enabled, capacity, current_occupancy, address",
          )
          .eq("approval_status", "approved")
          .order("vibe_score", { ascending: false })
          .limit(50)
          .then(({ data }) => {
            if (data) {
              globalCache.venues = data;
              globalCache.lastFetch.venues = Date.now();
            }
          });
      }

      // Prefetch top users (for Top10) using the optimized view
      if (!globalCache.topUsers || now - globalCache.lastFetch.topUsers > CACHE_TTL) {
        supabase
          .from("top_users_by_pounds")
          .select("*")
          .order("total_pounds", { ascending: false })
          .limit(10)
          .then(({ data }) => {
            if (data) {
              globalCache.topUsers = data;
              globalCache.lastFetch.topUsers = Date.now();
            }
          });
      }

      // Prefetch public posts (for City View) — 24h lifecycle
      if (!globalCache.publicPosts || now - globalCache.lastFetch.publicPosts > CACHE_TTL) {
        supabase
          .from("posts")
          .select(PUBLIC_POST_SELECT)
          .eq("visibility", "public")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(30)
          .then(({ data }) => {
            if (data) {
              globalCache.publicPosts = data;
              globalCache.lastFetch.publicPosts = Date.now();
              saveCityCacheToStorage();
              attachProfilesToPublicPosts(data).catch(() => {
                // ignore
              });
            }
          });
      }

      // Prefetch notifications if user is logged in
      if (userId && (!globalCache.notifications || now - globalCache.lastFetch.notifications > CACHE_TTL)) {
        supabase
          .from("customer_notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20)
          .then(({ data }) => {
            if (data) {
              globalCache.notifications = data;
              globalCache.lastFetch.notifications = Date.now();
            }
          });
      }
    };

    prefetchAll();
  }, [userId]);
}

// Hook to get cached data with fallback fetch
export function useCachedData<T>(
  key: keyof typeof globalCache,
  fetcher: () => Promise<T[] | null>,
  deps: any[] = [],
) {
  const cached = globalCache[key] as T[] | null;

  return {
    initialData: cached,
    refetch: async () => {
      const data = await fetcher();
      if (data) {
        (globalCache as any)[key] = data;
        (globalCache.lastFetch as any)[key] = Date.now();
      }
      return data;
    },
  };
}

// Pre-cache user profile for instant profile page
export function cacheUserProfile(userId: string, profile: any) {
  globalCache.userProfiles.set(userId, profile);
}

export function getCachedUserProfile(userId: string) {
  return globalCache.userProfiles.get(userId);
}
