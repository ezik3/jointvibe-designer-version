import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract user preferences, allergies, and patterns from conversations
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, venue_id, extraction_type } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase not configured");
    }
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch recent messages based on extraction type
    let messages;
    
    if (extraction_type === 'user' && user_id) {
      // Get last 50 user messages for preference extraction
      const { data, error } = await supabase
        .from('ai_messages')
        .select('role, content, venue_id, created_at')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      messages = data;
    } else if (extraction_type === 'venue' && venue_id) {
      // Get last 100 messages for this venue for pattern extraction
      const { data, error } = await supabase
        .from('ai_messages')
        .select('role, content, user_id, created_at')
        .eq('venue_id', venue_id)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      messages = data;
    } else {
      throw new Error("Must provide user_id for user extraction or venue_id for venue extraction");
    }

    if (!messages || messages.length < 5) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Not enough messages to extract patterns",
        extracted: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format messages for AI analysis
    const conversationText = messages
      .reverse()
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // Build extraction prompt based on type
    let extractionPrompt: string;
    
    if (extraction_type === 'user') {
      extractionPrompt = `Analyze these conversations and extract user preferences, patterns, and important information.

CONVERSATIONS:
${conversationText}

Extract the following as a JSON object with these exact fields:
{
  "preferences": ["list of food/drink preferences"],
  "allergies": ["list of allergies or dietary restrictions - CRITICAL safety data"],
  "favorites": ["list of favorite items or venues mentioned"],
  "order_patterns": ["common ordering patterns, e.g., 'usually orders spicy food'"],
  "personality_notes": ["any personality traits, e.g., 'budget-conscious', 'adventurous eater'"]
}

Only include fields with actual extracted data. Be conservative - only extract clear patterns.
Respond ONLY with valid JSON.`;
    } else {
      extractionPrompt = `Analyze these customer conversations at this venue and extract patterns and insights.

CONVERSATIONS:
${conversationText}

Extract the following as a JSON object with these exact fields:
{
  "frequent_questions": ["commonly asked questions by customers"],
  "popular_items": ["frequently ordered or asked about items"],
  "common_modifications": ["common customization requests"],
  "peak_patterns": ["observed patterns like 'most orders around 7pm'"],
  "feedback_themes": ["recurring feedback or complaints"]
}

Only include fields with actual extracted data. Be conservative - only extract clear patterns.
Respond ONLY with valid JSON.`;
    }

    // Call Lovable AI for extraction
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a data extraction assistant. Extract patterns from conversations and return valid JSON only." },
          { role: "user", content: extractionPrompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent extraction
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI extraction error:", errorText);
      throw new Error("Failed to extract patterns from AI");
    }

    const aiData = await aiResponse.json();
    const extractedText = aiData.choices?.[0]?.message?.content || "{}";

    // Parse the extracted JSON
    let extracted;
    try {
      // Clean up the response - remove markdown code blocks if present
      const cleanedText = extractedText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      extracted = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", extractedText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Failed to parse extracted patterns" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store extracted memories
    const memories: { memory_type: string; content: string; metadata: Record<string, unknown> }[] = [];

    if (extraction_type === 'user' && user_id) {
      // Store user memories
      if (extracted.preferences?.length > 0) {
        memories.push({
          memory_type: 'preference',
          content: `Food preferences: ${extracted.preferences.join(', ')}`,
          metadata: { preferences: extracted.preferences }
        });
      }
      
      if (extracted.allergies?.length > 0) {
        memories.push({
          memory_type: 'allergy',
          content: `ALLERGIES/DIETARY: ${extracted.allergies.join(', ')}`,
          metadata: { allergies: extracted.allergies, critical: true }
        });
      }
      
      if (extracted.favorites?.length > 0) {
        memories.push({
          memory_type: 'favorite',
          content: `Favorites: ${extracted.favorites.join(', ')}`,
          metadata: { favorites: extracted.favorites }
        });
      }
      
      if (extracted.order_patterns?.length > 0 || extracted.personality_notes?.length > 0) {
        memories.push({
          memory_type: 'summary',
          content: `Patterns: ${[...(extracted.order_patterns || []), ...(extracted.personality_notes || [])].join('. ')}`,
          metadata: { patterns: extracted.order_patterns, personality: extracted.personality_notes }
        });
      }

      // Upsert user memories (update if same type exists)
      for (const memory of memories) {
        await supabase
          .from('user_memory')
          .upsert({
            user_id,
            memory_type: memory.memory_type,
            content: memory.content,
            metadata: memory.metadata,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,memory_type',
            ignoreDuplicates: false
          });
      }

    } else if (extraction_type === 'venue' && venue_id) {
      // Store venue memories
      if (extracted.frequent_questions?.length > 0) {
        memories.push({
          memory_type: 'faq_pattern',
          content: `FAQs: ${extracted.frequent_questions.join(' | ')}`,
          metadata: { questions: extracted.frequent_questions }
        });
      }
      
      if (extracted.popular_items?.length > 0) {
        memories.push({
          memory_type: 'popular_items',
          content: `Popular: ${extracted.popular_items.join(', ')}`,
          metadata: { items: extracted.popular_items }
        });
      }
      
      if (extracted.peak_patterns?.length > 0) {
        memories.push({
          memory_type: 'peak_times',
          content: `Peak patterns: ${extracted.peak_patterns.join('. ')}`,
          metadata: { patterns: extracted.peak_patterns }
        });
      }
      
      if (extracted.feedback_themes?.length > 0) {
        memories.push({
          memory_type: 'summary',
          content: `Feedback themes: ${extracted.feedback_themes.join('. ')}`,
          metadata: { 
            feedback: extracted.feedback_themes,
            modifications: extracted.common_modifications 
          }
        });
      }

      // Upsert venue memories
      for (const memory of memories) {
        await supabase
          .from('venue_memory')
          .upsert({
            venue_id,
            memory_type: memory.memory_type,
            content: memory.content,
            metadata: memory.metadata,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'venue_id,memory_type',
            ignoreDuplicates: false
          });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      extracted: memories.length,
      memories: memories.map(m => ({ type: m.memory_type, content: m.content }))
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Extract memory error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
