import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks how long the user watches each post and persists to post_watch_events.
 * Call with current post id and user id — it handles start/stop automatically.
 */
export function useWatchTimeTracker(
  currentPostId: string | undefined,
  userId: string | undefined,
) {
  const watchStartRef = useRef<number | null>(null);
  const lastPostIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Flush previous post's watch time
    if (lastPostIdRef.current && watchStartRef.current && userId) {
      const duration = Date.now() - watchStartRef.current;
      if (duration > 500) {
        // Only record meaningful views (>500ms)
        const postId = lastPostIdRef.current;
        supabase
          .from("post_watch_events" as any)
          .insert({
            post_id: postId,
            user_id: userId,
            watch_time_ms: Math.round(duration),
          } as any)
          .then(() => {});
      }
    }

    // Start timer for new post
    if (currentPostId) {
      watchStartRef.current = Date.now();
      lastPostIdRef.current = currentPostId;
    } else {
      watchStartRef.current = null;
      lastPostIdRef.current = null;
    }
  }, [currentPostId, userId]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (lastPostIdRef.current && watchStartRef.current && userId) {
        const duration = Date.now() - watchStartRef.current;
        if (duration > 500) {
          supabase
            .from("post_watch_events" as any)
            .insert({
              post_id: lastPostIdRef.current,
              user_id: userId,
              watch_time_ms: Math.round(duration),
            } as any)
            .then(() => {});
        }
      }
    };
  }, [userId]);
}
