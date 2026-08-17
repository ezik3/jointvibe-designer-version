import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Unauthorized");

    const { query, venue_id } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ users: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify caller owns the venue
    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id, owner_user_id")
      .eq("id", venue_id)
      .single();

    if (venueError || !venue || venue.owner_user_id !== authData.user.id) {
      throw new Error("Not authorized for this venue");
    }

    const searchTerm = `%${query.trim().toLowerCase()}%`;

    // Search customer_profiles by display_name
    const { data: profiles, error: profileError } = await supabase
      .from("customer_profiles")
      .select("user_id, display_name, avatar_url")
      .ilike("display_name", searchTerm)
      .neq("user_id", authData.user.id) // exclude self
      .limit(10);

    if (profileError) throw profileError;

    const foundUserIds = new Set((profiles || []).map((p: any) => p.user_id));

    // Also search auth.users by email if query looks like an email fragment
    let emailProfiles: any[] = [];
    if (query.includes("@") || query.includes(".com") || query.includes("test")) {
      // Use admin API to search users by email
      const { data: authUsers } = await supabase.auth.admin.listUsers({
        perPage: 20,
      });

      if (authUsers?.users) {
        const matchingAuthUsers = authUsers.users.filter(
          (u: any) => u.email?.toLowerCase().includes(query.trim().toLowerCase()) && u.id !== authData.user.id
        );

        // Get profiles for email-matched users not already found by display_name
        const emailUserIds = matchingAuthUsers
          .map((u: any) => u.id)
          .filter((id: string) => !foundUserIds.has(id));

        if (emailUserIds.length > 0) {
          const { data: extraProfiles } = await supabase
            .from("customer_profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", emailUserIds);

          // Create map of user_id -> email for display fallback
          const emailMap = new Map(matchingAuthUsers.map((u: any) => [u.id, u.email]));

          emailProfiles = (extraProfiles || []).map((p: any) => ({
            ...p,
            display_name: p.display_name || emailMap.get(p.user_id) || "Unknown User",
          }));
        }
      }
    }

    const allProfiles = [...(profiles || []), ...emailProfiles];

    // Get existing active invites for this venue to mark already-invited users
    const { data: existingInvites } = await supabase
      .from("venue_test_invites")
      .select("invited_user_id, status")
      .eq("venue_id", venue_id)
      .in("status", ["pending", "accepted"]);

    const invitedMap = new Map(
      (existingInvites || []).map((i: any) => [i.invited_user_id, i.status])
    );

    const users = allProfiles.map((p: any) => ({
      user_id: p.user_id,
      display_name: p.display_name || "Unknown User",
      avatar_url: p.avatar_url,
      invite_status: invitedMap.get(p.user_id) || null,
    }));

    return new Response(
      JSON.stringify({ users }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
