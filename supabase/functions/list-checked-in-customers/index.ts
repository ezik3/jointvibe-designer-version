import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth (venue staff)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const venueId = body?.venue_id as string | undefined;

    if (!venueId || !isUuid(venueId)) {
      return new Response(JSON.stringify({ error: "Invalid venue_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: venue owner or active employee
    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id, owner_user_id")
      .eq("id", venueId)
      .single();

    if (venueError || !venue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isOwner = venue.owner_user_id === userId;

    let isEmployee = false;
    if (!isOwner) {
      const { data: employeeLink } = await supabase
        .from("employee_venue_links")
        .select("id")
        .eq("venue_id", venueId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      isEmployee = !!employeeLink;
    }

    if (!isOwner && !isEmployee) {
      return new Response(JSON.stringify({ error: "Not authorized for this venue" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Checked-in customers
    const { data: checkIns, error: checkInError } = await supabase
      .from("check_ins")
      .select("user_id, table_number, checked_in_at")
      .eq("venue_id", venueId)
      .is("checked_out_at", null)
      .order("checked_in_at", { ascending: false });

    if (checkInError) {
      console.error("check_ins query error:", checkInError);
      return new Response(JSON.stringify({ error: "Failed to load customers" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!checkIns?.length) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = checkIns.map((c) => c.user_id);

    // Check customer_profiles first
    const { data: customerProfiles, error: cpError } = await supabase
      .from("customer_profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", userIds);

    if (cpError) {
      console.warn("customer_profiles query error:", cpError);
    }

    // Also check profiles table as fallback
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds);

    if (profilesError) {
      console.warn("profiles query error:", profilesError);
    }

    // Get user emails from auth as final fallback for display
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const userMap = new Map(
      authUsers?.users?.map(u => [u.id, u.email || u.phone]) || []
    );

    const customers = checkIns.map((c) => {
      const customerProfile = customerProfiles?.find((p) => p.user_id === c.user_id);
      const profile = profiles?.find((p) => p.user_id === c.user_id);
      const authEmail = userMap.get(c.user_id);
      
      // Priority: customer_profiles.display_name > profiles.full_name > auth email > truncated ID
      const displayName = customerProfile?.display_name 
        || profile?.full_name 
        || (authEmail ? authEmail.split("@")[0] : null)
        || `Guest ${String(c.user_id).slice(0, 6)}`;
      
      const avatarUrl = customerProfile?.avatar_url || profile?.avatar_url || null;
      
      return {
        user_id: c.user_id,
        table_number: c.table_number,
        checked_in_at: c.checked_in_at,
        display_name: displayName,
        avatar_url: avatarUrl,
      };
    });

    return new Response(JSON.stringify(customers), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
