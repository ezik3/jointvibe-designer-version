import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Upload, Video, Check, Loader2, AlertCircle, Eye, Trash2, RotateCcw,
  ChevronDown, Sparkles, Layers, Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { toast } from "sonner";
import Venue3DModelUpload from "./Venue3DModelUpload";
import { useTranslation } from 'react-i18next';

interface VenueScanUploadProps {
  venueId: string;
  onModelReady?: (modelUrl: string) => void;
}

type JobStatus =
  | "none"
  | "uploading"
  | "queued"
  | "extracting_frames"
  | "reconstructing"
  | "refining"
  | "optimizing"
  | "complete"
  | "failed";

interface Job {
  id: string;
  status: JobStatus;
  current_stage: number;
  progress: number;
  video_url: string | null;
  preview_model_url: string | null;
  refined_model_url: string | null;
  final_model_url: string | null;
  error_message: string | null;
  queue_position: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  uploading: { label: "Uploading video...", icon: <Upload className="w-4 h-4 animate-pulse" />, color: "text-cyan" },
  queued: { label: "Queued for processing...", icon: <Loader2 className="w-4 h-4 animate-spin" />, color: "text-muted-foreground" },
  extracting_frames: { label: "Extracting frames...", icon: <Layers className="w-4 h-4 animate-pulse" />, color: "text-cyan" },
  reconstructing: { label: "Building 3D preview...", icon: <Sparkles className="w-4 h-4 animate-pulse" />, color: "text-cyan" },
  refining: { label: "Enhancing quality...", icon: <Zap className="w-4 h-4 animate-pulse" />, color: "text-amber-400" },
  optimizing: { label: "Final optimization...", icon: <Sparkles className="w-4 h-4 animate-spin" />, color: "text-green-400" },
  complete: { label: "3D model ready!", icon: <Check className="w-4 h-4" />, color: "text-green-400" },
  failed: { label: "Processing failed", icon: <AlertCircle className="w-4 h-4" />, color: "text-destructive" },
};

const VenueScanUpload = ({ venueId, onModelReady }: VenueScanUploadProps) => {
  const { t } = useTranslation('venue');
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState<JobStatus>("none");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Check for existing job on mount
  useEffect(() => {
    checkExistingJob();
  }, [venueId]);

  // Subscribe to realtime updates on the job
  useEffect(() => {
    if (!job?.id) return;

    const channel = supabase
      .channel(createRealtimeChannelTopic(`venue-3d-job-${job.id}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "venue_3d_jobs",
          filter: `id=eq.${job.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setJob({
            id: updated.id,
            status: updated.status,
            current_stage: updated.current_stage,
            progress: updated.progress,
            video_url: updated.video_url,
            preview_model_url: updated.preview_model_url,
            refined_model_url: updated.refined_model_url,
            final_model_url: updated.final_model_url,
            error_message: updated.error_message,
            queue_position: updated.queue_position,
          });
          setStatus(updated.status);

          // Auto-notify on model ready
          const modelUrl = updated.final_model_url || updated.refined_model_url || updated.preview_model_url;
          if (updated.status === "complete" && modelUrl) {
            onModelReady?.(modelUrl);
            toast.success("🎉 Your 3D venue model is ready!");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [job?.id, onModelReady]);

  const checkExistingJob = async () => {
    const { data } = await supabase
      .from("venue_3d_jobs" as any)
      .select("*")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const j = data as any;
      setJob({
        id: j.id,
        status: j.status,
        current_stage: j.current_stage,
        progress: j.progress,
        video_url: j.video_url,
        preview_model_url: j.preview_model_url,
        refined_model_url: j.refined_model_url,
        final_model_url: j.final_model_url,
        error_message: j.error_message,
        queue_position: j.queue_position,
      });
      setStatus(j.status);

      if (j.status === "complete") {
        const modelUrl = j.final_model_url || j.refined_model_url || j.preview_model_url;
        if (modelUrl) onModelReady?.(modelUrl);
      }
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Please upload a video file.");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      toast.error("Video must be under 500MB.");
      return;
    }

    setStatus("uploading");
    setUploadProgress(10);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in first.");
        setStatus("none");
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const storagePath = `${venueId}/scan-${Date.now()}.${ext}`;
      setUploadProgress(20);

      const { error: uploadError } = await supabase.storage
        .from("venue-scan-videos")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) throw uploadError;
      setUploadProgress(60);

      const { data: publicUrlData } = supabase.storage
        .from("venue-scan-videos")
        .getPublicUrl(storagePath);

      const videoUrl = publicUrlData.publicUrl;
      setUploadProgress(80);

      // Call trigger edge function
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "trigger-venue-scan",
        {
          body: { venue_id: venueId, video_url: videoUrl },
        }
      );

      if (fnError) throw fnError;

      setUploadProgress(100);

      // Fetch the created job
      if (result?.job_id) {
        const { data: newJob } = await supabase
          .from("venue_3d_jobs" as any)
          .select("*")
          .eq("id", result.job_id)
          .single();

        if (newJob) {
          const j = newJob as any;
          setJob({
            id: j.id,
            status: j.status,
            current_stage: j.current_stage,
            progress: j.progress,
            video_url: j.video_url,
            preview_model_url: j.preview_model_url,
            refined_model_url: j.refined_model_url,
            final_model_url: j.final_model_url,
            error_message: j.error_message,
            queue_position: j.queue_position,
          });
          setStatus(j.status);
        }
      }

      toast.success("Video uploaded! Your 3D model is being generated.");
    } catch (err: any) {
      setStatus("failed");
      toast.error(`Upload failed: ${err?.message || "Unknown error"}`);
    }
  };

  const handleDelete = async () => {
    if (!job) return;
    await supabase.from("venue_3d_jobs" as any).delete().eq("id", job.id);
    setJob(null);
    setStatus("none");
    setUploadProgress(0);
    toast.success("Scan job removed.");
  };

  const handleRetry = () => {
    setJob(null);
    setStatus("none");
    setUploadProgress(0);
  };

  const currentModel = job?.final_model_url || job?.refined_model_url || job?.preview_model_url;
  const isProcessing = ["queued", "extracting_frames", "reconstructing", "refining", "optimizing"].includes(status);
  const cfg = STATUS_CONFIG[status];

  const getStageLabel = () => {
    if (!job) return "";
    if (job.current_stage === 1) return "Preview";
    if (job.current_stage === 2) return "Enhanced";
    if (job.current_stage === 3) return "Final";
    return "";
  };

  return (
    <div className="venue-scan-upload space-y-4">
      <Card className="venue-scan-upload__card border-cyan/20 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="w-5 h-5 text-cyan" />
            3D Venue Scan
            {status === "complete" && (
              <Badge variant="outline" className="text-green-400 border-green-400/30 ml-auto">
                Ready
              </Badge>
            )}
            {isProcessing && (
              <Badge variant="outline" className="text-cyan border-cyan/30 ml-auto">
                Processing
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* NONE — Upload CTA */}
          {status === "none" && (
            <>
              <p className="text-sm text-muted-foreground">
                Record a walkthrough video of your venue and we'll automatically generate an immersive 3D model for your customers.
              </p>
              <div className="space-y-3">
                <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
                  <p className="font-medium text-foreground">📹 How it works:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>1. Record a video walking through your venue</li>
                    <li>2. Upload it here — we handle the rest</li>
                    <li>3. Your 3D model generates automatically</li>
                    <li>4. Customers see it when they check in</li>
                  </ul>
                </div>
                <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground">
                  <strong>💡 Tips:</strong> Walk slowly, keep the camera steady, cover all areas. Works in any lighting.
                </div>
                <label className="block">
                  <input
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleVideoUpload}
                  />
                  <Button asChild className="pos-floorplan-scan__button">
                    <span>
                      <Video className="w-4 h-4 mr-2" />
                      Scan Your Venue
                    </span>
                  </Button>
                </label>
              </div>
            </>
          )}

          {/* UPLOADING */}
          {status === "uploading" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5 animate-pulse text-cyan" />
                <span className="text-sm">Uploading video...</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                This may take a moment depending on your video size.
              </p>
            </div>
          )}

          {/* PROCESSING STATES */}
          {isProcessing && cfg && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className="text-sm font-medium">{cfg.label}</span>
              </div>

              {job?.progress !== undefined && job.progress > 0 && (
                <Progress value={job.progress} className="h-2" />
              )}

              {status === "queued" && job?.queue_position && (
                <p className="text-xs text-muted-foreground">
                  Queue position: #{job.queue_position}
                </p>
              )}

              {/* Show progressive model stages */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${job?.preview_model_url ? "bg-green-400" : "bg-muted"}`} />
                  <span className={`text-xs ${job?.preview_model_url ? "text-green-400" : "text-muted-foreground"}`}>
                    Stage 1: Quick Preview
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${job?.refined_model_url ? "bg-green-400" : "bg-muted"}`} />
                  <span className={`text-xs ${job?.refined_model_url ? "text-green-400" : "text-muted-foreground"}`}>
                    Stage 2: Enhanced Quality
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${job?.final_model_url ? "bg-green-400" : "bg-muted"}`} />
                  <span className={`text-xs ${job?.final_model_url ? "text-green-400" : "text-muted-foreground"}`}>
                    Stage 3: Final Optimized
                  </span>
                </div>
              </div>

              {currentModel && (
                <div className="bg-muted/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    {getStageLabel()} model available — auto-updating as quality improves.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => window.open(currentModel, "_blank")}>
                    <Eye className="w-4 h-4 mr-1" /> Preview Current
                  </Button>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Processing happens on our GPU servers. You can leave this page — we'll notify you when it's ready.
              </p>
            </div>
          )}

          {/* COMPLETE */}
          {status === "complete" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-sm font-medium">3D model ready!</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your customers will see this immersive 3D background when they check in at your venue.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(currentModel || "", "_blank")}>
                  <Eye className="w-4 h-4 mr-1" /> Preview
                </Button>
                <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-1" /> Remove
                </Button>
              </div>
            </div>
          )}

          {/* FAILED */}
          {status === "failed" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="text-sm">Processing failed.</span>
              </div>
              {job?.error_message && (
                <p className="text-xs text-destructive/80">{job.error_message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Try recording a new video with better coverage of your venue.
              </p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RotateCcw className="w-4 h-4 mr-1" /> Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced: Manual GLB Upload */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
            <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            Advanced: Upload .GLB manually
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Venue3DModelUpload venueId={venueId} onModelReady={onModelReady} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default VenueScanUpload;
