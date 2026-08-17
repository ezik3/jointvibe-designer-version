import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ============================================================================
// LLM CONFIGURATION
// ============================================================================
// PRIMARY: DeepSeek API (OpenAI-compatible)
const LLM_BASE_URL = "https://api.deepseek.com";
const LLM_MODEL = "deepseek-chat"; // DeepSeek-V3

// FALLBACK: Lovable AI Gateway (Gemini) — uncomment if DeepSeek is down
// const LLM_BASE_URL_FALLBACK = "https://ai.gateway.lovable.dev";
// const LLM_MODEL_FALLBACK = "google/gemini-3-flash-preview";

// Intent types for quota management
type IntentType = 'VENUE' | 'DISCOVERY' | 'GENERAL';

// ============================================================================
// SYSTEM PROMPTS — 3 AI ROLES
// ============================================================================

const CUSTOMER_AI_SYSTEM_PROMPT = `You are JointVibe's personal assistant. Your name matches the avatar the user selected (Stellara, Vibe, or Aria).

YOUR CAPABILITIES:
- Help users discover nearby venues, deals, and events
- Recommend venues based on user preferences (cuisine, budget, vibe, dietary needs)
- Share social context (friends nearby, trending venues, what's popular)
- Suggest plans and help users decide what to do
- Answer general questions about the JointVibe app

YOUR PERSONALITY:
- Friendly, upbeat, and conversational
- Brief and punchy — no walls of text
- Use the user's name when you know it
- Feel like a knowledgeable local friend, not a corporate bot

YOUR RULES:
- You can discuss ANY venue in the JointVibe system
- When recommending venues, use ONLY the context provided — never invent venue names or details
- If you don't have enough context to answer, say so and suggest the user check the venue directly
- Never make up menu items, prices, or deals
- Keep responses under 150 words unless the user asks for detail
- If the user asks to order something, tell them to visit the venue page first
- When recommending venues, naturally highlight any active deals — mention the deal headline and discount
- If a user asks about deals, specials, or discounts, prioritize venues with active published deals

CONTEXT FORMAT:
You will receive nearby venue profiles, active deals, and user preferences as context. Use them naturally.
Include emotion hints: [EMO=happy], [EMO=excited], [EMO=thinking]`;

const VENUE_AI_SYSTEM_PROMPT = (venueName: string) => `You are the AI assistant for ${venueName} on JointVibe. You represent this venue ONLY.

YOUR CAPABILITIES:
- Answer questions about ${venueName}'s menu, prices, ingredients, and portions
- Explain current deals and promotions
- Help customers build their order
- Assist with table reservations and seating
- Share opening hours and venue policies
- Process payment initiation when the customer is ready

YOUR PERSONALITY:
- Professional but warm — like the best waiter/host at ${venueName}
- Knowledgeable about every menu item
- Proactive — suggest pairings, upgrades, and deals naturally
- Efficient — get to the answer quickly

YOUR RULES — THESE ARE ABSOLUTE:
- You ONLY know about ${venueName}. You have ZERO knowledge of any other venue.
- If asked about another venue, say: "I can only help with ${venueName}! For other venues, head back to your JointVibe feed."
- NEVER invent menu items, prices, or deals. Use ONLY the context provided.
- If a menu item isn't in your context, say: "I don't see that on our current menu. Let me show you what we do have!"
- When helping build an order, always confirm: item name, quantity, any modifiers, and price before proceeding
- When a customer confirms an order, output it as a structured JSON block at the end of your message:
  \`\`\`order
  {"items": [{"menu_item_id": "uuid", "name": "Item Name", "quantity": 1, "modifiers": [], "price": 12.99}], "type": "dine_in", "notes": ""}
  \`\`\`
- Keep responses under 120 words unless listing multiple menu items
Include emotion hints: [EMO=happy], [EMO=excited], [EMO=thinking]

CONTEXT FORMAT:
You will receive ${venueName}'s menu items, deals, hours, and FAQs as context. This is your ONLY source of truth.`;

const OWNER_AI_SYSTEM_PROMPT = (venueName: string) => `You are the business assistant for ${venueName} on JointVibe. You help the venue owner manage and grow their business.

YOUR CAPABILITIES:
- Help set up and update the venue profile (name, description, photos, hours, tags)
- Assist with creating and editing menu items (name, description, price, category, tags)
- Help write compelling deal/promotion descriptions
- Suggest optimal times for push notifications based on typical foot traffic patterns
- Explain analytics and performance data in simple terms
- Help write FAQs and venue policies
- Advise on pricing strategies and menu optimization

YOUR PERSONALITY:
- Like a smart, experienced business consultant who happens to know the restaurant/venue industry
- Encouraging but honest — flag issues constructively
- Action-oriented — always end with a clear next step

YOUR RULES:
- You ONLY help with ${venueName}. Never reference other venue's data.
- When suggesting menu descriptions or deals, be creative but accurate
- Never make up analytics data — only reference what's provided in context
- If the owner asks something outside your capability, suggest they contact JointVibe support
- Keep responses concise and actionable
Include emotion hints when appropriate: [EMO=happy], [EMO=thinking]

CONTEXT FORMAT:
You will receive ${venueName}'s current profile, menu, deals, analytics summaries, and relevant venue_memory as context.`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Haversine distance calculation (returns km)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Synonym map for common food/drink items
const SYNONYMS: Record<string, string[]> = {
  'coffee': ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'mocha', 'macchiato'],
  'tea': ['tea', 'chai', 'matcha', 'herbal'],
  'fries': ['fries', 'chips', 'french fries', 'hot chips'],
  'chips': ['chips', 'fries', 'french fries', 'hot chips', 'crisps'],
  'soda': ['soda', 'soft drink', 'pop', 'cola', 'coke', 'pepsi', 'sprite', 'fanta'],
  'soft drink': ['soft drink', 'soda', 'pop', 'cola', 'coke'],
  'burger': ['burger', 'hamburger', 'cheeseburger', 'patty'],
  'pizza': ['pizza', 'pie', 'flatbread'],
  'beer': ['beer', 'ale', 'lager', 'ipa', 'stout', 'pilsner', 'draft'],
  'wine': ['wine', 'vino', 'red wine', 'white wine', 'rosé'],
  'cocktail': ['cocktail', 'mixed drink', 'martini', 'margarita', 'mojito'],
  'pie': ['pie', 'tart', 'pastry'],
  'apple pie': ['apple pie', 'apple tart'],
  'dessert': ['dessert', 'sweet', 'cake', 'pie', 'ice cream', 'pudding'],
  'sandwich': ['sandwich', 'sub', 'hoagie', 'wrap', 'panini'],
  'salad': ['salad', 'greens', 'bowl'],
  'chicken': ['chicken', 'poultry', 'wings', 'nuggets', 'tenders'],
  'steak': ['steak', 'beef', 'ribeye', 'sirloin', 'filet'],
};

const MENU_INTENT_WORDS = [
  'order', 'buy', 'get', 'want', 'have', 'serve', 'sell', 'menu', 'eat', 'drink',
  'can i', 'do you', 'is there', 'are there', 'any', 'looking for', 'find'
];

const FOOD_DRINK_WORDS = [
  'coffee', 'tea', 'espresso', 'latte', 'cappuccino',
  'beer', 'wine', 'cocktail', 'drink', 'beverage', 'soda', 'juice', 'water',
  'burger', 'pizza', 'pasta', 'sandwich', 'salad', 'soup', 'steak', 'chicken', 'fish', 'seafood',
  'fries', 'chips', 'nachos', 'wings', 'appetizer', 'starter',
  'dessert', 'cake', 'pie', 'ice cream', 'brownie', 'cookie',
  'breakfast', 'brunch', 'lunch', 'dinner', 'food', 'snack', 'meal',
  'vegan', 'vegetarian', 'gluten'
];

function hasMenuIntent(message: string): boolean {
  const lower = message.toLowerCase();
  for (const word of MENU_INTENT_WORDS) {
    if (lower.includes(word)) return true;
  }
  for (const word of FOOD_DRINK_WORDS) {
    if (lower.includes(word)) return true;
  }
  return false;
}

function extractSearchTerms(message: string): { terms: string[], original: string[] } {
  const lower = message.toLowerCase();
  const original: string[] = [];
  const expanded: Set<string> = new Set();
  
  const normalized = lower.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ');
  
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (SYNONYMS[bigram]) {
      original.push(bigram);
      SYNONYMS[bigram].forEach(s => expanded.add(s));
    }
  }
  
  for (const word of words) {
    if (word.length < 2) continue;
    const stopwords = new Set([
      'a', 'an', 'and', 'are', 'at', 'any', 'can', 'could', 'do', 'does', 'for',
      'from', 'have', 'has', 'i', 'in', 'is', 'it', 'me', 'my', 'near', 'nearby',
      'of', 'on', 'or', 'please', 'some', 'the', 'there', 'they', 'to', 'want',
      'with', 'you', 'your', 'would', 'like', 'looking', 'find', 'get', 'order'
    ]);
    if (stopwords.has(word)) continue;
    
    if (FOOD_DRINK_WORDS.includes(word) || SYNONYMS[word]) {
      original.push(word);
      expanded.add(word);
      if (SYNONYMS[word]) SYNONYMS[word].forEach(s => expanded.add(s));
      for (const [key, syns] of Object.entries(SYNONYMS)) {
        if (syns.includes(word)) {
          expanded.add(key);
          syns.forEach(s => expanded.add(s));
        }
      }
    } else if (word.length >= 3) {
      original.push(word);
      expanded.add(word);
      if (word.endsWith('s') && word.length > 3) expanded.add(word.slice(0, -1));
      if (word.endsWith('ies') && word.length > 4) expanded.add(word.slice(0, -3) + 'y');
    }
  }
  
  return { terms: Array.from(expanded), original };
}

async function searchMenuItems(
  supabase: any,
  venueIds: string[],
  searchTerms: string[]
): Promise<{ items: any[], rawCount: number, query: string }> {
  if (searchTerms.length === 0 || venueIds.length === 0) {
    return { items: [], rawCount: 0, query: 'none' };
  }
  
  const orConditions: string[] = [];
  for (const term of searchTerms) {
    orConditions.push(`name.ilike.%${term}%`);
    orConditions.push(`description.ilike.%${term}%`);
    orConditions.push(`category.ilike.%${term}%`);
  }
  
  const queryString = orConditions.join(',');
  
  const { data: menuItems, error } = await supabase
    .from('venue_menu_items')
    .select('id, venue_id, name, description, category, base_price, image_url')
    .in('venue_id', venueIds)
    .eq('available', true)
    .or(queryString)
    .limit(100);
  
  if (error) {
    console.error(`[MENU SEARCH] Error:`, error);
    return { items: [], rawCount: 0, query: queryString };
  }
  
  return { items: menuItems || [], rawCount: menuItems?.length || 0, query: queryString };
}

function extractVenueTypeFilter(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  const venueTypeMap: Record<string, string[]> = {
    'nightclub': ['nightclub', 'club', 'dance club', 'night club'],
    'bar': ['bar', 'pub', 'tavern', 'sports bar'],
    'lounge': ['lounge', 'cocktail lounge', 'wine bar'],
    'restaurant': ['restaurant', 'eatery', 'diner', 'bistro', 'grill'],
    'cafe': ['cafe', 'coffee shop', 'coffeehouse'],
    'food_truck': ['food truck', 'food cart'],
  };

  if (hasMenuIntent(lowerMessage)) return null;
  
  for (const [venueType, aliases] of Object.entries(venueTypeMap)) {
    for (const alias of aliases) {
      if (lowerMessage.includes(alias)) return venueType;
    }
  }
  return null;
}

function classifyIntentLocal(message: string, mode: string, venueId: string | null): IntentType {
  if (mode === 'venue' && venueId) return 'VENUE';
  if (mode === 'owner') return 'VENUE';
  
  const lowerMessage = message.toLowerCase();
  const venueKeywords = [
    'order', 'menu', 'book', 'table', 'reservation', 'deal', 'special',
    'price', 'cost', 'pay', 'checkout', 'cart', 'add', 'food', 'drink',
    'burger', 'pizza', 'beer', 'wine', 'cocktail', 'appetizer', 'dessert',
    'waiter', 'server', 'bill', 'check', 'tip', 'seated', 'wait time'
  ];
  const discoveryKeywords = [
    'nearby', 'close by', 'around', 'near me', 'find', 'discover',
    'recommend', 'suggestion', 'best', 'top', 'popular', 'trending',
    'what\'s good', 'where should', 'tonight', 'vibe', 'atmosphere',
    'bar', 'restaurant', 'club', 'venue', 'place', 'spot', 'coffee', 'cafe'
  ];
  
  for (const keyword of venueKeywords) {
    if (lowerMessage.includes(keyword)) return 'VENUE';
  }
  for (const keyword of discoveryKeywords) {
    if (lowerMessage.includes(keyword)) return 'DISCOVERY';
  }
  return 'DISCOVERY';
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================================================
// RAG CONTEXT BUILDER
// ============================================================================

async function generateQueryEmbedding(text: string): Promise<number[] | null> {
  try {
    const HF_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!HF_API_KEY) {
      console.warn("[RAG] HUGGINGFACE_API_KEY not set, skipping embedding-based search");
      return null;
    }

    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
      }
    );

    if (!hfResponse.ok) {
      console.error("[RAG] HuggingFace embedding error:", hfResponse.status);
      return null;
    }

    return await hfResponse.json();
  } catch (e) {
    console.error("[RAG] Embedding generation failed:", e);
    return null;
  }
}

// Maximum ms to wait for a HuggingFace embedding before skipping vector search.
// Cold model start can take 3-10s — this keeps the pipeline fast.
const EMBEDDING_TIMEOUT_MS = 500;

async function buildRAGContext(
  supabase: any,
  mode: string,
  userId: string | null,
  venueId: string | null,
  userMessage: string
): Promise<string> {
  // Try to generate embedding for semantic search — skip if model is cold (>500ms).
  const queryEmbedding = await Promise.race([
    generateQueryEmbedding(userMessage),
    new Promise<null>(resolve => setTimeout(() => resolve(null), EMBEDDING_TIMEOUT_MS)),
  ]);
  
  let context = "";

  if (mode === "customer") {
    // Parallel fetch: user prefs, vibe prefs, user memories (if embedding available)
    const promises: Promise<any>[] = [];

    // User preferences
    if (userId) {
      promises.push(
        supabase
          .from("customer_profiles")
          .select("dietary_preferences, allergies, favorite_cuisines, budget_preference, display_name")
          .eq("user_id", userId)
          .single()
      );
      promises.push(
        supabase
          .from("user_vibe_preferences")
          .select("tag_name, declared_weight")
          .eq("user_id", userId)
          .order("declared_weight", { ascending: false })
          .limit(5)
      );
      // RAG: user memory via vector search
      if (queryEmbedding) {
        promises.push(
          supabase.rpc("match_user_memory", {
            query_embedding: queryEmbedding,
            target_user_id: userId,
            match_count: 3,
          })
        );
      } else {
        promises.push(Promise.resolve({ data: null }));
      }
    } else {
      promises.push(Promise.resolve({ data: null }));
      promises.push(Promise.resolve({ data: null }));
      promises.push(Promise.resolve({ data: null }));
    }

    // RAG: venue profiles via vector search
    if (queryEmbedding) {
      promises.push(
        supabase.rpc("match_venue_profiles", {
          query_embedding: queryEmbedding,
          match_count: 8,
        })
      );
    } else {
      promises.push(Promise.resolve({ data: null }));
    }

    const [prefsResult, vibeResult, memoryResult, venueProfilesResult] = await Promise.all(promises);

    const userPrefs = prefsResult?.data;
    const vibePrefs = vibeResult?.data;
    const userMemories = memoryResult?.data;
    const venueProfiles = venueProfilesResult?.data;

    if (userPrefs) {
      context += `USER PROFILE:\nName: ${userPrefs.display_name || "Unknown"}\nDietary: ${userPrefs.dietary_preferences?.join(", ") || "None set"}\nAllergies: ${userPrefs.allergies?.join(", ") || "None"}\nFavorite Cuisines: ${userPrefs.favorite_cuisines?.join(", ") || "Not set"}\nBudget: ${userPrefs.budget_preference || "moderate"}\nVibe Preferences: ${vibePrefs?.map((v: any) => v.tag_name).join(", ") || "Not set"}\n\n`;
    }

    if (userMemories && userMemories.length > 0) {
      context += `RELEVANT MEMORIES:\n${userMemories.map((m: any) => `- ${m.content}`).join("\n")}\n\n`;
    }

    if (venueProfiles && venueProfiles.length > 0) {
      context += `SEMANTICALLY MATCHED VENUES:\n${venueProfiles.map((v: any) => `- ${v.metadata?.name || "Unknown Venue"}: ${v.content} (match: ${(v.similarity * 100).toFixed(0)}%)`).join("\n")}\n\n`;
    }

  } else if (mode === "venue" && venueId) {
    // Parallel fetch: menu, deals, hours, FAQs, RAG docs
    const promises: Promise<any>[] = [
      supabase
        .from("venue_menu_items")
        .select("id, name, description, category, base_price, sizes, available")
        .eq("venue_id", venueId)
        .eq("available", true)
        .limit(30),
      supabase
        .from("venue_deals_library")
        .select("headline, description, discount_text")
        .eq("venue_id", venueId)
        .eq("status", "published"),
      supabase
        .from("venue_operating_hours")
        .select("day_of_week, open_time, close_time")
        .eq("venue_id", venueId),
      supabase
        .from("venue_faqs")
        .select("question, answer")
        .eq("venue_id", venueId)
        .eq("is_active", true),
    ];

    // RAG: venue knowledge via vector search
    if (queryEmbedding) {
      promises.push(
        supabase.rpc("match_venue_knowledge", {
          query_embedding: queryEmbedding,
          target_venue_id: venueId,
          match_count: 8,
        })
      );
    } else {
      promises.push(Promise.resolve({ data: null }));
    }

    const [menuResult, dealsResult, hoursResult, faqsResult, venueDocsResult] = await Promise.all(promises);

    const menuItems = menuResult?.data;
    const deals = dealsResult?.data;
    const hours = hoursResult?.data;
    const faqs = faqsResult?.data;
    const venueDocs = venueDocsResult?.data;

    context += `MENU ITEMS:\n${menuItems?.map((m: any) => `- ${m.name} ($${m.base_price}) — ${m.description || "No description"}${m.sizes ? ` | Sizes: ${JSON.stringify(m.sizes)}` : ""} [ID: ${m.id}]`).join("\n") || "No menu items"}\n\n`;
    context += `CURRENT DEALS:\n${deals?.map((d: any) => `- ${d.headline}: ${d.description} (${d.discount_text})`).join("\n") || "No active deals"}\n\n`;
    context += `OPENING HOURS:\n${hours?.map((h: any) => `- ${h.day_of_week}: ${h.open_time} - ${h.close_time}`).join("\n") || "Not set"}\n\n`;
    context += `FAQs:\n${faqs?.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n") || "No FAQs"}\n\n`;

    if (venueDocs && venueDocs.length > 0) {
      context += `ADDITIONAL CONTEXT (from knowledge base):\n${venueDocs.map((d: any) => `- ${d.content}`).join("\n")}\n\n`;
    }

  } else if (mode === "owner" && venueId) {
    // Parallel fetch: venue profile, menu, deals, venue memory, recent orders
    const promises: Promise<any>[] = [
      supabase
        .from("venues")
        .select("name, description, venue_type, address, city, capacity")
        .eq("id", venueId)
        .single(),
      supabase
        .from("venue_menu_items")
        .select("name, description, category, base_price, available")
        .eq("venue_id", venueId),
      supabase
        .from("venue_deals_library")
        .select("headline, description, status, discount_text")
        .eq("venue_id", venueId),
      supabase
        .from("venue_memory")
        .select("content, memory_type, metadata")
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("orders")
        .select("id, total, created_at")
        .eq("venue_id", venueId)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(100),
    ];

    const [venueResult, menuResult, dealsResult, memoryResult, ordersResult] = await Promise.all(promises);

    const venue = venueResult?.data;
    const menuItems = menuResult?.data;
    const deals = dealsResult?.data;
    const venueMemories = memoryResult?.data;
    const orders = ordersResult?.data;

    if (venue) {
      context += `VENUE PROFILE:\nName: ${venue.name}\nType: ${venue.venue_type}\nAddress: ${venue.address}, ${venue.city}\nCapacity: ${venue.capacity}\nDescription: ${venue.description || "Not set"}\n\n`;
    }

    context += `CURRENT MENU (${menuItems?.length || 0} items):\n${menuItems?.map((m: any) => `- ${m.name} ($${m.base_price}) [${m.available ? "Available" : "UNAVAILABLE"}] — ${m.category}`).join("\n") || "No items"}\n\n`;
    context += `DEALS (${deals?.length || 0}):\n${deals?.map((d: any) => `- ${d.headline} (${d.status}): ${d.discount_text}`).join("\n") || "No deals"}\n\n`;

    if (orders && orders.length > 0) {
      const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
      context += `LAST 7 DAYS: ${orders.length} orders, $${totalRevenue.toFixed(2)} revenue\n\n`;
    }

    context += `VENUE MEMORY/NOTES:\n${venueMemories?.map((m: any) => `- [${m.memory_type}] ${m.content}`).join("\n") || "No stored memories"}\n\n`;
  }

  return context;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Health check endpoint for pre-warming
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'warm', ts: Date.now() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, mode, venue_id, session_id, user_lat, user_lng } = await req.json();
    
    if (!['customer', 'venue', 'owner'].includes(mode)) {
      throw new Error('Invalid mode');
    }

    if ((mode === 'venue' || mode === 'owner') && !venue_id) {
      throw new Error('venue_id required for venue/owner modes');
    }

    // Sanitize API keys: strip any non-ASCII / invisible unicode chars from copy-paste
    const sanitize = (s: string | undefined) => s ? s.replace(/[^\x20-\x7E]/g, '').trim() : undefined;
    const DEEPSEEK_API_KEY = sanitize(Deno.env.get("DEEPSEEK_API_KEY"));
    const LOVABLE_API_KEY = sanitize(Deno.env.get("LOVABLE_API_KEY"));
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const useDeepSeek = !!DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY && !LOVABLE_API_KEY) throw new Error("No AI API key configured (DEEPSEEK or LOVABLE)");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const authHeader = req.headers.get('authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const latestUserMessage = messages[messages.length - 1]?.content || '';
    const reqStartMs = Date.now();
    let dbStartMs = 0;
    let dbEndMs = 0;
    
    console.log(`\n========== AI GATEWAY REQUEST ==========`);
    console.log(`[REQUEST] Mode: ${mode}, User: ${userId?.slice(0, 8) || 'anon'}`);
    console.log(`[REQUEST] Message: "${latestUserMessage.slice(0, 100)}..."`);
    console.log(`[REQUEST] LLM: DeepSeek (${LLM_MODEL})`);
    
    // Intent classification (local, no AI call)
    const intent = classifyIntentLocal(latestUserMessage, mode, venue_id);
    console.log(`[INTENT] Classified locally as: ${intent}`);
    
    // STEP: Check quota
    let quotaInfo: { allowed: boolean; remaining: number; plan: string } | null = null;
    if (userId && intent !== 'VENUE') {
      const { data: quotaData, error: quotaError } = await supabase.rpc('check_ai_quota', {
        p_user_id: userId,
        p_intent: intent
      });
      
      if (!quotaError && quotaData) {
        quotaInfo = quotaData;
        if (!quotaInfo!.allowed) {
          console.log(`[QUOTA] Exceeded for user ${userId}`);
          return new Response(JSON.stringify({ 
            error: "quota_exceeded",
            message: "You've used your AI tokens for today. Top up to continue.",
            intent,
            remaining: 0,
            plan: quotaInfo!.plan,
            requires_topup: true
          }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // BILLING LOGIC: venue chats are free, customer/owner consume credits
    if (mode === "venue" && userId) {
      // Venue chats are FREE — just rate limit to prevent abuse
      const { data: todayUsage } = await supabase
        .from("ai_usage")
        .select("venue_tokens_used")
        .eq("user_id", userId)
        .eq("period_type", "daily")
        .gte("period_start", new Date().toISOString().split("T")[0]);

      const totalVenueTokensToday = todayUsage?.reduce((sum: number, r: any) => sum + (r.venue_tokens_used || 0), 0) || 0;
      if (totalVenueTokensToday > 50000) {
        return new Response(JSON.stringify({
          error: "daily_limit",
          message: "You've reached your daily venue chat limit. Come back tomorrow!"
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if ((mode === "customer" || mode === "owner") && userId) {
      // Already checked via quota above
    }

    // Build context — both keyword-based (existing) AND RAG-based (new)
    let contextSnippets: string[] = [];
    let venueName = "this venue";
    let menuDataForResponse: any[] = [];
    let venueDataForResponse: any[] = [];

    dbStartMs = Date.now();

    // ========================================================================
    // RAG CONTEXT + ALLERGY FETCH — both fire in parallel with keyword queries
    // ========================================================================
    const ragPromise = buildRAGContext(supabase, mode, userId, venue_id, latestUserMessage);
    // Allergy fetch runs in parallel with RAG instead of sequentially after it
    const allergyPromise = userId
      ? supabase.from('user_memory').select('content').eq('user_id', userId).eq('memory_type', 'allergy')
      : Promise.resolve({ data: null });

    // ========================================================================
    // CUSTOMER MODE: Keyword-based Menu & Venue Discovery (existing logic)
    // ========================================================================
    if (mode === 'customer' && !venue_id) {
      const { terms: searchTerms, original: originalTerms } = extractSearchTerms(latestUserMessage);
      const hasMenuQuery = hasMenuIntent(latestUserMessage);
      const venueTypeFilter = extractVenueTypeFilter(latestUserMessage);
      
      let venueQuery = supabase
        .from('venues')
        .select('id, name, description, venue_type, address, city, latitude, longitude')
        .eq('approval_status', 'approved');
      
      if (venueTypeFilter && !hasMenuQuery) {
        venueQuery = venueQuery.ilike('venue_type', `%${venueTypeFilter}%`);
      }
      
      const [venueResult, dealsResult, pushDealsResult] = await Promise.all([
        venueQuery.limit(50),
        supabase
          .from('venue_deals')
          .select('title, description, venues(name)')
          .eq('active', true)
          .limit(5),
        supabase
          .from('venue_deals_library')
          .select('headline, description, discount_text, venue_id, end_date, venues(name, city, latitude, longitude)')
          .eq('status', 'published')
          .gte('end_date', new Date().toISOString())
          .limit(20),
      ]);

      const { data: venues, error: venuesError } = venueResult;
      const { data: allDeals } = dealsResult;
      const { data: pushDeals } = pushDealsResult;
      
      if (venuesError) console.error(`[DISCOVERY] Venue fetch error:`, venuesError);
      
      if (venues && venues.length > 0) {
        let venuesWithDistance = venues.map((v: any) => {
          let distance: number | null = null;
          if (user_lat && user_lng && v.latitude != null && v.longitude != null) {
            const vLat = typeof v.latitude === 'string' ? parseFloat(v.latitude) : Number(v.latitude);
            const vLng = typeof v.longitude === 'string' ? parseFloat(v.longitude) : Number(v.longitude);
            if (Number.isFinite(vLat) && Number.isFinite(vLng)) {
              distance = haversineDistance(user_lat, user_lng, vLat, vLng);
              if (!Number.isFinite(distance)) distance = null;
            }
          }
          return { ...v, distance };
        });
        
        if (user_lat && user_lng) {
          venuesWithDistance = venuesWithDistance
            .filter((v: any) => v.distance !== null)
            .sort((a: any, b: any) => (a.distance || 999) - (b.distance || 999));
        }
        
        const topVenues = venuesWithDistance.slice(0, 10);
        const nearbyVenues = topVenues.filter((v: any) => v.distance === null || v.distance <= 10);
        
        const venuesForContext = (nearbyVenues.length > 0 ? nearbyVenues : topVenues).slice(0, 5);
        if (venuesForContext.length > 0) {
          const venuesList = venuesForContext.map((v: any) => {
            const distStr = v.distance !== null ? ` (${v.distance.toFixed(1)}km)` : '';
            return `- **${v.name}** [VENUE_ID:${v.id}]${distStr} - ${v.venue_type}`;
          }).join('\n');
          contextSnippets.push(`\nNEARBY VENUES:\n${venuesList}`);
        }

        for (const v of topVenues) {
          const dist = (typeof v.distance === 'number' && Number.isFinite(v.distance))
            ? parseFloat(v.distance.toFixed(1))
            : null;
          venueDataForResponse.push({
            id: v.id, name: v.name, venue_type: v.venue_type, address: v.address,
            distance_km: dist, latitude: v.latitude ?? null, longitude: v.longitude ?? null
          });
        }
        
        // MENU SEARCH
        if (searchTerms.length > 0) {
          const venueIds = venues.map((v: any) => v.id);
          const { items: menuItems } = await searchMenuItems(supabase, venueIds, searchTerms);
          
          if (menuItems.length > 0) {
            const itemsByVenue: Record<string, any[]> = {};
            for (const item of menuItems) {
              if (!itemsByVenue[item.venue_id]) itemsByVenue[item.venue_id] = [];
              itemsByVenue[item.venue_id].push(item);
            }
            
            const menuContext: string[] = [];
            const sortedVenueIds = Object.keys(itemsByVenue).sort((a, b) => {
              const vA = venuesWithDistance.find((v: any) => v.id === a);
              const vB = venuesWithDistance.find((v: any) => v.id === b);
              return (vA?.distance || 999) - (vB?.distance || 999);
            });
            
            for (const vid of sortedVenueIds) {
              const venue = venuesWithDistance.find((v: any) => v.id === vid);
              if (venue) {
                const distStr = venue.distance !== null ? ` (${venue.distance.toFixed(1)}km)` : '';
                const venueItems = itemsByVenue[vid].slice(0, 5);
                const items = venueItems.map((i: any) => `  • ${i.name} - $${i.base_price}`).join('\n');
                menuContext.push(`**${venue.name}**${distStr}:\n${items}`);
                
                for (const item of venueItems) {
                  menuDataForResponse.push({
                    id: item.id || `${vid}-${item.name.replace(/\s+/g, '-').toLowerCase()}`,
                    name: item.name, description: item.description || '', category: item.category || '',
                    base_price: item.base_price, image_url: item.image_url || '',
                    venue_id: vid, venue_name: venue.name
                  });
                  if (!venueDataForResponse.find((v: any) => v.id === vid)) {
                    venueDataForResponse.push({
                      id: vid, name: venue.name, venue_type: venue.venue_type, address: venue.address,
                      distance_km: venue.distance !== null ? parseFloat(venue.distance.toFixed(1)) : null,
                      latitude: venue.latitude || null, longitude: venue.longitude || null
                    });
                  }
                }
              }
            }
            if (menuContext.length > 0) {
              contextSnippets.push(`\n✅ MATCHING MENU ITEMS FOUND:\n${menuContext.join('\n\n')}`);
            }
          } else {
            contextSnippets.push(`\n❌ NO MENU ITEMS FOUND matching: "${originalTerms.join(', ')}"`);
          }
        }
      } else {
        contextSnippets.push(`\nNo venues currently available in the system.`);
      }
      
      if (allDeals && allDeals.length > 0) {
        const dealsText = allDeals.map((deal: any) => `- ${deal.venues?.name || 'Venue'}: ${deal.title}`).join('\n');
        contextSnippets.push(`\nCURRENT DEALS:\n${dealsText}`);
      }

      // BOOSTED DEALS from venue_deals_library (push deals system)
      if (pushDeals && pushDeals.length > 0) {
        let dealsWithDistance = pushDeals.map((d: any) => {
          let distance: number | null = null;
          const v = d.venues;
          if (user_lat && user_lng && v?.latitude != null && v?.longitude != null) {
            const vLat = typeof v.latitude === 'string' ? parseFloat(v.latitude) : Number(v.latitude);
            const vLng = typeof v.longitude === 'string' ? parseFloat(v.longitude) : Number(v.longitude);
            if (Number.isFinite(vLat) && Number.isFinite(vLng)) {
              distance = haversineDistance(user_lat, user_lng, vLat, vLng);
              if (!Number.isFinite(distance)) distance = null;
            }
          }
          return { ...d, distance };
        });

        if (user_lat && user_lng) {
          dealsWithDistance = dealsWithDistance
            .filter((d: any) => d.distance !== null)
            .sort((a: any, b: any) => (a.distance || 999) - (b.distance || 999));
        }

        const topDeals = dealsWithDistance.slice(0, 8);
        if (topDeals.length > 0) {
          const dealsText = topDeals.map((d: any) => {
            const distStr = d.distance !== null ? ` (${d.distance.toFixed(1)}km)` : '';
            const venueName = d.venues?.name || 'Venue';
            return `- **${venueName}**${distStr}: "${d.headline}" — ${d.discount_text || d.description || ''}`;
          }).join('\n');
          contextSnippets.push(`\n🔥 BOOSTED DEALS NEARBY:\n${dealsText}`);
        }
      }
    }

    // ========================================================================
    // VENUE MODE: Single venue context (keyword-based, existing)
    // ========================================================================
    if (venue_id) {
      const venuePromise = supabase
        .from('venues')
        .select('name, description, venue_type, address, city')
        .eq('id', venue_id)
        .single();

      const menuPromise = supabase
        .from('venue_menu_items')
        .select('name, description, base_price, category')
        .eq('venue_id', venue_id)
        .eq('available', true)
        .limit(50);

      const dealsPromise = supabase
        .from('venue_deals')
        .select('title, description, discount_type, discount_value')
        .eq('venue_id', venue_id)
        .eq('active', true)
        .limit(10);

      const ordersPromise = mode === 'owner'
        ? supabase
            .from('orders')
            .select('id, total, created_at')
            .eq('venue_id', venue_id)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(100)
        : Promise.resolve({ data: null });

      const [venueResult, menuResult, dealsResult, ordersResult] = await Promise.all([
        venuePromise, menuPromise, dealsPromise, ordersPromise,
      ]);

      const venue = venueResult.data;
      if (venue) {
        venueName = venue.name;
        contextSnippets.push(`Venue: ${venue.name} (${venue.venue_type}) - ${venue.description || ''}`);
        contextSnippets.push(`Location: ${venue.address}, ${venue.city}`);
      }

      const menuItems = menuResult.data;
      if (menuItems && menuItems.length > 0) {
        const menuText = menuItems.map((item: any) => 
          `- ${item.name} ($${item.base_price}) - ${item.description || ''}`
        ).join('\n');
        contextSnippets.push(`\nMENU:\n${menuText}`);
      }

      const deals = dealsResult.data;
      if (deals && deals.length > 0) {
        const dealsText = deals.map((deal: any) => `- ${deal.title}: ${deal.description}`).join('\n');
        contextSnippets.push(`\nACTIVE DEALS:\n${dealsText}`);
      }

      if (mode === 'owner') {
        const orders = ordersResult.data;
        if (orders) {
          const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
          contextSnippets.push(`\nLAST 7 DAYS: ${orders.length} orders, $${totalRevenue.toFixed(2)} revenue`);
        }
      }
    }

    // Await RAG + allergy together (parallel)
    const [ragContext, allergyResult] = await Promise.all([ragPromise, allergyPromise]);
    if (ragContext) {
      contextSnippets.push(`\n--- RAG CONTEXT ---\n${ragContext}`);
    }

    dbEndMs = Date.now();

    const allergies = allergyResult?.data;
    if (allergies && allergies.length > 0) {
      contextSnippets.push(`\n⚠️ USER ALLERGIES: ${allergies.map((a: any) => a.content).join(', ')}`);
    }

    // Build system prompt based on mode
    let systemPrompt = "";
    if (mode === "customer") {
      systemPrompt = CUSTOMER_AI_SYSTEM_PROMPT;
    } else if (mode === "venue") {
      systemPrompt = VENUE_AI_SYSTEM_PROMPT(venueName);
    } else if (mode === "owner") {
      systemPrompt = OWNER_AI_SYSTEM_PROMPT(venueName);
    }
    
    if (contextSnippets.length > 0) {
      systemPrompt += `\n\n---\nCONTEXT DATA (USE THIS TO ANSWER):\n${contextSnippets.join('\n')}`;
    }

    const dbTimeMs = dbEndMs && dbStartMs ? dbEndMs - dbStartMs : 0;
    console.log(`[CONTEXT] ${contextSnippets.length} snippets, ${systemPrompt.length} chars total`);
    console.log(`[TIMING] DB: ${dbTimeMs}ms, Total pre-AI: ${Date.now() - reqStartMs}ms`);
    console.log(`========== END AI GATEWAY REQUEST ==========\n`);
    
    const timingHeaders = {
      "X-DB-Time-Ms": String(dbTimeMs),
      "X-Req-Start-Ms": String(reqStartMs),
    };

    // Log user message (fire-and-forget)
    const currentSessionId = session_id || crypto.randomUUID();
    const userMessage = messages[messages.length - 1];
    
    if (userId && userMessage?.role === 'user') {
      supabase.from('ai_messages').insert({
        session_id: currentSessionId,
        user_id: userId,
        venue_id: venue_id || null,
        mode,
        role: 'user',
        content: userMessage.content
      }).then(() => {});
    }

    // Build data blocks for frontend parsing
    let menuDataBlock = '';
    let venueDataBlock = '';
    
    if (menuDataForResponse.length > 0) {
      menuDataBlock = `[MENU_DATA]${JSON.stringify(menuDataForResponse)}[/MENU_DATA]`;
    }
    if (venueDataForResponse.length > 0) {
      venueDataBlock = `[VENUE_DATA]${JSON.stringify(venueDataForResponse)}[/VENUE_DATA]`;
    }

    // Only use the last 10 messages
    const trimmedMessages = messages.slice(-10);

    // Build messages array for DeepSeek
    const messagesForLLM = [
      { role: "system", content: systemPrompt },
      ...trimmedMessages,
    ];

    // Select LLM provider: DeepSeek primary, Lovable AI fallback
    const llmUrl = useDeepSeek
      ? `${LLM_BASE_URL}/v1/chat/completions`
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const llmKey = useDeepSeek ? DEEPSEEK_API_KEY : LOVABLE_API_KEY;
    const llmModel = useDeepSeek ? LLM_MODEL : "google/gemini-3-flash-preview";

    let response = await fetch(llmUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llmKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llmModel,
        messages: messagesForLLM,
        stream: true,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    // Auto-fallback to Lovable AI if DeepSeek fails
    if (!response.ok && useDeepSeek && LOVABLE_API_KEY) {
      console.warn(`[FALLBACK] DeepSeek returned ${response.status}, falling back to Lovable AI`);
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: messagesForLLM,
          stream: true,
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
    }
    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("DeepSeek API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record token usage (fire-and-forget) — estimated since streaming
    if (userId) {
      const estimatedTokens = estimateTokens(latestUserMessage + systemPrompt) * 2;
      supabase.rpc('record_ai_usage', {
        p_user_id: userId,
        p_intent: intent,
        p_tokens_used: estimatedTokens
      }).then(() => {});
    }

    // If we have menu/venue data, append to stream
    if (menuDataBlock || venueDataBlock) {
      const reader = response.body?.getReader();
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          if (!reader) { controller.close(); return; }
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            const dataBlockContent = `${menuDataBlock}${venueDataBlock}`;
            if (dataBlockContent) {
              const payload = { choices: [{ delta: { content: dataBlockContent } }] };
              const finalChunk = `data: ${JSON.stringify(payload)}\n\n`;
              controller.enqueue(encoder.encode(finalChunk));
            }
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        }
      });

      return new Response(stream, {
        headers: { 
          ...corsHeaders, ...timingHeaders,
          "Content-Type": "text/event-stream",
          "X-Session-Id": currentSessionId,
          "X-Intent": intent,
          "X-Remaining-Tokens": String(quotaInfo?.remaining ?? -1),
        },
      });
    }

    return new Response(response.body, {
      headers: { 
        ...corsHeaders, ...timingHeaders,
        "Content-Type": "text/event-stream",
        "X-Session-Id": currentSessionId,
        "X-Intent": intent,
        "X-Remaining-Tokens": String(quotaInfo?.remaining ?? -1),
      },
    });
  } catch (error) {
    console.error("AI gateway error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
