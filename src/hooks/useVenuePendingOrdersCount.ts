import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";

export function useVenuePendingOrdersCount(venueId: string | null) {
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!venueId) {
      setPendingOrdersCount(0);
      return;
    }

    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .eq("status", "pending");

    if (error) {
      console.error("Failed to load pending order count:", error);
      return;
    }

    setPendingOrdersCount(count || 0);
  }, [venueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!venueId) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`venue-pending-orders-count-${venueId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `venue_id=eq.${venueId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, venueId]);

  return pendingOrdersCount;
}
