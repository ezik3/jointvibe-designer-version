import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import { recordTierEvent } from "@/hooks/useUserTier";

interface FollowerProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
  followed_at: string;
}

export const useFollowers = (targetUserId?: string) => {
  const { user } = useAuth();
  const [followers, setFollowers] = useState<FollowerProfile[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const userId = targetUserId || user?.id;

  const fetchFollowers = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      // Get follower IDs
      const { data: followData, error: followError } = await supabase
        .from("user_follows")
        .select("follower_id, created_at")
        .eq("following_id", userId);

      if (followError) throw followError;

      setFollowerCount(followData?.length || 0);

      if (followData && followData.length > 0) {
        const followerIds = followData.map(f => f.follower_id);
        
        // Fetch profiles for followers
        const { data: profiles, error: profileError } = await supabase
          .from("customer_profiles")
          .select("id, user_id, display_name, avatar_url, location")
          .in("user_id", followerIds);

        if (profileError) throw profileError;

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        
        const followersWithProfiles: FollowerProfile[] = followData.map(f => {
          const profile = profileMap.get(f.follower_id);
          return {
            id: profile?.id || f.follower_id,
            user_id: f.follower_id,
            display_name: profile?.display_name || null,
            avatar_url: profile?.avatar_url || null,
            location: profile?.location || null,
            followed_at: f.created_at,
          };
        });

        setFollowers(followersWithProfiles);
      } else {
        setFollowers([]);
      }
    } catch (error) {
      console.error("Error fetching followers:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFollowers();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(createRealtimeChannelTopic(`followers-${userId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_follows", filter: `following_id=eq.${userId}` },
        () => fetchFollowers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchFollowers]);

  return { followers, followerCount, loading, refetch: fetchFollowers };
};

export const useFollowing = (targetUserId?: string) => {
  const { user } = useAuth();
  const [following, setFollowing] = useState<FollowerProfile[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const userId = targetUserId || user?.id;

  const fetchFollowing = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      // Get following IDs
      const { data: followData, error: followError } = await supabase
        .from("user_follows")
        .select("following_id, created_at")
        .eq("follower_id", userId);

      if (followError) throw followError;

      setFollowingCount(followData?.length || 0);

      if (followData && followData.length > 0) {
        const followingIds = followData.map(f => f.following_id);
        
        // Fetch profiles for following
        const { data: profiles, error: profileError } = await supabase
          .from("customer_profiles")
          .select("id, user_id, display_name, avatar_url, location")
          .in("user_id", followingIds);

        if (profileError) throw profileError;

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        
        const followingWithProfiles: FollowerProfile[] = followData.map(f => {
          const profile = profileMap.get(f.following_id);
          return {
            id: profile?.id || f.following_id,
            user_id: f.following_id,
            display_name: profile?.display_name || null,
            avatar_url: profile?.avatar_url || null,
            location: profile?.location || null,
            followed_at: f.created_at,
          };
        });

        setFollowing(followingWithProfiles);
      } else {
        setFollowing([]);
      }
    } catch (error) {
      console.error("Error fetching following:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFollowing();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(createRealtimeChannelTopic(`following-${userId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_follows", filter: `follower_id=eq.${userId}` },
        () => fetchFollowing()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchFollowing]);

  return { following, followingCount, loading, refetch: fetchFollowing };
};

export const useFollowActions = () => {
  const { user } = useAuth();
  const [isFollowingMap, setIsFollowingMap] = useState<Record<string, boolean>>({});

  const checkIsFollowing = useCallback(async (targetUserId: string) => {
    if (!user || !targetUserId || targetUserId === user.id) return false;

    const { data, error } = await supabase
      .from("user_follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId)
      .maybeSingle();

    if (error) {
      console.error("Error checking follow status:", error);
      return false;
    }

    const isFollowing = !!data;
    setIsFollowingMap(prev => ({ ...prev, [targetUserId]: isFollowing }));
    return isFollowing;
  }, [user]);

  const follow = useCallback(async (targetUserId: string) => {
    if (!user || !targetUserId || targetUserId === user.id) return false;

    const { error } = await supabase
      .from("user_follows")
      .insert({ follower_id: user.id, following_id: targetUserId });

    if (error) {
      if (error.message.includes("duplicate")) {
        setIsFollowingMap(prev => ({ ...prev, [targetUserId]: true }));
        return true;
      }
      console.error("Error following user:", error);
      return false;
    }

    setIsFollowingMap(prev => ({ ...prev, [targetUserId]: true }));
    // Record tier event for the user being followed (they gain a follower)
    recordTierEvent(targetUserId, "new_follower", { follower_id: user.id });
    return true;
  }, [user]);

  const unfollow = useCallback(async (targetUserId: string) => {
    if (!user || !targetUserId) return false;

    const { error } = await supabase
      .from("user_follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId);

    if (error) {
      console.error("Error unfollowing user:", error);
      return false;
    }

    setIsFollowingMap(prev => ({ ...prev, [targetUserId]: false }));
    return true;
  }, [user]);

  const toggleFollow = useCallback(async (targetUserId: string) => {
    const isCurrentlyFollowing = isFollowingMap[targetUserId];
    if (isCurrentlyFollowing) {
      return unfollow(targetUserId);
    } else {
      return follow(targetUserId);
    }
  }, [isFollowingMap, follow, unfollow]);

  return { 
    isFollowingMap, 
    checkIsFollowing, 
    follow, 
    unfollow, 
    toggleFollow 
  };
};
