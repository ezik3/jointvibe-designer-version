// Cleanup Expired Posts — runs hourly via pg_cron.
// Deletes posts older than 24h that are NOT saved by any user (saved_posts).
// Posts saved by their owner remain in the DB; they're already excluded from
// public surfaces by client-side .gte("created_at", ...) filters and only
// surface on the owner's profile.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Saved post ids (any user saved these — keep them in DB).
    const { data: saved, error: savedErr } = await admin
      .from("saved_posts")
      .select("post_id");

    if (savedErr) {
      console.error("Failed to load saved_posts:", savedErr);
      return new Response(
        JSON.stringify({ error: savedErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const savedIds = Array.from(
      new Set((saved ?? []).map((r: { post_id: string }) => r.post_id)),
    );

    // Find candidates older than 24h (limit to avoid huge transactions).
    let candidatesQuery = admin
      .from("posts")
      .select("id")
      .lt("created_at", cutoff)
      .limit(500);

    const { data: candidates, error: candErr } = await candidatesQuery;
    if (candErr) {
      console.error("Failed to load candidates:", candErr);
      return new Response(
        JSON.stringify({ error: candErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const toDelete = (candidates ?? [])
      .map((p: { id: string }) => p.id)
      .filter((id) => !savedIds.includes(id));

    let deleted = 0;
    if (toDelete.length > 0) {
      const { error: delErr, count } = await admin
        .from("posts")
        .delete({ count: "exact" })
        .in("id", toDelete);

      if (delErr) {
        console.error("Delete failed:", delErr);
        return new Response(
          JSON.stringify({ error: delErr.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      deleted = count ?? toDelete.length;
    }

    const result = {
      ok: true,
      cutoff,
      candidates: candidates?.length ?? 0,
      saved_kept: (candidates?.length ?? 0) - toDelete.length,
      deleted,
    };
    console.log("cleanup-expired-posts:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
