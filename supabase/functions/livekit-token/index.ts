import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function createLivekitToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  grants: Record<string, unknown>,
  ttlSeconds = 14400,
): Promise<string> {
  const secret = new TextEncoder().encode(apiSecret);
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ video: grants, sub: identity })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(apiKey)
    .setSubject(identity)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

Deno.serve(async (req) => {
  // Always handle OPTIONS first for CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log(`[livekit-token] ▶ Called at ${new Date().toISOString()}`);
  console.log(`[livekit-token] 🔍 SUPABASE_URL=${Deno.env.get("SUPABASE_URL")}`);

  try {
    const authHeader = req.headers.get("Authorization");
    console.log(`[livekit-token] Auth header present: ${!!authHeader}, starts with Bearer: ${authHeader?.startsWith("Bearer ")}`);
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[livekit-token] ✘ No valid auth header");
      return new Response(JSON.stringify({ error: "Unauthorized - no token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to verify the user's JWT via getUser
    // This is the standard, proven Supabase auth pattern
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    console.log(`[livekit-token] Token prefix: ${token.substring(0, 20)}...`);

    // Use the admin client to verify the token and get user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.log(`[livekit-token] ✘ getUser failed: ${userError?.message || "no user returned"}`);
      return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log(`[livekit-token] ✅ Auth OK, userId=${userId}, email=${user.email}`);

    const { action, streamId, title, city, country, venueId } = await req.json();
    console.log(`[livekit-token] 🔍 action=${action}, streamId=${streamId || "N/A"}`);

    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");

    if (!livekitApiKey || !livekitApiSecret) {
      console.log("[livekit-token] ✘ LiveKit env vars missing");
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "host") {
      // Check for existing active stream
      const { data: existingStream } = await supabaseAdmin
        .from("live_streams")
        .select("id, status, started_at")
        .eq("host_user_id", userId)
        .eq("status", "live")
        .maybeSingle();

      if (existingStream) {
        console.log(`[livekit-token] ⚠ User already has active stream: ${existingStream.id}`);
        // End the stale stream and continue
        await supabaseAdmin
          .from("live_streams")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", existingStream.id);
        console.log(`[livekit-token] Ended stale stream ${existingStream.id}`);
      }

      const roomName = `live_${userId}_${Date.now()}`;

      const { data: stream, error: insertError } = await supabaseAdmin
        .from("live_streams")
        .insert({
          host_user_id: userId,
          room_name: roomName,
          title: title || "Live Stream",
          city: city || null,
          country: country || null,
          venue_id: venueId || null,
          status: "live",
        })
        .select("id, started_at")
        .single();

      if (insertError) {
        console.error("[livekit-token] ✘ DB insert failed:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create stream" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[livekit-token] ✅ Stream INSERTED: streamId=${stream.id}, started_at=${stream.started_at}, room=${roomName}, status=live`);

      const jwtToken = await createLivekitToken(livekitApiKey, livekitApiSecret, userId, {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });

      const wsUrl = Deno.env.get("VITE_LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_WS_URL") || "";
      console.log(`[livekit-token] 🔗 wsUrl=${wsUrl ? "SET" : "EMPTY"}`);

      return new Response(
        JSON.stringify({ streamId: stream.id, roomName, token: jwtToken, wsUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "viewer") {
      if (!streamId) {
        return new Response(
          JSON.stringify({ error: "streamId is required for viewers" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: stream, error: streamError } = await supabaseAdmin
        .from("live_streams")
        .select("id, room_name, status")
        .eq("id", streamId)
        .maybeSingle();

      if (streamError || !stream) {
        return new Response(
          JSON.stringify({ error: "Stream not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (stream.status !== "live") {
        return new Response(
          JSON.stringify({ error: "Stream has ended" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const jwtToken = await createLivekitToken(livekitApiKey, livekitApiSecret, userId, {
        roomJoin: true,
        room: stream.room_name,
        canPublish: false,
        canSubscribe: true,
      });

      const wsUrl = Deno.env.get("VITE_LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_WS_URL") || "";

      return new Response(
        JSON.stringify({ roomName: stream.room_name, token: jwtToken, wsUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use 'host' or 'viewer'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[livekit-token] ✘ Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
