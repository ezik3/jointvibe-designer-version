import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";

export interface LiveStream {
  id: string;
  host_user_id: string;
  room_name: string;
  title: string;
  city?: string;
  country?: string;
  venue_id?: string;
  status: string;
  started_at: string;
  preview_image_url?: string;
  host_profile?: {
    display_name?: string;
    avatar_url?: string;
  };
  viewer_count: number;
}

export function useLiveStreams() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStreams = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("live_streams")
        .select("*")
        .eq("status", "live")
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Error fetching live streams:", error);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setStreams([]);
        setLoading(false);
        return;
      }

      // Fetch host profiles
      const hostIds = [...new Set(data.map((s: any) => s.host_user_id))] as string[];
      const { data: profiles } = await supabase
        .from("customer_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", hostIds);

      const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || []);

      // Fetch viewer counts
      const streamIds = data.map((s: any) => s.id);
      const cutoff = new Date(Date.now() - 45000).toISOString();
      const { data: viewers } = await (supabase as any)
        .from("live_stream_viewers")
        .select("stream_id")
        .in("stream_id", streamIds)
        .gte("last_seen_at", cutoff);

      const viewerCounts = new Map<string, number>();
      viewers?.forEach((v: any) => {
        viewerCounts.set(v.stream_id, (viewerCounts.get(v.stream_id) || 0) + 1);
      });

      const enrichedStreams: LiveStream[] = data.map((s: any) => ({
        ...s,
        host_profile: profileMap.get(s.host_user_id) || undefined,
        viewer_count: viewerCounts.get(s.id) || 0,
      }));

      setStreams(enrichedStreams);
      setLoading(false);
    } catch (err) {
      console.error("Error:", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStreams();

    // Real-time subscription handles INSERT / UPDATE / DELETE events —
    // the setInterval polling has been removed to eliminate 15-second
    // background queries on every screen that renders this hook.
    const channel = supabase
      .channel(createRealtimeChannelTopic("live-streams-realtime"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_streams" },
        () => { fetchStreams(); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStreams]);

  return { streams, loading, refetch: fetchStreams };
}
