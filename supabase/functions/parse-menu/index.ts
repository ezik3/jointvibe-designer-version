import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert file to base64 using Deno's standard library (no call-stack issues)
    const arrayBuffer = await file.arrayBuffer();
    const base64 = base64Encode(new Uint8Array(arrayBuffer));
    const mimeType = file.type || "image/jpeg";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Sending menu image to AI for parsing...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are analyzing a restaurant menu image. Extract all menu items with their names, descriptions (if visible), prices, and category (guess the category based on the item - e.g. Drinks, Food, Desserts, Appetizers, Main Course, etc).

Return ONLY a valid JSON array with this exact structure (no markdown, no code blocks, just pure JSON):
[
  {
    "name": "Item Name",
    "description": "Brief description if available, or empty string",
    "price": 12.99,
    "category": "Category Name"
  }
]

Important:
- Extract ALL visible menu items
- Price should be a number (not string)
- If price shows as "$12.99" extract just 12.99
- If a price range is shown (like "$10-15"), use the lower price
- If no description is visible, use an empty string
- Guess appropriate categories based on item type
- If you cannot read the menu or it's not a menu image, return an empty array []`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    console.log("AI response:", content);

    let menuItems = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        menuItems = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      return new Response(
        JSON.stringify({ error: "Failed to parse menu. Please try with a clearer image." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validItems = menuItems
      .filter((item: any) => item.name && typeof item.price === "number")
      .map((item: any) => ({
        name: String(item.name).trim(),
        description: String(item.description || "").trim(),
        price: Number(item.price) || 0,
        category: String(item.category || "Food").trim(),
      }));

    console.log(`Successfully parsed ${validItems.length} menu items`);

    return new Response(
      JSON.stringify({ items: validItems }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error parsing menu:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to parse menu" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
