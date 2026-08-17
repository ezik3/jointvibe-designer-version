import { useEffect, useState } from "react";
import {
  getVenueNotificationPreferences,
  VENUE_NOTIFICATION_PREFERENCES_EVENT,
} from "@/lib/venueNotificationPreferences";

export function useVenueNotificationPreferences() {
  const [preferences, setPreferences] = useState(getVenueNotificationPreferences);

  useEffect(() => {
    const refresh = () => setPreferences(getVenueNotificationPreferences());

    window.addEventListener(VENUE_NOTIFICATION_PREFERENCES_EVENT, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(VENUE_NOTIFICATION_PREFERENCES_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return preferences;
}
