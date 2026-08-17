import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const WebhookSchema = z.object({
  job_id: z.string().uuid(),
  status: z.enum([
    "extracting_frames",
    "reconstructing",
    "refining",
    "optimizing",
    "complete",
    "failed",
  ]),
  current_stage: z.number().int().min(0).max(3).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  preview_model_url: z.string().url().optional(),
  refined_model_url: z.string().url().optional(),
  final_model_url: z.string().url().optional(),
  error_message: z.string().optional(),
  worker_id: z.string().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate webhook secret
    const webhookSecret = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("VENUE_SCAN_WEBHOOK_SECRET");

    if (!expectedSecret || webhookSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = WebhookSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build update object
    const updateData: Record<string, unknown> = {
      status: payload.status,
      updated_at: new Date().toISOString(),
    };

    if (payload.current_stage !== undefined) updateData.current_stage = payload.current_stage;
    if (payload.progress !== undefined) updateData.progress = payload.progress;
    if (payload.preview_model_url) updateData.preview_model_url = payload.preview_model_url;
    if (payload.refined_model_url) updateData.refined_model_url = payload.refined_model_url;
    if (payload.final_model_url) updateData.final_model_url = payload.final_model_url;
    if (payload.error_message) updateData.error_message = payload.error_message;
    if (payload.worker_id) updateData.worker_id = payload.worker_id;

    // Update job
    const { data: job, error: updateError } = await supabase
      .from("venue_3d_jobs")
      .update(updateData)
      .eq("id", payload.job_id)
      .select("venue_id")
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // When complete (stage 3), upsert into venue_3d_models
    if (payload.status === "complete" && payload.final_model_url && job) {
      const { data: existing } = await supabase
        .from("venue_3d_models")
        .select("id")
        .eq("venue_id", job.venue_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("venue_3d_models")
          .update({
            model_url: payload.final_model_url,
            model_type: "glb",
            status: "ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("venue_3d_models")
          .insert({
            venue_id: job.venue_id,
            model_url: payload.final_model_url,
            model_type: "glb",
            status: "ready",
          });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
