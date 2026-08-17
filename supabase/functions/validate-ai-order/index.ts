import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { venue_id, items, type, notes } = await req.json();

    if (!venue_id || !items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ valid: false, errors: ["venue_id and items array are required"] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate EVERY item exists in THIS venue's menu
    const itemIds = items.map((i: any) => i.menu_item_id);
    const { data: validItems, error } = await supabase
      .from("venue_menu_items")
      .select("id, name, base_price, available")
      .eq("venue_id", venue_id)
      .in("id", itemIds);

    if (error) throw new Error(`Database error: ${error.message}`);

    // Check all items are valid and available
    const validItemMap = new Map(validItems?.map((i: any) => [i.id, i]) || []);
    const validationErrors: string[] = [];

    for (const item of items) {
      const dbItem = validItemMap.get(item.menu_item_id);
      if (!dbItem) {
        validationErrors.push(`Item "${item.name}" does not exist in this venue's menu`);
      } else if (!dbItem.available) {
        validationErrors.push(`"${dbItem.name}" is currently unavailable`);
      } else if (Math.abs(dbItem.base_price - item.price) > 0.01) {
        validationErrors.push(`Price mismatch for "${dbItem.name}": AI said $${item.price}, actual is $${dbItem.base_price}`);
      }
    }

    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({ valid: false, errors: validationErrors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate verified total
    const verifiedTotal = items.reduce((sum: number, item: any) => {
      const dbItem = validItemMap.get(item.menu_item_id)!;
      return sum + (dbItem.base_price * item.quantity);
    }, 0);

    return new Response(
      JSON.stringify({
        valid: true,
        verified_total: verifiedTotal,
        verified_items: items.map((item: any) => ({
          ...item,
          verified_price: validItemMap.get(item.menu_item_id)?.base_price,
        })),
        order_type: type || "dine_in",
        notes: notes || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Validate AI order error:", error);
    return new Response(
      JSON.stringify({ valid: false, errors: [error instanceof Error ? error.message : "Unknown error"] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
