import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACTIVE_VENUE_STORAGE_KEY = "jv_current_venue_id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UseActiveVenueIdOptions {
  allowEmployeeLink?: boolean;
}

const getStoredVenueId = () => {
  if (typeof window === "undefined") return null;

  const value = window.localStorage.getItem(ACTIVE_VENUE_STORAGE_KEY);
  if (!value || !UUID_PATTERN.test(value)) {
    if (value) window.localStorage.removeItem(ACTIVE_VENUE_STORAGE_KEY);
    return null;
  }

  return value;
};

const persistVenueId = (venueId: string | null) => {
  if (typeof window === "undefined") return;

  if (venueId) {
    window.localStorage.setItem(ACTIVE_VENUE_STORAGE_KEY, venueId);
  } else {
    window.localStorage.removeItem(ACTIVE_VENUE_STORAGE_KEY);
  }
};

/** Resolves the currently selected venue only after confirming the user's access. */
export function useActiveVenueId(
  userId: string | null | undefined,
  { allowEmployeeLink = true }: UseActiveVenueIdOptions = {},
) {
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const resolve = useCallback(async () => {
    if (!userId) {
      setVenueId(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const storedVenueId = getStoredVenueId();
      if (storedVenueId) {
        const { data: ownedVenue, error: ownedVenueError } = await supabase
          .from("venues")
          .select("id")
          .eq("id", storedVenueId)
          .eq("owner_user_id", userId)
          .maybeSingle();

        if (ownedVenueError) throw ownedVenueError;
        if (ownedVenue?.id) {
          setVenueId(ownedVenue.id);
          return;
        }

        if (allowEmployeeLink) {
          const { data: employeeLink, error: employeeLinkError } = await supabase
            .from("employee_venue_links")
            .select("venue_id")
            .eq("venue_id", storedVenueId)
            .eq("user_id", userId)
            .eq("is_active", true)
            .maybeSingle();

          if (employeeLinkError) throw employeeLinkError;
          if (employeeLink?.venue_id) {
            setVenueId(employeeLink.venue_id);
            return;
          }
        }

        persistVenueId(null);
      }

      const { data: ownedVenue, error: ownedVenueError } = await supabase
        .from("venues")
        .select("id")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ownedVenueError) throw ownedVenueError;
      if (ownedVenue?.id) {
        persistVenueId(ownedVenue.id);
        setVenueId(ownedVenue.id);
        return;
      }

      if (allowEmployeeLink) {
        const { data: employeeLink, error: employeeLinkError } = await supabase
          .from("employee_venue_links")
          .select("venue_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (employeeLinkError) throw employeeLinkError;
        if (employeeLink?.venue_id) {
          persistVenueId(employeeLink.venue_id);
          setVenueId(employeeLink.venue_id);
          return;
        }
      }

      persistVenueId(null);
      setVenueId(null);
    } catch (cause) {
      console.error("Failed to resolve the active venue", cause);
      setVenueId(null);
      setError(cause instanceof Error ? cause : new Error("Unable to resolve the active venue"));
    } finally {
      setLoading(false);
    }
  }, [allowEmployeeLink, userId]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  return { venueId, loading, error, refresh: resolve };
}
