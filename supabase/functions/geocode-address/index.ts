import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedLocation {
  suburb: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
}

function parseMapboxFeature(feature: any): ParsedLocation {
  const result: ParsedLocation = {
    suburb: null,
    city: null,
    state: null,
    country: null,
    countryCode: null,
  };

  // The main feature may itself be a place type
  const mainType = feature.place_type?.[0];
  const mainText = feature.text;

  if (mainType === "neighborhood" || mainType === "locality") {
    result.suburb = mainText;
  } else if (mainType === "place") {
    result.city = mainText;
  } else if (mainType === "region") {
    result.state = mainText;
  } else if (mainType === "country") {
    result.country = mainText;
    result.countryCode = feature.properties?.short_code?.toUpperCase() || null;
  }

  // Parse the context array for hierarchy
  if (feature.context && Array.isArray(feature.context)) {
    for (const ctx of feature.context) {
      const id = ctx.id || "";
      if (id.startsWith("neighborhood.") || id.startsWith("locality.")) {
        if (!result.suburb) result.suburb = ctx.text;
      } else if (id.startsWith("place.")) {
        if (!result.city) result.city = ctx.text;
      } else if (id.startsWith("district.")) {
        // Use district as suburb fallback if no neighborhood/locality
        if (!result.suburb && !result.city) result.suburb = ctx.text;
        // If we already have a city, district can be suburb
        if (!result.suburb && result.city) result.suburb = ctx.text;
      } else if (id.startsWith("region.")) {
        if (!result.state) result.state = ctx.text;
      } else if (id.startsWith("country.")) {
        if (!result.country) result.country = ctx.text;
        if (!result.countryCode && ctx.short_code) {
          result.countryCode = ctx.short_code.toUpperCase();
        }
      }
    }
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();

    if (!address || typeof address !== "string") {
      return new Response(
        JSON.stringify({ error: "Address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = Deno.env.get("MAPBOX_PUBLIC_TOKEN");
    
    if (!token) {
      console.error("MAPBOX_PUBLIC_TOKEN not configured");
      return new Response(
        JSON.stringify({ error: "Geocoding service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect if input is coordinates (lat,lng) for reverse geocoding
    const coordMatch = address.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    let geocodeUrl: string;
    if (coordMatch) {
      const lat = coordMatch[1];
      const lng = coordMatch[2];
      // Mapbox reverse geocode expects {longitude},{latitude}
      geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&types=neighborhood,locality,place,district,region,country`;
    } else {
      const encodedAddress = encodeURIComponent(address);
      geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${token}&limit=1`;
    }
    
    console.log("Geocoding address:", address);
    
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (!response.ok) {
      console.error("Mapbox geocoding error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to geocode address" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data.features || data.features.length === 0) {
      console.log("No results for address:", address);
      return new Response(
        JSON.stringify({ error: "Address not found", latitude: null, longitude: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const feature = data.features[0];
    const [longitude, latitude] = feature.center;
    const placeName = feature.place_name;
    
    // Parse structured location hierarchy
    const parsed = parseMapboxFeature(feature);
    
    console.log("Geocoded:", address, "->", { latitude, longitude, placeName, ...parsed });

    return new Response(
      JSON.stringify({ 
        latitude, 
        longitude, 
        placeName,
        suburb: parsed.suburb,
        city: parsed.city,
        state: parsed.state,
        country: parsed.country,
        countryCode: parsed.countryCode,
        success: true 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Geocoding error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
