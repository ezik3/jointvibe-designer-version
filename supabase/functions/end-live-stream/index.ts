import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log(`[end-live-stream] ▶ Called at ${new Date().toISOString()}`);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to verify user token - standard proven pattern
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.log(`[end-live-stream] ✘ getUser failed: ${userError?.message}`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log(`[end-live-stream] ✅ Auth OK, userId=${userId}`);

    const { streamId } = await req.json();
    console.log(`[end-live-stream] 🔍 streamId=${streamId}`);

    if (!streamId) {
      return new Response(JSON.stringify({ error: "streamId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current stream state
    const { data: stream } = await supabaseAdmin
      .from("live_streams")
      .select("id, host_user_id, status, started_at, ended_at")
      .eq("id", streamId)
      .maybeSingle();

    if (!stream || stream.host_user_id !== userId) {
      console.log(`[end-live-stream] ✘ Not authorized or not found`);
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (stream.status === "ended") {
      console.log(`[end-live-stream] ⚠ Already ended`);
      return new Response(JSON.stringify({ success: true, alreadyEnded: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("live_streams")
      .update({ status: "ended", ended_at: endedAt })
      .eq("id", streamId);

    if (updateError) {
      console.error(`[end-live-stream] ✘ Update failed:`, updateError);
      return new Response(JSON.stringify({ error: "Failed to end stream" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const durationMs = new Date(endedAt).getTime() - new Date(stream.started_at).getTime();
    console.log(`[end-live-stream] ✅ Ended. duration=${Math.round(durationMs / 1000)}s`);

    return new Response(JSON.stringify({ success: true, durationSeconds: Math.round(durationMs / 1000) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[end-live-stream] ✘ Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
