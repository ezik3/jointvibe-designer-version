import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Authenticate caller — must be a logged-in venue owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Unauthorized");

    const { email } = await req.json();
    if (!email || typeof email !== "string") throw new Error("email required");

    // Look up by email using admin API
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) throw listError;

    const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase().trim());

    if (!found) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Prevent inviting yourself
    if (found.id === authData.user.id) {
      return new Response(
        JSON.stringify({ found: false, reason: "self" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get display name from customer profile
    const { data: profile } = await supabase
      .from("customer_profiles")
      .select("display_name")
      .eq("user_id", found.id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        found: true,
        user_id: found.id,
        display_name: profile?.display_name || found.email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
