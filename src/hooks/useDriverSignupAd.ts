import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DriverSignupAd {
  booking_id: string;
  campaign_id: string;
  headline: string;
  description: string | null;
  cta_text: string | null;
  cta_url: string | null;
  auto_details: any;
  media_url: string | null;
  suburb_match: number;
}

interface Loc {
  country: string | null;
  state: string | null;
  city: string | null;
  suburb: string | null;
}

/**
 * Fetches the single best driver-signup ad for the user's location.
 * Gated by `enabled` so we never fetch unless the modal is actually open.
 */
export function useDriverSignupAd(enabled: boolean, loc: Loc) {
  const [ad, setAd] = useState<DriverSignupAd | null>(null);
  const [loading, setLoading] = useState(false);
  const impressionTrackedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !loc.country || !loc.state || !loc.city) {
      setAd(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_driver_signup_ad", {
        p_country: loc.country,
        p_state: loc.state,
        p_city: loc.city,
        p_suburb: loc.suburb ?? null,
      });
      if (cancelled) return;
      const row = (data && data[0]) as DriverSignupAd | undefined;
      setAd(row ?? null);
      setLoading(false);

      if (row && impressionTrackedFor.current !== row.booking_id) {
        impressionTrackedFor.current = row.booking_id;
        // Fire-and-forget impression
        supabase.functions.invoke("track-driver-signup-conversion", {
          body: { booking_id: row.booking_id, campaign_id: row.campaign_id, event: "impression" },
        }).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, loc.country, loc.state, loc.city, loc.suburb]);

  const track = (event: "click" | "signup_started" | "signup_completed") => {
    if (!ad) return;
    supabase.functions.invoke("track-driver-signup-conversion", {
      body: { booking_id: ad.booking_id, campaign_id: ad.campaign_id, event },
    }).catch(() => {});
  };

  return { ad, loading, trackClick: () => track("click"), trackSignupStarted: () => track("signup_started"), trackSignupCompleted: () => track("signup_completed") };
}
