import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sync all venue data to embeddings
// Call this after menu/deals/profile updates to keep AI knowledge current
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venue_id, sync_type } = await req.json();

    if (!venue_id) {
      throw new Error("venue_id is required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate venue exists
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('id, name, description, venue_type, address, city')
      .eq('id', venue_id)
      .single();

    if (venueError || !venue) {
      throw new Error("Venue not found");
    }

    const documentsToSync: { doc_type: string; content: string; metadata: Record<string, unknown> }[] = [];

    // Sync types: 'all', 'menu', 'deals', 'profile'
    const syncAll = sync_type === 'all' || !sync_type;

    // 1. Sync venue profile
    if (syncAll || sync_type === 'profile') {
      documentsToSync.push({
        doc_type: 'venue_profile',
        content: `Venue: ${venue.name}. Type: ${venue.venue_type}. ${venue.description || ''}. Location: ${venue.address}, ${venue.city}.`,
        metadata: { venue_id, name: venue.name, type: venue.venue_type }
      });
    }

    // 2. Sync menu items
    if (syncAll || sync_type === 'menu') {
      const { data: menuItems } = await supabase
        .from('venue_menu_items')
        .select('id, name, description, price, category, available')
        .eq('venue_id', venue_id);

      if (menuItems) {
        for (const item of menuItems) {
          documentsToSync.push({
            doc_type: 'menu_item',
            content: `Menu item: ${item.name}. Category: ${item.category}. Price: $${item.price}. ${item.description || ''}. ${item.available ? 'Available' : 'Currently unavailable'}.`,
            metadata: { 
              item_id: item.id, 
              name: item.name, 
              price: item.price, 
              category: item.category,
              available: item.available
            }
          });
        }
      }
    }

    // 3. Sync deals
    if (syncAll || sync_type === 'deals') {
      const { data: deals } = await supabase
        .from('venue_deals')
        .select('id, title, description, discount_type, discount_value, active, start_date, end_date')
        .eq('venue_id', venue_id)
        .eq('active', true);

      if (deals) {
        for (const deal of deals) {
          const discountText = deal.discount_type === 'percentage' 
            ? `${deal.discount_value}% off` 
            : `$${deal.discount_value} off`;
          
          documentsToSync.push({
            doc_type: 'deal',
            content: `Deal: ${deal.title}. ${discountText}. ${deal.description || ''}. Valid from ${deal.start_date} to ${deal.end_date}.`,
            metadata: { 
              deal_id: deal.id, 
              title: deal.title, 
              discount_type: deal.discount_type,
              discount_value: deal.discount_value
            }
          });
        }
      }
    }

    // Delete old documents for this venue (of the types we're syncing)
    const typesToDelete = syncAll 
      ? ['venue_profile', 'menu_item', 'deal']
      : sync_type === 'menu' 
        ? ['menu_item']
        : sync_type === 'deals'
          ? ['deal']
          : ['venue_profile'];

    await supabase
      .from('ai_knowledge_docs')
      .delete()
      .eq('venue_id', venue_id)
      .in('doc_type', typesToDelete);

    // Insert new documents (without embeddings - generate-embeddings handles that)
    if (documentsToSync.length > 0) {
      const docsToInsert = documentsToSync.map(doc => ({
        venue_id,
        doc_type: doc.doc_type,
        content: doc.content,
        metadata: doc.metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('ai_knowledge_docs')
        .insert(docsToInsert);

      if (insertError) {
        console.error("Failed to insert docs:", insertError);
        throw new Error("Failed to sync documents");
      }

      // Optionally trigger embedding generation
      // For now, embeddings are generated on-demand or via generate-embeddings function
    }

    return new Response(JSON.stringify({ 
      success: true,
      venue_id,
      synced: documentsToSync.length,
      types: [...new Set(documentsToSync.map(d => d.doc_type))]
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Sync embeddings error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
