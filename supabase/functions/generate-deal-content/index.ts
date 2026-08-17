import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { intent, venueType, venueName, menuItems, timeOfDay, reachTier, offerCategory } = await req.json();

    const hour = timeOfDay ?? new Date().getHours();
    const timeLabel =
      hour < 11 ? "morning" : hour < 14 ? "lunch" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "late night";

    const menuContext =
      menuItems && menuItems.length > 0
        ? `Menu items available: ${menuItems.map((m: any) => `${m.name} ($${m.base_price})`).join(", ")}`
        : "No menu items provided.";

    const systemPrompt = `You are a marketing expert for hospitality venues. Generate a compelling promotional deal for a ${venueType || "restaurant"} called "${venueName || "the venue"}".

Current time context: ${timeLabel} (hour ${hour}).
${menuContext}

Adapt your tone and offer style to the venue type:
- Café/bakery: warm, inviting, breakfast/coffee focus
- Restaurant: appetizing, meal bundles, dinner specials
- Bar/pub: casual, drink specials, happy hour vibes
- Nightclub/lounge: urgent, exclusive, entry/bottle deals
- Fast food: volume deals, combos, value messaging
- Street vendor/food truck: simple, direct, price-driven
- Hotel bar/rooftop: premium, sophisticated

${offerCategory ? `The user specifically wants an offer of type: ${offerCategory}. Generate accordingly.` : "Choose the best offer type for the situation."}

The user's intent is: "${intent || "bring people in"}".
Reach tier: ${reachTier || "local"}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate a deal for this venue. Intent: ${intent || "bring_people_in"}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_deal",
              description: "Generate a structured promotional deal for a venue",
              parameters: {
                type: "object",
                properties: {
                  headline: {
                    type: "string",
                    description: "Catchy headline, max 40 chars",
                  },
                  offerType: {
                    type: "string",
                    enum: ["percent_off", "two_for_one", "buy_x_get_y", "bundle", "fixed_price", "free_add_on"],
                    description: "Type of offer",
                  },
                  discountText: {
                    type: "string",
                    description: "Short discount text, e.g. '50% off drinks'",
                  },
                  description: {
                    type: "string",
                    description: "Deal description, max 125 chars",
                  },
                  cta: {
                    type: "string",
                    description: "Call to action button text, max 15 chars, uppercase",
                  },
                  suggestedExpiry: {
                    type: "string",
                    description: "Suggested expiry duration like '2 hours', 'tonight', 'this week'",
                  },
                  suggestedReachTier: {
                    type: "string",
                    enum: ["suburb", "local", "regional", "city", "national", "international"],
                    description: "Recommended reach tier",
                  },
                  suggestedPlacements: {
                    type: "array",
                    items: { type: "string" },
                    description: "Recommended placement types from: feed, explore, city_view, public_feed, following, venue_profile, desktop_sidebar",
                  },
                  confidenceScore: {
                    type: "number",
                    description: "Confidence score 0-100 for expected performance",
                  },
                  reasoning: {
                    type: "string",
                    description: "Internal reasoning for the deal strategy",
                  },
                },
                required: [
                  "headline",
                  "offerType",
                  "discountText",
                  "description",
                  "cta",
                  "suggestedExpiry",
                  "suggestedReachTier",
                  "suggestedPlacements",
                  "confidenceScore",
                  "reasoning",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_deal" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let dealContent;
    try {
      dealContent = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      console.error("Failed to parse tool arguments:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(dealContent), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-deal-content error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
