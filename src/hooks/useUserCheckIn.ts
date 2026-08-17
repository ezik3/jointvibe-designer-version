import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CheckIn {
  id: string;
  venueId: string;
  venueName?: string;
  visibility: "public" | "private";
  visibilitySelectionStatus: "pending" | "selected" | "defaulted_private";
  visibilitySelectionDeadline?: string | null;
  verificationState?: string;
  checkinEntrySource?: string;
}

export const useUserCheckIn = () => {
  const { user } = useAuth();
  const [currentCheckIn, setCurrentCheckIn] = useState<CheckIn | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    const userId = user?.id;

    if (!userId) {
      setCurrentCheckIn(null);
      setLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    const fetchCurrentCheckIn = async () => {
      try {
        const { data, error } = await supabase
          .from("check_ins")
          .select(`
            id,
            venue_id,
            visibility,
            venues (name)
          `)
          .eq("user_id", userId)
          .is("checked_out_at", null)
          .order("checked_in_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (!isCurrent) return;

        if (data) {
          setCurrentCheckIn({
            id: data.id,
            venueId: data.venue_id,
            venueName: data.venues?.name || undefined,
            visibility: data.visibility === "public" ? "public" : "private",
            visibilitySelectionStatus: "selected",
            visibilitySelectionDeadline: null,
            verificationState: undefined,
            checkinEntrySource: undefined,
          });
        } else {
          setCurrentCheckIn(null);
        }
      } catch (error) {
        if (isCurrent) {
          console.error("Error fetching check-in:", error);
          setCurrentCheckIn(null);
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    void fetchCurrentCheckIn();

    // RealtimeClient returns an existing channel for matching topics. The customer
    // layout and feed can both consume this hook, and StrictMode replays effects.
    // Keep every subscription topic distinct so callbacks are registered before
    // that channel is subscribed, rather than on a reused subscribed channel.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      channel = supabase
        .channel(`user-checkin-${userId}-${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "check_ins",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void fetchCurrentCheckIn();
          }
        )
        .subscribe();
    } catch (error) {
      console.error("[useUserCheckIn] Failed to subscribe to check-in updates:", error);
    }

    return () => {
      isCurrent = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const isCheckedInAt = (venueId: string): boolean => {
    return currentCheckIn?.venueId === venueId;
  };

  return {
    currentCheckIn,
    isCheckedInAt,
    loading
  };
};
