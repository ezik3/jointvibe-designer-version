import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { performanceCache, CACHE_KEYS } from "@/utils/cache";

interface TrendingPost {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
  author_name?: string;
  author_avatar?: string;
  author_tier?: string;
  venue_name?: string;
}

interface HotVenue {
  id: string;
  name: string;
  image_url?: string;
  city?: string;
  activity_score: number;
  check_ins_count: number;
  current_occupancy: number;
}

interface LiveStream {
  id: string;
  content: string;
  video_url?: string;
  user_id: string;
  author_name?: string;
  author_avatar?: string;
  venue_name?: string;
  viewer_count: number;
}

interface RisingCreator {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string;
  location?: string;
  follower_count: number;
  recent_posts_count: number;
}

export const useExploreData = (userCity?: string) => {
  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);
  const [hotVenues, setHotVenues] = useState<HotVenue[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [risingCreators, setRisingCreators] = useState<RisingCreator[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrendingPosts = useCallback(async () => {
    try {
      // Check cache first
      const cachedTrending = performanceCache.get<TrendingPost[]>(CACHE_KEYS.EXPLORE_TRENDING);
      if (cachedTrending) {
        setTrendingPosts(cachedTrending);
        return;
      }

      // Get posts from last 24 hours, ordered by engagement
      const { data: posts, error } = await supabase
        .from("posts")
        .select("*")
        .eq("visibility", "public")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("pounds_count", { ascending: false })
        .order("comments_count", { ascending: false })
        .limit(10);

      if (error) throw error;

      if (posts && posts.length > 0) {
        const userIds = [...new Set(posts.map(p => p.user_id))];
        
        // Parallel fetch: profiles and tiers
        const [profilesResult, tiersResult] = await Promise.all([
          supabase
            .from("customer_profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", userIds),
          supabase
            .from("user_tiers")
            .select("user_id, current_tier")
            .in("user_id", userIds)
        ]);

        const profileMap = new Map(profilesResult.data?.map(p => [p.user_id, p]) || []);
        const tierMap = new Map(tiersResult.data?.map((t: any) => [t.user_id, t.current_tier]) || []);

        const trendingWithProfiles = posts.map(post => ({
          ...post,
          author_name: profileMap.get(post.user_id)?.display_name || "Anonymous",
          author_avatar: profileMap.get(post.user_id)?.avatar_url,
          author_tier: tierMap.get(post.user_id) || undefined,
        }));

        setTrendingPosts(trendingWithProfiles);
        // Cache for 60 seconds
        performanceCache.set(CACHE_KEYS.EXPLORE_TRENDING, trendingWithProfiles, 60000);
      }
    } catch (error) {
      console.error("Error fetching trending posts:", error);
    }
  }, []);

  const fetchHotVenues = useCallback(async () => {
    try {
      // Check cache first
      const cachedHotVenues = performanceCache.get<HotVenue[]>(CACHE_KEYS.EXPLORE_HOT_VENUES);
      if (cachedHotVenues) {
        setHotVenues(cachedHotVenues);
        return;
      }

      // Get venues with recent check-ins (fetch more to allow geo filtering)
      const { data: venues, error } = await supabase
        .from("venues")
        .select("id, name, image_url, city, country, current_occupancy")
        .eq("approval_status", "approved")
        .eq("venue_status", "live")
        .not("verified_at", "is", null)
        .order("current_occupancy", { ascending: false })
        .limit(50);

      if (error) throw error;

      if (venues) {
        // Parallel fetch: venue tiers and classifications
        const venueIds = venues.map(v => v.id);
        const [tiersResult, classesResult] = await Promise.all([
          (supabase as any)
            .from("venue_tier_scores")
            .select("venue_id, current_tier")
            .in("venue_id", venueIds),
          (supabase as any)
            .from("venue_classifications")
            .select("venue_id, country_code, city")
            .in("venue_id", venueIds)
        ]);

        const tierMap = new Map<string, string>(
          (tiersResult.data || []).map((t: any) => [t.venue_id, t.current_tier])
        );
        const classMap = new Map<string, { country_code: string; city: string | null }>(
          (classesResult.data || []).map((c: any) => [c.venue_id, { country_code: c.country_code, city: c.city }])
        );

        const TIER_BOOST: Record<string, number> = {
          bronze: 1.0,
          silver: 1.15,
          gold: 1.30,
          diamond: 1.50,
          platinum: 1.75,
        };

        // Geographic reach: which tiers can appear outside user's city
        // bronze/silver = city only, gold = country, diamond = country, platinum = global
        const userCityLower = userCity?.toLowerCase() || "";

        const filteredVenues = venues.filter(venue => {
          const tier = tierMap.get(venue.id) || "bronze";
          const venueCity = (venue.city || classMap.get(venue.id)?.city || "").toLowerCase();
          const sameCity = !userCityLower || venueCity === userCityLower || venueCity.includes(userCityLower) || userCityLower.includes(venueCity);

          if (sameCity) return true; // always show same-city venues
          // Out-of-city: check tier-based reach
          if (tier === "platinum") return true; // global
          if (tier === "diamond" || tier === "gold") {
            // Country-level: show if same country
            const venueCountry = (venue.country || classMap.get(venue.id)?.country_code || "").toLowerCase();
            // Simple heuristic: if user city is known but country isn't, allow
            return true; // country+ reach — we don't have user country easily, so allow
          }
          // silver/bronze: city-only — exclude out-of-city venues
          return false;
        });

        // Calculate activity scores with tier boost
        const hotVenuesWithScores = filteredVenues.map(venue => {
          const tier = tierMap.get(venue.id) || "bronze";
          const boost = TIER_BOOST[tier] || 1.0;
          return {
            id: venue.id,
            name: venue.name,
            image_url: venue.image_url,
            city: venue.city,
            current_occupancy: venue.current_occupancy,
            activity_score: Math.round(venue.current_occupancy * 10 * boost),
            check_ins_count: venue.current_occupancy,
          };
        });

        // Re-sort by boosted activity_score
        hotVenuesWithScores.sort((a, b) => b.activity_score - a.activity_score);

        const finalHotVenues = hotVenuesWithScores.slice(0, 10);
        setHotVenues(finalHotVenues);
        // Cache for 60 seconds
        performanceCache.set(CACHE_KEYS.EXPLORE_HOT_VENUES, finalHotVenues, 60000);
      }
    } catch (error) {
      console.error("Error fetching hot venues:", error);
    }
  }, [userCity]);

  const fetchLiveStreams = useCallback(async () => {
    try {
      // Check cache first
      const cachedLiveStreams = performanceCache.get<LiveStream[]>(CACHE_KEYS.EXPLORE_LIVE_STREAMS);
      if (cachedLiveStreams) {
        setLiveStreams(cachedLiveStreams);
        return;
      }

      // Get actual live streams from live_streams table
      const { data: streams, error } = await (supabase as any)
        .from("live_streams")
        .select("*")
        .eq("status", "live")
        .order("started_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      if (streams && streams.length > 0) {
        const hostIds = [...new Set(streams.map((s: any) => s.host_user_id))] as string[];
        const streamIds = streams.map((s: any) => s.id);
        
        // Parallel fetch: profiles and viewer counts
        const cutoff = new Date(Date.now() - 45000).toISOString();
        const [profilesResult, viewersResult] = await Promise.all([
          supabase
            .from("customer_profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", hostIds),
          (supabase as any)
            .from("live_stream_viewers")
            .select("stream_id")
            .in("stream_id", streamIds)
            .gte("last_seen_at", cutoff)
        ]);

        const profileMap = new Map(profilesResult.data?.map(p => [p.user_id, p]) || []);

        const viewerCounts = new Map<string, number>();
        viewersResult.data?.forEach((v: any) => {
          viewerCounts.set(v.stream_id, (viewerCounts.get(v.stream_id) || 0) + 1);
        });

        const liveWithProfiles: LiveStream[] = streams.map((stream: any) => ({
          id: stream.id,
          content: stream.title || "Live Stream",
          video_url: undefined,
          user_id: stream.host_user_id,
          author_name: profileMap.get(stream.host_user_id)?.display_name || "Anonymous",
          author_avatar: profileMap.get(stream.host_user_id)?.avatar_url,
          venue_name: undefined,
          viewer_count: viewerCounts.get(stream.id) || 0,
        }));

        setLiveStreams(liveWithProfiles);
        // Cache for 30 seconds (live streams change frequently)
        performanceCache.set(CACHE_KEYS.EXPLORE_LIVE_STREAMS, liveWithProfiles, 30000);
      } else {
        setLiveStreams([]);
      }
    } catch (error) {
      console.error("Error fetching live streams:", error);
    }
  }, []);

  const fetchRisingCreators = useCallback(async () => {
    try {
      // Check cache first
      const cachedRisingCreators = performanceCache.get<RisingCreator[]>(CACHE_KEYS.EXPLORE_RISING_CREATORS);
      if (cachedRisingCreators) {
        setRisingCreators(cachedRisingCreators);
        return;
      }

      // Get users with most followers gained recently
      const { data: follows, error: followError } = await supabase
        .from("user_follows")
        .select("following_id, created_at")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (followError) throw followError;

      if (follows && follows.length > 0) {
        // Count followers per user
        const followerCounts = new Map<string, number>();
        follows.forEach(f => {
          const count = followerCounts.get(f.following_id) || 0;
          followerCounts.set(f.following_id, count + 1);
        });

        // Sort by follower count
        const sortedUsers = Array.from(followerCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        const userIds = sortedUsers.map(([userId]) => userId);

        // Fetch profiles and recent posts count in parallel
        const [profilesResult, postsResult] = await Promise.all([
          supabase
            .from("customer_profiles")
            .select("id, user_id, display_name, avatar_url, location")
            .in("user_id", userIds),
          supabase
            .from("posts")
            .select("user_id")
            .in("user_id", userIds)
            .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        ]);

        if (profilesResult.data) {
          // Count posts per user
          const postCounts = new Map<string, number>();
          postsResult.data?.forEach(p => {
            const count = postCounts.get(p.user_id) || 0;
            postCounts.set(p.user_id, count + 1);
          });

          const rising = sortedUsers.map(([userId, count]) => {
            const profile = profilesResult.data.find(p => p.user_id === userId);
            return {
              id: profile?.id || userId,
              user_id: userId,
              display_name: profile?.display_name || "Anonymous",
              avatar_url: profile?.avatar_url,
              location: profile?.location,
              follower_count: count,
              recent_posts_count: postCounts.get(userId) || 0,
            };
          });

          setRisingCreators(rising);
          // Cache for 60 seconds
          performanceCache.set(CACHE_KEYS.EXPLORE_RISING_CREATORS, rising, 60000);
        }
      }
    } catch (error) {
      console.error("Error fetching rising creators:", error);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchTrendingPosts(),
      fetchHotVenues(),
      fetchLiveStreams(),
      fetchRisingCreators(),
    ]);
    setLoading(false);
  }, [fetchTrendingPosts, fetchHotVenues, fetchLiveStreams, fetchRisingCreators]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    trendingPosts,
    hotVenues,
    liveStreams,
    risingCreators,
    loading,
    refetch: fetchAll,
  };
};

export const useFollowingFeed = (enabled = true) => {
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFollowingFeed = useCallback(async () => {
    if (!enabled) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Get who user follows (exclude self — Following must never show your own posts)
      const { data: follows } = await supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", user.id);

      const followingIds = (follows?.map(f => f.following_id) || []).filter(
        (id) => id && id !== user.id
      );

      if (followingIds.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // Get posts from followed users (24h lifetime)
      const { data: feedPosts, error } = await supabase
        .from("posts")
        .select("*")
        .in("user_id", followingIds)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      if (feedPosts && feedPosts.length > 0) {
        const { data: profiles } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", followingIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

        // Fetch tiers
        const { data: tierRows } = await supabase
          .from("user_tiers")
          .select("user_id, current_tier")
          .in("user_id", followingIds);
        const tierMap = new Map(tierRows?.map((t: any) => [t.user_id, t.current_tier]) || []);

        const feedWithProfiles = feedPosts.map(post => ({
          ...post,
          author_name: profileMap.get(post.user_id)?.display_name || "Anonymous",
          author_avatar: profileMap.get(post.user_id)?.avatar_url,
          author_tier: tierMap.get(post.user_id) || undefined,
        }));

        setPosts(feedWithProfiles);
      }
    } catch (error) {
      console.error("Error fetching following feed:", error);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      fetchFollowingFeed();
    } else {
      // Clear data when disabled to save memory
      setPosts([]);
      setLoading(true);
    }
  }, [fetchFollowingFeed, enabled]);

  return { posts, loading, refetch: fetchFollowingFeed };
};
