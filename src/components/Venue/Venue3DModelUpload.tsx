import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Camera, Check, Loader2, AlertCircle, Eye, Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface Venue3DModelUploadProps {
  venueId: string;
  onModelReady?: (modelUrl: string) => void;
}

type ModelStatus = "none" | "uploading" | "ready" | "failed";

const Venue3DModelUpload = ({ venueId, onModelReady }: Venue3DModelUploadProps) => {
  const { t } = useTranslation('venue');
  const [status, setStatus] = useState<ModelStatus>("none");
  const [modelId, setModelId] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    checkExistingModel();
  }, [venueId]);

  const checkExistingModel = async () => {
    const { data } = await supabase
      .from("venue_3d_models" as any)
      .select("*")
      .eq("venue_id", venueId)
      .maybeSingle();

    if (data) {
      const model = data as any;
      setModelId(model.id);
      setModelUrl(model.model_url);
      if (model.status === "ready") {
        setStatus("ready");
        onModelReady?.(model.model_url);
      } else if (model.status === "failed") {
        setStatus("failed");
      }
    }
  };

  const handleGLBUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "glb" && ext !== "gltf") {
      toast.error("Please upload a .GLB or .GLTF file.");
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      toast.error("File must be under 200MB.");
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

      const storagePath = `${venueId}/model-${Date.now()}.${ext}`;
      setUploadProgress(30);

      const { error: uploadError } = await supabase.storage
        .from("venue-3d-models")
        .upload(storagePath, file, {
          contentType: ext === "glb" ? "model/gltf-binary" : "model/gltf+json",
          upsert: true,
        });

      if (uploadError) throw uploadError;
      setUploadProgress(70);

      const { data: publicUrlData } = supabase.storage
        .from("venue-3d-models")
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;

      // Upsert into venue_3d_models table
      if (modelId) {
        await supabase
          .from("venue_3d_models" as any)
          .update({
            model_url: publicUrl,
            model_type: "glb",
            status: "ready",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", modelId);
      } else {
        const { data: inserted } = await supabase
          .from("venue_3d_models" as any)
          .insert({
            venue_id: venueId,
            model_url: publicUrl,
            model_type: "glb",
            status: "ready",
          } as any)
          .select()
          .single();

        if (inserted) {
          setModelId((inserted as any).id);
        }
      }

      setUploadProgress(100);
      setModelUrl(publicUrl);
      setStatus("ready");
      onModelReady?.(publicUrl);
      toast.success("🎉 3D model uploaded and ready!");
    } catch (err: any) {
      setStatus("failed");
      toast.error(`Upload failed: ${err?.message || "Unknown error"}`);
    }
  };

  const handleDelete = async () => {
    if (!modelId) return;
    await supabase.from("venue_3d_models" as any).delete().eq("id", modelId);
    setStatus("none");
    setModelId(null);
    setModelUrl(null);
    toast.success("3D model removed.");
  };

  const handleRetry = () => {
    setStatus("none");
    setUploadProgress(0);
  };

  return (
    <Card className="border-cyan/20 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="w-5 h-5 text-cyan" />
          3D Venue Scan
          {status === "ready" && <Badge variant="outline" className="text-green-400 border-green-400/30 ml-auto">Ready</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "none" && (
          <>
            <p className="text-sm text-muted-foreground">
              Upload a 3D model of your venue. Use Polycam or any 3D scanning app to create a .GLB file, then upload it here.
            </p>
            <div className="space-y-3">
              <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
                <p className="font-medium text-foreground">📱 How to scan:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>1. Download <strong>Polycam</strong> (iOS/Android)</li>
                  <li>2. Use <strong>Space Mode</strong> (LiDAR) or <strong>Photo Mode</strong></li>
                  <li>3. Walk slowly through your entire venue</li>
                  <li>4. Export as <strong>.GLB</strong> file</li>
                  <li>5. Upload the file below</li>
                </ul>
              </div>
              <label className="block">
                <input
                  type="file"
                  accept=".glb,.gltf"
                  className="hidden"
                  onChange={handleGLBUpload}
                />
                <Button asChild className="pos-floorplan-scan__button">
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload 3D Model (.GLB)
                  </span>
                </Button>
              </label>
            </div>
          </>
        )}

        {status === "uploading" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-cyan" />
              <span className="text-sm">Uploading 3D model...</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        {status === "ready" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-400" />
              <span className="text-sm font-medium">3D model ready!</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Your customers will see this immersive 3D background when they check in at your venue.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.open(modelUrl || "", "_blank")}>
                <Eye className="w-4 h-4 mr-1" /> Preview
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-1" /> Remove
              </Button>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <span className="text-sm">Upload failed.</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Please try again with a valid .GLB file exported from Polycam or another 3D scanning app.
            </p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RotateCcw className="w-4 h-4 mr-1" /> Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Venue3DModelUpload;
