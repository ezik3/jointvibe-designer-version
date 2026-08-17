import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ActiveAd {
  id: string;
  campaign_id: string;
  headline: string;
  description: string | null;
  property_price: number | null;
  property_type: string;
  property_address: string;
  cta_text: string | null;
  cta_url: string | null;
  media_url: string;
  city: string;
}

type PlacementType = "city_view" | "public_post" | "sidebar";

export const useActiveAd = (city: string, placementType: PlacementType, userSuburb?: string) => {
  const [activeAd, setActiveAd] = useState<ActiveAd | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActiveAd = async () => {
      if (!city) {
        setLoading(false);
        return;
      }

      // Delivery must reflect paid/live bookings immediately after admin approval.
      const today = new Date().toISOString().split("T")[0];

      // Find active bookings for this city and placement type
      const { data: bookings, error: bookingsError } = await supabase
        .from("ad_bookings")
        .select(`
          id,
          created_at,
          campaign_id,
          placement_type,
          target_locations,
          ad_campaigns!inner (
            id,
            headline,
            description,
            property_price,
            property_type,
            property_address,
            cta_text,
            cta_url,
            city,
            status
          )
        `)
        .eq("payment_status", "paid")
        .lte("start_date", today)
        .gte("end_date", today)
        .or(`placement_type.eq.${placementType},placement_type.eq.both`)
        .contains("target_cities", [city])
        .order("created_at", { ascending: false });

      if (bookingsError || !bookings || bookings.length === 0) {
        setActiveAd(null);
        setLoading(false);
        return;
      }

      // Filter for live campaigns + suburb targeting
      const normalize = (s?: string | null) => (s || "").trim().toLowerCase();
      const userSuburbNorm = normalize(userSuburb);
      const liveBookings = bookings.filter((b: any) => {
        if (b.ad_campaigns?.status !== "live") return false;
        const suburbs: string[] = b.target_locations?.suburbs || [];
        if (Array.isArray(suburbs) && suburbs.length > 0) {
          // Booking targets specific suburbs — only show to users in one of them
          if (!userSuburbNorm) return false;
          return suburbs.some((s) => normalize(s) === userSuburbNorm);
        }
        return true;
      });

      if (liveBookings.length === 0) {
        setActiveAd(null);
        setLoading(false);
        return;
      }

      // Show the newest eligible placement first so a just-approved booking is visible immediately.
      const selectedBooking = liveBookings[0] as any;
      const campaign = selectedBooking.ad_campaigns;

      // Fetch primary media for this campaign
      const { data: media } = await supabase
        .from("ad_media")
        .select("media_url")
        .eq("campaign_id", campaign.id)
        .eq("is_primary", true)
        .single();

      if (!media) {
        // Try to get any media
        const { data: anyMedia } = await supabase
          .from("ad_media")
          .select("media_url")
          .eq("campaign_id", campaign.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .single();

        if (!anyMedia) {
          setActiveAd(null);
          setLoading(false);
          return;
        }

        setActiveAd({
          id: selectedBooking.id,
          campaign_id: campaign.id,
          headline: campaign.headline,
          description: campaign.description,
          property_price: campaign.property_price,
          property_type: campaign.property_type,
          property_address: campaign.property_address,
          cta_text: campaign.cta_text,
          cta_url: campaign.cta_url,
          media_url: (anyMedia.media_url && !anyMedia.media_url.startsWith("blob:")) ? anyMedia.media_url : "/placeholder.svg",
          city: campaign.city,
        });
      } else {
        setActiveAd({
          id: selectedBooking.id,
          campaign_id: campaign.id,
          headline: campaign.headline,
          description: campaign.description,
          property_price: campaign.property_price,
          property_type: campaign.property_type,
          property_address: campaign.property_address,
          cta_text: campaign.cta_text,
          cta_url: campaign.cta_url,
          media_url: (media.media_url && !media.media_url.startsWith("blob:")) ? media.media_url : "/placeholder.svg",
          city: campaign.city,
        });
      }

      // Track impression
      const { data: existingAnalytics } = await supabase
        .from("ad_analytics")
        .select("id, impressions")
        .eq("campaign_id", campaign.id)
        .eq("date", today)
        .eq("placement_type", placementType as any)
        .single();

      if (existingAnalytics) {
        await supabase
          .from("ad_analytics")
          .update({ 
            impressions: (existingAnalytics.impressions || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingAnalytics.id);
      } else {
        await supabase.from("ad_analytics").insert({
          campaign_id: campaign.id,
          booking_id: selectedBooking.id,
          date: today,
          impressions: 1,
          clicks: 0,
          placement_type: placementType as any,
          city: city,
        } as any);
      }

      setLoading(false);
    };

    fetchActiveAd();
  }, [city, placementType, userSuburb]);

  const trackClick = async () => {
    if (!activeAd) return;

    const today = new Date().toISOString().split("T")[0];

    const { data: existingAnalytics } = await supabase
      .from("ad_analytics")
      .select("id, clicks, impressions")
      .eq("campaign_id", activeAd.campaign_id)
      .eq("date", today)
      .eq("placement_type", placementType as any)
      .single();

    if (existingAnalytics) {
      const newClicks = (existingAnalytics.clicks || 0) + 1;
      const impressions = existingAnalytics.impressions || 1;
      await supabase
        .from("ad_analytics")
        .update({ 
          clicks: newClicks,
          ctr: (newClicks / impressions) * 100,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingAnalytics.id);
    }
  };

  return { activeAd, loading, trackClick };
};
