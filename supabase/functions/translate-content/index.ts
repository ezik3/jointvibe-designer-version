import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_CONTENT_TYPES = new Set([
  "post",
  "comment",
  "message",
  "venue",
  "live_chat",
  "live_chat_message",
  "order_message",
  "notification_title",
  "notification_message",
  "generic",
]);

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function detectLanguageWithAI(
  text: string,
  apiKey: string,
): Promise<{ lang: string; confidence: number } | null> {
  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "You detect languages. Reply with ONLY the ISO 639-1 two-letter code (e.g., en, es, fr, de, pt, it, nl, sv, ja, zh, ko, ru, ar, hi, th). No punctuation, no explanation.",
            },
            { role: "user", content: text.slice(0, 500) },
          ],
        }),
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || "")
      .trim()
      .toLowerCase()
      .slice(0, 2);
    if (!/^[a-z]{2}$/.test(raw)) return null;
    return { lang: raw, confidence: 0.9 };
  } catch (e) {
    console.error("AI detect failed:", e);
    return null;
  }
}

async function translateWithAI(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `You are a translator. Translate the user's text from ${sourceLang} to ${targetLang}. Reply with ONLY the translated text, preserving tone, emojis, line breaks, hashtags and @mentions. No commentary, no quotes.`,
            },
            { role: "user", content: text },
          ],
        }),
      },
    );
    if (!resp.ok) {
      console.error("Translate AI status:", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || "").trim() || null;
  } catch (e) {
    console.error("Translate failed:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const {
      content_id,
      content_type,
      source_lang: providedSource,
      target_lang,
      original_text,
      source_confidence,
    } = body || {};

    // --- Validation ---
    if (!content_id || !content_type || !target_lang || !original_text) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields: content_id, content_type, target_lang, original_text",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!ALLOWED_CONTENT_TYPES.has(content_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid content_type: ${content_type}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const text = String(original_text);
    if (text.trim().length < 3) {
      return new Response(
        JSON.stringify({
          translated_text: text,
          source_lang: providedSource || "unknown",
          target_lang,
          cached: false,
          skipped: "too_short",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- Resolve source language (AI fallback if low confidence) ---
    let sourceLang = (providedSource || "").toLowerCase().slice(0, 2);
    const conf =
      typeof source_confidence === "number" ? source_confidence : 1.0;
    if (!sourceLang || conf < 0.5) {
      const detected = await detectLanguageWithAI(text, LOVABLE_API_KEY);
      if (detected) sourceLang = detected.lang;
      else if (!sourceLang) sourceLang = "en";
    }

    // --- Skip if same language ---
    if (sourceLang === target_lang) {
      return new Response(
        JSON.stringify({
          translated_text: text,
          source_lang: sourceLang,
          target_lang,
          cached: false,
          skipped: "same_language",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sourceHash = await sha256(text);

    // --- Cache lookup ---
    const { data: cached } = await supabase
      .from("content_translations")
      .select("translated_text, source_lang, provider")
      .eq("content_type", content_type)
      .eq("content_id", content_id)
      .eq("target_lang", target_lang)
      .eq("source_hash", sourceHash)
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({
          translated_text: cached.translated_text,
          source_lang: cached.source_lang,
          target_lang,
          cached: true,
          provider: cached.provider,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Translate ---
    const translated = await translateWithAI(
      text,
      sourceLang,
      target_lang,
      LOVABLE_API_KEY,
    );
    if (!translated) {
      return new Response(
        JSON.stringify({ error: "Translation failed" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Cache (upsert; ignore conflicts) ---
    const { error: insertErr } = await supabase
      .from("content_translations")
      .insert({
        content_type,
        content_id,
        source_lang: sourceLang,
        target_lang,
        source_hash: sourceHash,
        translated_text: translated,
        provider: "lovable-ai:gemini-2.5-flash-lite",
        confidence: 0.9,
      });
    if (insertErr && !insertErr.message.includes("duplicate")) {
      console.error("Cache insert error:", insertErr);
    }

    return new Response(
      JSON.stringify({
        translated_text: translated,
        source_lang: sourceLang,
        target_lang,
        cached: false,
        provider: "lovable-ai:gemini-2.5-flash-lite",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("translate-content error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
