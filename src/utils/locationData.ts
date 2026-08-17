// Centralized location data utilities for dynamic location filtering
// This module provides helpers for fetching locations from registered users and venues

import { supabase } from "@/integrations/supabase/client";
import type { DiscoveryLevel } from "@/components/shared/DiscoveryLevelSelector";

export interface LocationData {
  countries: string[];
  locations: { country: string; location: string }[];
}

export interface LocationHierarchy {
  countries: string[];
  states: { country: string; state: string }[];
  cities: { country: string; state: string; city: string }[];
  suburbs: { country: string; state: string; city: string; suburb: string }[];
}

// Fetch hierarchical location data from structured columns
export const fetchLocationHierarchy = async (): Promise<LocationHierarchy> => {
  try {
    const [profilesRes, venuesRes] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('country_code, state, city, suburb')
        .not('country_code', 'is', null),
      supabase
        .from('venues')
        .select('country, city')
        .eq('approval_status', 'approved'),
    ]);

    const countries = new Set<string>();
    const stateSet = new Set<string>();
    const citySet = new Set<string>();
    const suburbSet = new Set<string>();

    const states: LocationHierarchy['states'] = [];
    const cities: LocationHierarchy['cities'] = [];
    const suburbs: LocationHierarchy['suburbs'] = [];

    const processRow = (row: { country?: string | null; country_code?: string | null; state?: string | null; city?: string | null; suburb?: string | null }) => {
      const country = row.country || row.country_code || '';
      if (!country) return;
      
      countries.add(country);

      if (row.state) {
        const stateKey = `${country}|${row.state}`;
        if (!stateSet.has(stateKey)) {
          stateSet.add(stateKey);
          states.push({ country, state: row.state });
        }
      }

      if (row.city) {
        const cityKey = `${country}|${row.state || ''}|${row.city}`;
        if (!citySet.has(cityKey)) {
          citySet.add(cityKey);
          cities.push({ country, state: row.state || '', city: row.city });
        }
      }

      if (row.suburb) {
        const suburbKey = `${country}|${row.state || ''}|${row.city || ''}|${row.suburb}`;
        if (!suburbSet.has(suburbKey)) {
          suburbSet.add(suburbKey);
          suburbs.push({ country, state: row.state || '', city: row.city || '', suburb: row.suburb });
        }
      }
    };

    profilesRes.data?.forEach(p => processRow({ country_code: p.country_code, state: p.state, city: p.city, suburb: p.suburb }));
    venuesRes.data?.forEach(v => processRow({ country: v.country, city: v.city }));

    return {
      countries: Array.from(countries).sort(),
      states: states.sort((a, b) => a.state.localeCompare(b.state)),
      cities: cities.sort((a, b) => a.city.localeCompare(b.city)),
      suburbs: suburbs.sort((a, b) => a.suburb.localeCompare(b.suburb)),
    };
  } catch (error) {
    console.error('Error fetching location hierarchy:', error);
    return { countries: [], states: [], cities: [], suburbs: [] };
  }
};

// Legacy function - kept for backward compatibility
export const fetchRegisteredLocations = async (): Promise<LocationData> => {
  try {
    const { data: venues } = await supabase
      .from('venues')
      .select('city, country')
      .eq('approval_status', 'approved');

    const { data: users } = await supabase
      .from('customer_profiles')
      .select('location');

    const countries = new Set<string>();
    const locations: { country: string; location: string }[] = [];
    const locationSet = new Set<string>();

    if (venues) {
      venues.forEach(v => {
        if (v.country) countries.add(v.country);
        if (v.city) {
          const key = `${v.country || 'Unknown'}-${v.city}`;
          if (!locationSet.has(key)) {
            locationSet.add(key);
            locations.push({ country: v.country || 'Unknown', location: v.city });
          }
        }
      });
    }

    if (users) {
      users.forEach(u => {
        if (u.location) {
          const parts = u.location.split(',').map((p: string) => p.trim());
          const city = parts[0];
          const country = parts[1] || 'Unknown';
          if (country !== 'Unknown') countries.add(country);
          const key = `${country}-${city}`;
          if (!locationSet.has(key)) {
            locationSet.add(key);
            locations.push({ country, location: city });
          }
        }
      });
    }

    return {
      countries: Array.from(countries).sort(),
      locations: locations.sort((a, b) => a.location.localeCompare(b.location))
    };
  } catch (error) {
    console.error('Error fetching registered locations:', error);
    return { countries: [], locations: [] };
  }
};

// Filter locations by country
export const getLocationsByCountry = (
  locations: { country: string; location: string }[], 
  country: string
): string[] => {
  if (!country || country === 'All Countries') {
    return [...new Set(locations.map(l => l.location))].sort();
  }
  return locations
    .filter(l => l.country === country)
    .map(l => l.location)
    .sort();
};

// Get the display label for a discovery level based on user's location
export const getDiscoveryLabel = (
  level: DiscoveryLevel,
  userLocation: { suburb?: string | null; city?: string | null; state?: string | null; country_code?: string | null }
): string => {
  switch (level) {
    case 'suburb': return userLocation.suburb || userLocation.city || 'Your Area';
    case 'local': return userLocation.city ? `Near ${userLocation.city}` : 'Local';
    case 'regional': return userLocation.city ? `Greater ${userLocation.city}` : 'Metro / Regional';
    case 'state': return userLocation.state || 'State';
    case 'national': return userLocation.country_code || 'National';
    case 'international': return 'International';
    default: return 'Discovery';
  }
};

// City backdrop images - pre-ready for common cities
export const cityBackgrounds: Record<string, string> = {
  "Brisbane": "https://images.unsplash.com/photo-1524293581917-878a6d017c71?w=1920&q=80",
  "Sydney": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=1920&q=80",
  "Melbourne": "https://images.unsplash.com/photo-1514395462725-fb4566210144?w=1920&q=80",
  "Adelaide": "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?w=1920&q=80",
  "Perth": "https://images.unsplash.com/photo-1573097219482-0319eb5f5b5e?w=1920&q=80",
  "Hobart": "https://images.unsplash.com/photo-1598012268326-56a75e0e71d4?w=1920&q=80",
  "Gold Coast": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=1920&q=80",
  "Canberra": "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=1920&q=80",
  "Darwin": "https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=1920&q=80",
  "New York": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1920&q=80",
  "Los Angeles": "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=1920&q=80",
  "Chicago": "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=1920&q=80",
  "Miami": "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=1920&q=80",
  "San Francisco": "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1920&q=80",
  "Las Vegas": "https://images.unsplash.com/photo-1605833556294-ea5c7a74f57d?w=1920&q=80",
  "Seattle": "https://images.unsplash.com/photo-1502175353174-a7a70e73b362?w=1920&q=80",
  "Austin": "https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=1920&q=80",
  "London": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1920&q=80",
  "Manchester": "https://images.unsplash.com/photo-1515586838455-8f8f940d6853?w=1920&q=80",
  "Birmingham": "https://images.unsplash.com/photo-1568736333610-eae6e0ab9d8a?w=1920&q=80",
  "Edinburgh": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1920&q=80",
  "Glasgow": "https://images.unsplash.com/photo-1557166984-b00266eb47c7?w=1920&q=80",
  "Paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1920&q=80",
  "Berlin": "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=1920&q=80",
  "Amsterdam": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=1920&q=80",
  "Barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1920&q=80",
  "Rome": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1920&q=80",
  "Madrid": "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=1920&q=80",
  "Prague": "https://images.unsplash.com/photo-1541849546-216549ae216d?w=1920&q=80",
  "Vienna": "https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=1920&q=80",
  "Tokyo": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1920&q=80",
  "Singapore": "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1920&q=80",
  "Hong Kong": "https://images.unsplash.com/photo-1536599018102-9f803c979b87?w=1920&q=80",
  "Bangkok": "https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=1920&q=80",
  "Seoul": "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=1920&q=80",
  "Mumbai": "https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=1920&q=80",
  "Shanghai": "https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?w=1920&q=80",
  "Beijing": "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1920&q=80",
  "Dubai": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1920&q=80",
  "Abu Dhabi": "https://images.unsplash.com/photo-1512632578888-169bbbc64f33?w=1920&q=80",
  "Tel Aviv": "https://images.unsplash.com/photo-1544659561-28d6f0e6d92d?w=1920&q=80",
  "Rio de Janeiro": "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=1920&q=80",
  "Buenos Aires": "https://images.unsplash.com/photo-1612294037637-ec328d0e075e?w=1920&q=80",
  "São Paulo": "https://images.unsplash.com/photo-1554168948-f8b8c3741212?w=1920&q=80",
  "Toronto": "https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=1920&q=80",
  "Vancouver": "https://images.unsplash.com/photo-1559511260-66a68e4b3023?w=1920&q=80",
  "Montreal": "https://images.unsplash.com/photo-1519178614-68673b201f36?w=1920&q=80",
  "Auckland": "https://images.unsplash.com/photo-1507699622108-4be3abd695ad?w=1920&q=80",
  "Wellington": "https://images.unsplash.com/photo-1589871973318-9ca1258faa5d?w=1920&q=80",
  "Queenstown": "https://images.unsplash.com/photo-1455763916899-e8b50eca9967?w=1920&q=80",
};

export const getCityBackground = (city: string): string | null => {
  return cityBackgrounds[city] || null;
};

export const defaultCityBackground = "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=80";

export const hasRegisteredUsers = async (location: string): Promise<boolean> => {
  const { count: venueCount } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'approved')
    .ilike('city', `%${location}%`);
  
  const { count: userCount } = await supabase
    .from('customer_profiles')
    .select('id', { count: 'exact', head: true })
    .ilike('location', `%${location}%`);
  
  return (venueCount || 0) > 0 || (userCount || 0) > 0;
};
