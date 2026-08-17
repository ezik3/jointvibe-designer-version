import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texts, table, ids } = await req.json();
    // texts: string[], table: string (ai_knowledge_docs | user_memory | venue_memory), ids: string[]

    if (!texts || !table || !ids || texts.length !== ids.length) {
      throw new Error("Invalid input: texts, table, and ids arrays are required and must be the same length");
    }

    const allowedTables = ["ai_knowledge_docs", "user_memory", "venue_memory"];
    if (!allowedTables.includes(table)) {
      throw new Error(`Invalid table: ${table}. Must be one of: ${allowedTables.join(", ")}`);
    }

    const HF_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!HF_API_KEY) throw new Error("HUGGINGFACE_API_KEY not configured");

    // Generate real embeddings via Hugging Face free inference API (384-dim)
    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
      }
    );

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error("HuggingFace API error:", hfResponse.status, errorText);
      throw new Error(`HuggingFace API error: ${hfResponse.status} ${errorText}`);
    }

    const embeddings = await hfResponse.json(); // Returns array of 384-dim vectors

    // Validate embeddings shape
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new Error(`Unexpected embeddings shape: got ${embeddings?.length}, expected ${texts.length}`);
    }

    // Update each row in the specified table
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Process in batches to avoid overwhelming the DB
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize).map((id: string, j: number) => {
        const idx = i + j;
        return supabase
          .from(table)
          .update({ embedding: embeddings[idx] })
          .eq("id", id)
          .then(({ error }: any) => {
            if (error) {
              results.push({ id, success: false, error: error.message });
            } else {
              results.push({ id, success: true });
            }
          });
      });
      await Promise.all(batch);
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[EMBEDDINGS] Generated ${successCount}/${ids.length} embeddings for table ${table}`);

    return new Response(
      JSON.stringify({ success: true, count: successCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Embedding generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
