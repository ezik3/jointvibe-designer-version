import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";

interface FriendOnMap {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  venueId: string;
  venueName: string;
  venueLatitude: number;
  venueLongitude: number;
  checkedInAt: string;
}

export const useFriendsOnMap = () => {
  const { user } = useAuth();
  const [friendsOnMap, setFriendsOnMap] = useState<FriendOnMap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFriendsOnMap = async () => {
      if (!user) {
        setFriendsOnMap([]);
        setLoading(false);
        return;
      }

      try {
        // Get user's connections (friends)
        const { data: connections, error: connError } = await supabase
          .from("user_connections")
          .select("connected_user_id")
          .eq("user_id", user.id)
          .eq("status", "accepted");

        if (connError) throw connError;

        if (!connections || connections.length === 0) {
          setFriendsOnMap([]);
          setLoading(false);
          return;
        }

        const friendIds = connections.map(c => c.connected_user_id);

        // Get active check-ins for friends
        const { data: checkIns, error: checkInError } = await supabase
          .from("check_ins")
          .select(`
            user_id,
            venue_id,
            checked_in_at,
            venues (
              id,
              name,
              latitude,
              longitude
            )
          `)
          .in("user_id", friendIds)
          .eq("visibility", "public")
          .is("checked_out_at", null);

        if (checkInError) throw checkInError;

        if (!checkIns || checkIns.length === 0) {
          setFriendsOnMap([]);
          setLoading(false);
          return;
        }

        // Get profiles for those friends
        const checkedInFriendIds = [...new Set(checkIns.map(c => c.user_id))];
        
        const { data: profiles, error: profileError } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", checkedInFriendIds);

        if (profileError) throw profileError;

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

        // Combine data
        const friendsData: FriendOnMap[] = checkIns
          .filter(checkIn => {
            const venue = checkIn.venues as any;
            return venue?.latitude && venue?.longitude;
          })
          .map(checkIn => {
            const venue = checkIn.venues as any;
            const profile = profileMap.get(checkIn.user_id);
            
            return {
              userId: checkIn.user_id,
              displayName: profile?.display_name || "Friend",
              avatarUrl: profile?.avatar_url,
              venueId: venue.id,
              venueName: venue.name,
              venueLatitude: venue.latitude,
              venueLongitude: venue.longitude,
              checkedInAt: checkIn.checked_in_at
            };
          });

        setFriendsOnMap(friendsData);
      } catch (error) {
        console.error("Error fetching friends on map:", error);
        setFriendsOnMap([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFriendsOnMap();

    // Subscribe to check-in changes
    const channel = supabase
      .channel(createRealtimeChannelTopic("friends-checkins"))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "check_ins"
        },
        () => {
          fetchFriendsOnMap();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { friendsOnMap, loading };
};
