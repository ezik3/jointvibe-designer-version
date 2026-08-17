import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UserMentionSuggestion {
  kind: "user";
  id: string;
  name: string;
  avatar_url?: string | null;
}

export interface VenueMentionSuggestion {
  kind: "venue";
  id: string;
  name: string;
  city?: string | null;
}

export type MentionSuggestion = UserMentionSuggestion | VenueMentionSuggestion;

/**
 * Detects an active "@query" being typed at the end of `text`.
 * Returns the lowercased query (without "@") or null when no active mention.
 */
export function getActiveMentionQuery(text: string): string | null {
  const match = text.match(/(?:^|\s)@([a-zA-Z0-9][a-zA-Z0-9 _.-]{0,39})$/);
  if (!match) return null;
  return match[1].trim().toLowerCase();
}

/**
 * Replace the active "@query" at the end of `text` with `@name `.
 */
export function replaceActiveMention(text: string, name: string): string {
  const next = text.replace(
    /(?:^|\s)@[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,39}$/,
    ` @${name} `,
  );
  return next.replace(/\s{2,}/g, " ").trimStart();
}

/**
 * Fetches a small pool of users + venues from the backend and filters them
 * locally as the user types. Pool refreshes when `enabled` flips to true.
 */
export function useMentionSuggestions(
  query: string | null,
  options?: { enabled?: boolean; limit?: number },
) {
  const enabled = options?.enabled ?? true;
  const limit = options?.limit ?? 8;
  const [users, setUsers] = useState<UserMentionSuggestion[]>([]);
  const [venues, setVenues] = useState<VenueMentionSuggestion[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const [{ data: profiles }, { data: venueRows }] = await Promise.all([
        supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .not("display_name", "is", null)
          .limit(100),
        supabase
          .from("venues")
          .select("id, name, city")
          .eq("approval_status", "approved")
          .eq("venue_status", "live")
          .not("verified_at", "is", null)
          .limit(100),
      ]);

      if (cancelled) return;

      setUsers(
        (profiles || [])
          .filter((p: any) => !!p.display_name)
          .map((p: any) => ({
            kind: "user" as const,
            id: p.user_id,
            name: p.display_name,
            avatar_url: p.avatar_url,
          })),
      );
      setVenues(
        (venueRows || []).map((v: any) => ({
          kind: "venue" as const,
          id: v.id,
          name: v.name,
          city: v.city,
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const q = (query || "").trim().toLowerCase();
  const suggestions: MentionSuggestion[] = q
    ? [
        ...users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, limit),
        ...venues.filter((v) => v.name.toLowerCase().includes(q)).slice(0, limit),
      ].slice(0, limit)
    : [];

  return { suggestions, users, venues };
}
