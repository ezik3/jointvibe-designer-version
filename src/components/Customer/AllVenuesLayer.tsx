import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';

interface Venue {
  id: string;
  name: string;
  venue_type: string | null;
  latitude: number;
  longitude: number;
  current_occupancy: number | null;
  vibe_score: number | null;
  image_url: string | null;
}

interface AllVenuesLayerProps {
  map: mapboxgl.Map | null;
  visible: boolean;
}

const AllVenuesLayer = ({ map, visible }: AllVenuesLayerProps) => {
  const { t } = useTranslation('venue');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [testVenueIds, setTestVenueIds] = useState<Set<string>>(new Set());
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch all approved venues with valid coordinates
  useEffect(() => {
    const fetchVenues = async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("id, name, venue_type, latitude, longitude, current_occupancy, vibe_score, image_url")
        .eq("approval_status", "approved")
        .eq("venue_status", "live")
        .not("verified_at", "is", null)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (error) {
        console.error("Error fetching venues:", error);
        return;
      }

      let allVenues = data || [];

      // Fetch test venues for current user
      if (user) {
        const { data: invites } = await (supabase as any)
          .from('venue_test_invites')
          .select('venue_id')
          .eq('invited_user_id', user.id)
          .eq('status', 'accepted');

        if (invites?.length) {
          const existingIds = new Set(allVenues.map(v => v.id));
          const testIds = invites.map((i: any) => i.venue_id).filter((vid: string) => !existingIds.has(vid));
          
          if (testIds.length) {
            const { data: testVenues } = await supabase
              .from("venues")
              .select("id, name, venue_type, latitude, longitude, current_occupancy, vibe_score, image_url")
              .in("id", testIds)
              .not("latitude", "is", null)
              .not("longitude", "is", null);

            if (testVenues?.length) {
              allVenues = [...allVenues, ...testVenues];
              setTestVenueIds(new Set(testVenues.map(v => v.id)));
            }
          }
        }
      }

      setVenues(allVenues);
    };

    fetchVenues();
  }, [user]);

  // Add/remove markers based on visibility
  useEffect(() => {
    if (!map) return;

    // Remove existing markers when not visible
    if (!visible) {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      return;
    }

    // Remove existing markers before adding new ones
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each venue
    venues.forEach((venue) => {
      if (!venue.latitude || !venue.longitude) return;

      const isTest = testVenueIds.has(venue.id);

      // Create custom element for the marker
      const el = document.createElement("div");
      el.className = "all-venue-marker";
      el.style.cssText = `
        width: 44px;
        height: 54px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: transform 0.2s ease;
      `;

      // Add hover effect
      el.onmouseenter = () => {
        el.style.transform = "scale(1.15) translateY(-5px)";
      };
      el.onmouseleave = () => {
        el.style.transform = "scale(1)";
      };

      // Pin head with gradient — teal for test venues
      const pin = document.createElement("div");
      pin.style.cssText = `
        width: 40px;
        height: 40px;
        border-radius: 50% 50% 50% 0;
        background: ${isTest
          ? 'linear-gradient(135deg, #06b6d4, #22d3ee)'
          : 'linear-gradient(135deg, #00D9FF, #8B5CF6)'};
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${isTest
          ? '0 4px 14px rgba(6, 182, 212, 0.6)'
          : '0 4px 14px rgba(0, 217, 255, 0.5)'};
        border: 2px solid ${isTest ? '#22d3ee' : 'white'};
      `;

      // Icon inside pin
      const icon = document.createElement("div");
      icon.innerHTML = isTest
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);">
            <path d="M7 2v2h1v4.17L4.83 11.34c-.37.37-.58.88-.58 1.41V14c0 1.1.9 2 2 2h4v5l1 1 1-1v-5h4c1.1 0 2-.9 2-2v-1.25c0-.53-.21-1.04-.58-1.41L14 8.17V4h1V2H7z"/>
           </svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
           </svg>`;
      pin.appendChild(icon);
      el.appendChild(pin);

      // Pin shadow
      const shadow = document.createElement("div");
      shadow.style.cssText = `
        width: 14px;
        height: 7px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        margin-top: 2px;
      `;
      el.appendChild(shadow);

      // Click handler - navigate to venue
      el.onclick = () => {
        navigate(`/app/venue/${venue.id}`);
      };

      // Create popup with venue info
      const popup = new mapboxgl.Popup({
        offset: [0, -55],
        closeButton: false,
        className: "venue-popup"
      }).setHTML(`
        <div style="
          background: linear-gradient(135deg, rgba(0, 217, 255, 0.15), rgba(139, 92, 246, 0.15));
          backdrop-filter: blur(12px);
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid ${isTest ? 'rgba(6, 182, 212, 0.6)' : 'rgba(0, 217, 255, 0.4)'};
          min-width: 160px;
        ">
          ${isTest ? `<div style="background: rgba(6,182,212,0.3); color: #22d3ee; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px; margin-bottom: 6px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px;">🧪 Tester</div>` : ''}
          <div style="font-weight: bold; color: white; font-size: 15px; margin-bottom: 6px;">
            ${venue.name}
          </div>
          <div style="color: #00D9FF; font-size: 12px; margin-bottom: 6px; text-transform: capitalize;">
            ${venue.venue_type || 'Venue'}
          </div>
          <div style="display: flex; align-items: center; gap: 10px; color: white; opacity: 0.8; font-size: 12px;">
            <span>⭐ ${venue.vibe_score || 0}</span>
            <span>👥 ${venue.current_occupancy || 0}</span>
          </div>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #00D9FF;">
            Tap to view venue →
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
  }, [map, visible, venues, testVenueIds, navigate]);

  return null;
};

export default AllVenuesLayer;
