import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

interface VenueFollow {
  id: string;
  venue_id: string;
  follow_type: 'follow' | 'pound';
  created_at: string;
}

type FollowedVenue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  | "id"
  | "name"
  | "image_url"
  | "venue_type"
  | "latitude"
  | "longitude"
  | "current_occupancy"
  | "vibe_score"
>;

export const useVenueFollow = (venueId?: string) => {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasPounded, setHasPounded] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [poundCount, setPoundCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchFollowStatus = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      return;
    }

    try {
      // Get counts
      const { count: followCountData } = await supabase
        .from("venue_follows")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("follow_type", "follow");

      const { count: poundCountData } = await supabase
        .from("venue_follows")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("follow_type", "pound");

      setFollowCount(followCountData || 0);
      setPoundCount(poundCountData || 0);

      // Check if user follows/pounds
      if (user) {
        const { data: userFollows } = await supabase
          .from("venue_follows")
          .select("follow_type")
          .eq("venue_id", venueId)
          .eq("user_id", user.id);

        if (userFollows) {
          setIsFollowing(userFollows.some(f => f.follow_type === 'follow'));
          setHasPounded(userFollows.some(f => f.follow_type === 'pound'));
        }
      }
    } catch (error) {
      console.error("Error fetching follow status:", error);
    } finally {
      setLoading(false);
    }
  }, [venueId, user]);

  useEffect(() => {
    fetchFollowStatus();
  }, [fetchFollowStatus]);

  const toggleFollow = async () => {
    if (!user) {
      toast.error("Please sign in to follow venues");
      return;
    }
    if (!venueId) return;

    try {
      if (isFollowing) {
        await supabase
          .from("venue_follows")
          .delete()
          .eq("venue_id", venueId)
          .eq("user_id", user.id)
          .eq("follow_type", "follow");
        setIsFollowing(false);
        setFollowCount(prev => Math.max(0, prev - 1));
        toast.success("Unfollowed venue");
      } else {
        await supabase
          .from("venue_follows")
          .insert({
            venue_id: venueId,
            user_id: user.id,
            follow_type: "follow"
          });
        setIsFollowing(true);
        setFollowCount(prev => prev + 1);
        toast.success("Following venue!");
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      toast.error("Failed to update follow");
    }
  };

  const togglePound = async () => {
    if (!user) {
      toast.error("Please sign in to pound venues");
      return;
    }
    if (!venueId) return;

    try {
      if (hasPounded) {
        await supabase
          .from("venue_follows")
          .delete()
          .eq("venue_id", venueId)
          .eq("user_id", user.id)
          .eq("follow_type", "pound");
        setHasPounded(false);
        setPoundCount(prev => Math.max(0, prev - 1));
      } else {
        await supabase
          .from("venue_follows")
          .insert({
            venue_id: venueId,
            user_id: user.id,
            follow_type: "pound"
          });
        setHasPounded(true);
        setPoundCount(prev => prev + 1);
        toast.success("🤜 Pounded!");
      }
    } catch (error) {
      console.error("Error toggling pound:", error);
      toast.error("Failed to update pound");
    }
  };

  return {
    isFollowing,
    hasPounded,
    followCount,
    poundCount,
    loading,
    toggleFollow,
    togglePound,
    refetch: fetchFollowStatus
  };
};

export const useSavedVenueIds = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [savedVenueIds, setSavedVenueIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingVenueIds, setPendingVenueIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    const loadSavedVenues = async () => {
      if (!userId) {
        if (active) {
          setSavedVenueIds(new Set());
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("venue_follows")
        .select("venue_id")
        .eq("user_id", userId)
        .eq("follow_type", "follow");

      if (!active) return;

      if (error) {
        console.error("Error loading saved venues:", error);
      } else {
        setSavedVenueIds(new Set((data ?? []).map((follow) => follow.venue_id)));
      }

      setLoading(false);
    };

    void loadSavedVenues();

    return () => {
      active = false;
    };
  }, [userId]);

  const toggleSavedVenue = useCallback(async (venueId: string) => {
    if (!userId) {
      toast.error("Please sign in to save venues");
      return;
    }

    if (pendingVenueIds.has(venueId)) return;

    const wasSaved = savedVenueIds.has(venueId);
    setPendingVenueIds((current) => new Set(current).add(venueId));
    setSavedVenueIds((current) => {
      const next = new Set(current);
      if (wasSaved) {
        next.delete(venueId);
      } else {
        next.add(venueId);
      }
      return next;
    });

    const { error } = wasSaved
      ? await supabase
        .from("venue_follows")
        .delete()
        .eq("venue_id", venueId)
        .eq("user_id", userId)
        .eq("follow_type", "follow")
      : await supabase
        .from("venue_follows")
        .insert({ venue_id: venueId, user_id: userId, follow_type: "follow" });

    if (error) {
      console.error("Error updating saved venue:", error);
      setSavedVenueIds((current) => {
        const next = new Set(current);
        if (wasSaved) {
          next.add(venueId);
        } else {
          next.delete(venueId);
        }
        return next;
      });
      toast.error("Failed to update saved venue");
    } else {
      toast.success(wasSaved ? "Venue removed from saved" : "Venue saved");
    }

    setPendingVenueIds((current) => {
      const next = new Set(current);
      next.delete(venueId);
      return next;
    });
  }, [pendingVenueIds, savedVenueIds, userId]);

  return { savedVenueIds, loading, pendingVenueIds, toggleSavedVenue };
};

// Hook to get all followed venues for a user
export const useFollowedVenues = () => {
  const { user } = useAuth();
  const [followedVenues, setFollowedVenues] = useState<FollowedVenue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFollowedVenues = async () => {
      if (!user) {
        setFollowedVenues([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("venue_follows")
          .select(`
            venue_id,
            follow_type,
            venues (
              id,
              name,
              image_url,
              venue_type,
              latitude,
              longitude,
              current_occupancy,
              vibe_score
            )
          `)
          .eq("user_id", user.id)
          .eq("follow_type", "follow");

        if (error) throw error;

        const venues = data
          ?.map((follow) => follow.venues)
          .filter((venue): venue is FollowedVenue => venue !== null) || [];
        
        setFollowedVenues(venues);
      } catch (error) {
        console.error("Error fetching followed venues:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFollowedVenues();
  }, [user]);

  return { followedVenues, loading };
};
