import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  task_description: string;
  country_code?: string;
  currency?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { task_description, country_code, currency } = (await req.json()) as Body;
    if (!task_description || task_description.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "task_description required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sysPrompt = `You estimate the retail price of a small everyday purchase a customer would ask a runner to buy from a convenience store, supermarket, fast-food outlet, or petrol station.

Rules:
- Return ONLY valid JSON with keys: estimated_usd (number), confidence ("low"|"medium"|"high"), reasoning (string, max 120 chars).
- Price is the TOTAL the runner would pay at register, in USD.
- Cap at $50. If the request looks larger than $50, set estimated_usd to 50 and confidence "low".
- If the request is unclear or could vary wildly, return your best mid-range guess with confidence "low".
- Country context (if given) should adjust pricing roughly to that market, but always return USD.`;

    const userPrompt = `Country: ${country_code ?? "unknown"} (${currency ?? "USD"})
Request: "${task_description}"

Return JSON only.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(
        JSON.stringify({ error: `AI gateway error: ${aiRes.status}`, detail: txt.slice(0, 200) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { estimated_usd?: number; confidence?: string; reasoning?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    let estimated = Number(parsed.estimated_usd);
    if (!Number.isFinite(estimated) || estimated < 0) estimated = 0;
    if (estimated > 50) estimated = 50;
    estimated = Math.round(estimated * 100) / 100;

    const confidence = ["low", "medium", "high"].includes(parsed.confidence ?? "")
      ? parsed.confidence
      : "low";

    return new Response(
      JSON.stringify({
        estimated_usd: estimated,
        confidence,
        reasoning: (parsed.reasoning ?? "").toString().slice(0, 120),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
