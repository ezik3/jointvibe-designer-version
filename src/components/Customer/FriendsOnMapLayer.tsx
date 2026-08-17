import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { useFriendsOnMap } from "@/hooks/useFriendsOnMap";
import { useTranslation } from 'react-i18next';

interface FriendsOnMapLayerProps {
  map: mapboxgl.Map | null;
  visible: boolean;
}

const FriendsOnMapLayer = ({ map, visible }: FriendsOnMapLayerProps) => {
  const { t } = useTranslation('common');
  const { friendsOnMap, loading } = useFriendsOnMap();
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

    // Add markers for each friend
    friendsOnMap.forEach(friend => {
      // Create custom element for the marker
      const el = document.createElement("div");
      el.className = "friend-marker";
      el.style.cssText = `
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 3px solid #00FFFF;
        box-shadow: 0 0 15px rgba(0, 255, 255, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        cursor: pointer;
        background: linear-gradient(135deg, #00FFFF, #8B5CF6);
        padding: 2px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      `;

      // Add hover effect
      el.onmouseenter = () => {
        el.style.transform = "scale(1.15)";
        el.style.boxShadow = "0 0 25px rgba(0, 255, 255, 0.7), 0 6px 16px rgba(0, 0, 0, 0.4)";
      };
      el.onmouseleave = () => {
        el.style.transform = "scale(1)";
        el.style.boxShadow = "0 0 15px rgba(0, 255, 255, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)";
      };

      // Inner image container
      const innerDiv = document.createElement("div");
      innerDiv.style.cssText = `
        width: 100%;
        height: 100%;
        border-radius: 50%;
        overflow: hidden;
        background: #1a1a2e;
      `;

      // Avatar image
      const img = document.createElement("img");
      img.src = friend.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.userId}`;
      img.alt = friend.displayName;
      img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
      `;
      img.onerror = () => {
        img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.userId}`;
      };

      innerDiv.appendChild(img);
      el.appendChild(innerDiv);

      // Create popup
      const popup = new mapboxgl.Popup({
        offset: 30,
        closeButton: false,
        className: "friend-popup"
      }).setHTML(`
        <div style="
          background: linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(139, 92, 246, 0.1));
          backdrop-filter: blur(10px);
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 255, 0.3);
          min-width: 150px;
        ">
          <div style="font-weight: bold; color: white; font-size: 14px; margin-bottom: 4px;">
            ${friend.displayName}
          </div>
          <div style="color: #00FFFF; font-size: 12px; display: flex; align-items: center; gap: 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            @ ${friend.venueName}
          </div>
        </div>
      `);

      // Create and add marker
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([friend.venueLongitude, friend.venueLatitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
    };
  }, [map, visible, friendsOnMap]);

  return null;
};

export default FriendsOnMapLayer;
