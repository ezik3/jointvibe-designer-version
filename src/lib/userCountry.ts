// Resolve the user's country code (lowercase ISO-3166-1 alpha-2) for biasing
// geocoding / search APIs. Order of preference:
// 1. Cached value from AuthContext profile (`jv_user_country_code`).
// 2. Cached reverse-geocode result (`jv_geo_country_code`).
// 3. Reverse-geocode current geolocation via Mapbox once and cache.
// Returns `undefined` if nothing is known yet (callers should not bias).

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string | undefined;

const PROFILE_KEY = 'jv_user_country_code';
const GEO_KEY = 'jv_geo_country_code';
const COORDS_KEY = 'jv_user_coords';

export function getUserCountryCodeSync(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const profile = localStorage.getItem(PROFILE_KEY);
  if (profile) return profile.toLowerCase();
  const geo = localStorage.getItem(GEO_KEY);
  if (geo) return geo.toLowerCase();
  return undefined;
}

export async function ensureCountryCode(
  coords: { lat: number; lng: number } | null,
): Promise<string | undefined> {
  const cached = getUserCountryCodeSync();
  if (cached) return cached;
  if (!coords || !MAPBOX_TOKEN) return undefined;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?access_token=${MAPBOX_TOKEN}&types=country&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    const cc = data?.features?.[0]?.properties?.short_code as string | undefined;
    if (cc) {
      const lower = cc.toLowerCase();
      localStorage.setItem(GEO_KEY, lower);
      return lower;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

// --- User coordinates (cached from profile) -----------------------------

export function cacheUserCoords(coords: { lat: number; lng: number } | null) {
  if (typeof window === 'undefined') return;
  if (!coords || coords.lat == null || coords.lng == null) return;
  try {
    localStorage.setItem(COORDS_KEY, JSON.stringify({ lat: coords.lat, lng: coords.lng }));
  } catch {
    /* ignore */
  }
}

export function getUserCoordsSync(): { lat: number; lng: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    /* ignore */
  }
  return null;
}
