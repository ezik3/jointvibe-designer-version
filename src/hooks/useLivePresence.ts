import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";

export interface LivePresenceStream {
  id: string;
  host_user_id: string;
  room_name: string;
  title: string;
  city?: string;
  country?: string;
  venue_id?: string;
  status: string;
  started_at: string;
  host_name?: string;
  host_avatar?: string;
  viewer_count: number;
}

// ── Global singleton state so every consumer shares the same data ──
let globalStreams: LivePresenceStream[] = [];
let globalLoading = true;
let globalLastEvent = "";
let globalRealtimeStatus = "INIT";
const listeners = new Set<() => void>();
let channelRef: ReturnType<typeof supabase.channel> | null = null;
let channelId = 0; // Track which channel is "current" to ignore stale callbacks
let pollRef: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const MAX_RETRIES = 5;

const notify = () => listeners.forEach((fn) => fn());

const fetchStreams = async () => {
  try {
    const { data, error } = await (supabase as any)
      .from("live_streams")
      .select("*")
      .eq("status", "live")
      .order("started_at", { ascending: false });

    if (error) {
      console.error("[useLivePresence] fetch error:", error);
      return;
    }

    if (!data || data.length === 0) {
      globalStreams = [];
      globalLoading = false;
      notify();
      return;
    }

    // Fetch host profiles
    const hostIds = [...new Set(data.map((s: any) => s.host_user_id))] as string[];
    const { data: profiles } = await supabase
      .from("customer_profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", hostIds);

    const profileMap = new Map(
      profiles?.map((p: any) => [p.user_id, p]) || []
    );

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

    const enriched: LivePresenceStream[] = data.map((s: any) => ({
      ...s,
      host_name: profileMap.get(s.host_user_id)?.display_name || "Anonymous",
      host_avatar: profileMap.get(s.host_user_id)?.avatar_url || undefined,
      viewer_count: viewerCounts.get(s.id) || 0,
    }));

    globalStreams = enriched;
    globalLoading = false;
    notify();
  } catch (err) {
    console.error("[useLivePresence] fetch error:", err);
    globalLoading = false;
    notify();
  }
};

const createChannel = () => {
  // Remove old channel without triggering retry (increment channelId first)
  const myId = ++channelId;

  if (channelRef) {
    supabase.removeChannel(channelRef);
    channelRef = null;
  }

  channelRef = supabase
    .channel(createRealtimeChannelTopic("live-presence-global"))
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_streams" },
      (payload) => {
        if (myId !== channelId) return; // stale channel
        console.log("[useLivePresence] realtime event:", payload.eventType);
        globalLastEvent = new Date().toISOString();
        retryCount = 0; // reset on successful event
        fetchStreams();
      }
    )
    .subscribe((status) => {
      if (myId !== channelId) return; // stale channel callback, ignore

      console.log("[useLivePresence] channel status:", status);
      if (status === "SUBSCRIBED") {
        globalRealtimeStatus = "SUBSCRIBED";
        retryCount = 0; // successful subscription
        // Disable polling when realtime is working
        if (pollRef) {
          clearInterval(pollRef);
          pollRef = null;
        }
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
        globalRealtimeStatus = "ERROR";
        
        // Enable polling when realtime fails
        if (!pollRef && subscriberCount > 0) {
          pollRef = setInterval(fetchStreams, 60000);
        }

        // Only retry if this is still the current channel and we haven't exceeded max retries
        if (myId === channelId && subscriberCount > 0 && retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = Math.min(3000 * Math.pow(2, retryCount - 1), 30000); // exponential backoff, max 30s
          console.warn(`[useLivePresence] channel failed, retry ${retryCount}/${MAX_RETRIES} in ${delay}ms`);
          
          if (retryTimeout) clearTimeout(retryTimeout);
          retryTimeout = setTimeout(() => {
            if (subscriberCount > 0 && myId === channelId) {
              createChannel();
            }
          }, delay);
        } else if (retryCount >= MAX_RETRIES) {
          console.warn("[useLivePresence] max retries reached, falling back to polling only");
          globalRealtimeStatus = "POLLING_ONLY";
          // Ensure polling is active
          if (!pollRef && subscriberCount > 0) {
            pollRef = setInterval(fetchStreams, 60000);
          }
        }
      } else {
        globalRealtimeStatus = "CONNECTING";
      }
      notify();
    });
};

const startGlobalSubscription = () => {
  if (channelRef) return; // already started

  // Initial fetch
  fetchStreams();
  retryCount = 0;

  createChannel();

  // Polling fallback every 60s (only if realtime fails)
  pollRef = setInterval(fetchStreams, 60000);

  // Re-fetch on tab focus
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      fetchStreams();
      // If realtime was in error/polling-only state, try to reconnect
      if (globalRealtimeStatus === "ERROR" || globalRealtimeStatus === "POLLING_ONLY") {
        retryCount = 0;
        createChannel();
      }
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  (globalThis as any).__livePresenceVisCleanup = onVisibility;
};

const stopGlobalSubscription = () => {
  channelId++; // invalidate any pending callbacks
  if (channelRef) {
    supabase.removeChannel(channelRef);
    channelRef = null;
  }
  if (pollRef) {
    clearInterval(pollRef);
    pollRef = null;
  }
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  const visCb = (globalThis as any).__livePresenceVisCleanup;
  if (visCb) {
    document.removeEventListener("visibilitychange", visCb);
    (globalThis as any).__livePresenceVisCleanup = null;
  }
};

/**
 * Unified live presence hook — single source of truth for all live streams.
 * Uses a global singleton so all consumers share the same realtime channel.
 */
export function useLivePresence() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    subscriberCount++;
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);

    startGlobalSubscription();

    return () => {
      listeners.delete(listener);
      subscriberCount--;
      if (subscriberCount <= 0) {
        subscriberCount = 0;
        stopGlobalSubscription();
      }
    };
  }, []);

  /** Check if a specific user is currently live */
  const isUserLive = useCallback(
    (userId: string) => globalStreams.some((s) => s.host_user_id === userId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalStreams]
  );

  /** Get the stream for a specific user */
  const getStreamForUser = useCallback(
    (userId: string) => globalStreams.find((s) => s.host_user_id === userId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalStreams]
  );

  return {
    streams: globalStreams,
    loading: globalLoading,
    realtimeStatus: globalRealtimeStatus,
    lastEvent: globalLastEvent,
    isUserLive,
    getStreamForUser,
    refetch: fetchStreams,
  };
}
