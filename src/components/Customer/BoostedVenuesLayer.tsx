import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';

interface BoostedVenue {
  venue_id: string;
  venue_name: string;
  venue_type: string | null;
  latitude: number;
  longitude: number;
  headline: string | null;
  discount_text: string | null;
}

interface BoostedVenuesLayerProps {
  map: mapboxgl.Map | null;
  visible: boolean;
}

const BoostedVenuesLayer = ({ map, visible }: BoostedVenuesLayerProps) => {
  const { t } = useTranslation('venue');
  const [venues, setVenues] = useState<BoostedVenue[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await (supabase as any)
        .from("venue_deals_library")
        .select("id, venue_id, headline, discount_text, venues!inner(name, venue_type, latitude, longitude, approval_status, venue_status, verified_at)")
        .eq("status", "published")
        .not("venues.latitude", "is", null)
        .not("venues.longitude", "is", null)
        .eq("venues.approval_status", "approved")
        .eq("venues.venue_status", "live")
        .not("venues.verified_at", "is", null)
        .limit(10);

      if (!data) return;

      const seen = new Set<string>();
      const result: BoostedVenue[] = [];
      for (const d of data) {
        if (seen.has(d.venue_id)) continue;
        seen.add(d.venue_id);
        const v = d.venues;
        if (!v?.latitude || !v?.longitude) continue;
        result.push({
          venue_id: d.venue_id,
          venue_name: v.name,
          venue_type: v.venue_type,
          latitude: v.latitude,
          longitude: v.longitude,
          headline: d.headline,
          discount_text: d.discount_text,
        });
      }
      setVenues(result);
    };
    fetch();
  }, []);

  useEffect(() => {
    if (!map) return;

    if (!visible) {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      return;
    }

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    venues.forEach((venue) => {
      const el = document.createElement("div");
      el.className = "boosted-venue-marker";
      el.style.cssText = `
        width: 52px;
        height: 62px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: transform 0.2s ease;
      `;

      el.onmouseenter = () => { el.style.transform = "scale(1.15) translateY(-5px)"; };
      el.onmouseleave = () => { el.style.transform = "scale(1)"; };

      // Glow wrapper
      const glow = document.createElement("div");
      glow.style.cssText = `
        position: relative;
        width: 48px;
        height: 48px;
      `;

      // Pulsing glow ring
      const ring = document.createElement("div");
      ring.style.cssText = `
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, transparent 70%);
        animation: boostedPulse 2s ease-in-out infinite;
      `;
      glow.appendChild(ring);

      // Pin head
      const pin = document.createElement("div");
      pin.style.cssText = `
        width: 48px;
        height: 48px;
        border-radius: 50% 50% 50% 0;
        background: linear-gradient(135deg, #F59E0B, #EF4444);
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(245, 158, 11, 0.6);
        border: 2.5px solid white;
        position: relative;
        z-index: 1;
      `;

      // Sparkle icon
      const icon = document.createElement("div");
      icon.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);">
          <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.8 5.6 21.2 8 14 2 9.2h7.6z"/>
        </svg>
      `;
      pin.appendChild(icon);
      glow.appendChild(pin);
      el.appendChild(glow);

      // Shadow
      const shadow = document.createElement("div");
      shadow.style.cssText = `
        width: 16px;
        height: 8px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        margin-top: 2px;
      `;
      el.appendChild(shadow);

      el.onclick = () => navigate(`/app/venue/${venue.venue_id}`);

      const dealText = venue.headline || venue.discount_text || "Special Deal";
      const popup = new mapboxgl.Popup({
        offset: [0, -65],
        closeButton: false,
        className: "venue-popup"
      }).setHTML(`
        <div style="
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15));
          backdrop-filter: blur(12px);
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid rgba(245, 158, 11, 0.4);
          min-width: 170px;
        ">
          <div style="font-weight: bold; color: white; font-size: 15px; margin-bottom: 4px;">
            ${venue.venue_name}
          </div>
          <div style="color: #FBBF24; font-size: 12px; margin-bottom: 6px; text-transform: capitalize;">
            ${venue.venue_type || 'Venue'}
          </div>
          <div style="color: white; font-size: 13px; margin-bottom: 8px; opacity: 0.9;">
            🔥 ${dealText}
          </div>
          <div style="padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #FBBF24;">
            View Deal →
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([venue.longitude, venue.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Inject keyframes if not already present
    if (!document.getElementById("boosted-pulse-style")) {
      const style = document.createElement("style");
      style.id = "boosted-pulse-style";
      style.textContent = `
        @keyframes boostedPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.4); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [map, visible, venues, navigate]);

  return null;
};

export default BoostedVenuesLayer;
