import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  job_id: z.string().uuid(),
  image_urls: z.array(z.string().url()).min(1).max(10),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job } = await service
      .from("runner_jobs")
      .select("id, runner_id")
      .eq("id", parsed.data.job_id)
      .maybeSingle();
    if (!job || job.runner_id !== u.user.id) return json({ error: "Forbidden" }, 403);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    let items: Array<{ name: string; est_price: number }> = [];

    if (apiKey) {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You extract grocery/store item prices from photos. Return ONLY a JSON array like [{\"name\":\"Coke 600ml\",\"est_price\":3.50}]. No prose.",
            },
            {
              role: "user",
              content: parsed.data.image_urls.map((url) => ({
                type: "image_url",
                image_url: { url },
              })),
            },
          ],
        }),
      });
      const aiJson = await aiRes.json();
      const text = aiJson?.choices?.[0]?.message?.content ?? "[]";
      try {
        const cleaned = String(text).replace(/```json|```/g, "").trim();
        items = JSON.parse(cleaned);
        if (!Array.isArray(items)) items = [];
      } catch {
        items = [];
      }
    }

    return json({ items }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
