import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { useFollowedVenues } from "@/hooks/useVenueFollow";
import { useTranslation } from 'react-i18next';

interface FollowedVenuesLayerProps {
  map: mapboxgl.Map | null;
  visible: boolean;
  onVenueClick?: (venueId: string) => void;
}

const FollowedVenuesLayer = ({ map, visible, onVenueClick }: FollowedVenuesLayerProps) => {
  const { t } = useTranslation('venue');
  const { followedVenues, loading } = useFollowedVenues();
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!map || !visible) {
      // Remove all markers when not visible
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      return;
    }

    // Remove existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each followed venue
    followedVenues.forEach((venue: any) => {
      if (!venue.latitude || !venue.longitude) return;

      // Create custom element for the marker
      const el = document.createElement("div");
      el.className = "venue-marker";
      el.style.cssText = `
        width: 40px;
        height: 50px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: transform 0.2s ease;
      `;

      // Add hover effect
      el.onmouseenter = () => {
        el.style.transform = "scale(1.1) translateY(-5px)";
      };
      el.onmouseleave = () => {
        el.style.transform = "scale(1)";
      };

      // Pin head
      const pin = document.createElement("div");
      pin.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50% 50% 50% 0;
        background: linear-gradient(135deg, #EC4899, #8B5CF6);
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(236, 72, 153, 0.4);
        border: 2px solid white;
      `;

      // Heart icon inside pin
      const heart = document.createElement("div");
      heart.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      `;
      pin.appendChild(heart);
      el.appendChild(pin);

      // Pin shadow
      const shadow = document.createElement("div");
      shadow.style.cssText = `
        width: 12px;
        height: 6px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        margin-top: 2px;
      `;
      el.appendChild(shadow);

      // Click handler
      el.onclick = () => {
        if (onVenueClick) {
          onVenueClick(venue.id);
        }
      };

      // Create popup
      const popup = new mapboxgl.Popup({
        offset: [0, -50],
        closeButton: false,
        className: "venue-popup"
      }).setHTML(`
        <div style="
          background: linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(139, 92, 246, 0.1));
          backdrop-filter: blur(10px);
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(236, 72, 153, 0.3);
          min-width: 150px;
        ">
          <div style="font-weight: bold; color: white; font-size: 14px; margin-bottom: 4px;">
            ${venue.name}
          </div>
          <div style="color: #EC4899; font-size: 12px; margin-bottom: 4px;">
            ${venue.venue_type || 'Venue'}
          </div>
          <div style="display: flex; align-items: center; gap: 8px; color: white; opacity: 0.7; font-size: 11px;">
            <span>⭐ ${venue.vibe_score || 0}</span>
            <span>👥 ${venue.current_occupancy || 0}</span>
          </div>
        </div>
      `);

      // Create and add marker
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([venue.longitude, venue.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
    };
  }, [map, visible, followedVenues, onVenueClick]);

  return null;
};

export default FollowedVenuesLayer;
