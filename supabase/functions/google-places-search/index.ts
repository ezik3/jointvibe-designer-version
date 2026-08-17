// Proxies Google Places API (New) so the API key stays server-side.
// Two actions:
//   action=autocomplete  → returns suggestions for a typed query
//   action=details       → returns lat/lng + formatted address for a placeId
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "autocomplete";

    if (action === "autocomplete") {
      const query = String(body.query ?? "").trim();
      if (query.length < 2) {
        return new Response(JSON.stringify({ suggestions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      const country: string | undefined = body.country;
      const radiusMeters = Number(body.radiusMeters ?? 8000); // 8 km default — tight ring around drop-off
      const hasAnchor = Number.isFinite(lat) && Number.isFinite(lng);

      const buildPayload = (mode: "restriction" | "bias", radius: number): Record<string, unknown> => {
        const p: Record<string, unknown> = { input: query };
        if (hasAnchor) {
          const circle = {
            center: { latitude: lat, longitude: lng },
            radius: Math.min(50000, Math.max(500, radius)),
          };
          if (mode === "restriction") {
            p.locationRestriction = { circle };
          } else {
            p.locationBias = { circle };
          }
        }
        if (country) {
          p.includedRegionCodes = [country.toLowerCase()];
        }
        return p;
      };

      const callGoogle = async (payload: Record<string, unknown>) => {
        const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        return { ok: r.ok, data: d };
      };

      // Pass 1: hard-restrict to drop-off ring (default 8 km).
      let result = await callGoogle(
        hasAnchor ? buildPayload("restriction", radiusMeters) : buildPayload("bias", radiusMeters),
      );

      // Pass 2 fallback: if restriction returned nothing, widen to bias @ 25 km
      // so obscure queries still resolve.
      if (result.ok && hasAnchor && (!result.data?.suggestions || result.data.suggestions.length === 0)) {
        const wider = await callGoogle(buildPayload("bias", 25000));
        if (wider.ok && wider.data?.suggestions?.length) result = wider;
      }

      if (!result.ok) {
        console.error("Google autocomplete error:", result.data);
        return new Response(
          JSON.stringify({ error: result.data?.error?.message ?? "autocomplete failed", suggestions: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const suggestions = (result.data.suggestions ?? [])
        .map((s: any) => s.placePrediction)
        .filter(Boolean)
        .map((p: any) => ({
          placeId: p.placeId,
          mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
          secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
          fullText: p.text?.text ?? "",
          types: p.types ?? [],
          distanceMeters: typeof p.distanceMeters === "number" ? p.distanceMeters : null,
        }));

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "details") {
      const placeId = String(body.placeId ?? "").trim();
      if (!placeId) {
        return new Response(JSON.stringify({ error: "placeId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
      const resp = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types",
        },
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error("Google details error:", data);
        return new Response(JSON.stringify({ error: data?.error?.message ?? "details failed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        placeId: data.id,
        name: data.displayName?.text ?? "",
        address: data.formattedAddress ?? "",
        latitude: data.location?.latitude ?? null,
        longitude: data.location?.longitude ?? null,
        types: data.types ?? [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("google-places-search error:", err);
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
