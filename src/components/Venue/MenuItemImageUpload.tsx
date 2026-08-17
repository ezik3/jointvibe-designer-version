import { type ChangeEvent, useRef, useState } from "react";
import { ImageUp, Loader2, Sparkles, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MenuItemImageUploadProps {
  venueId: string;
  itemName: string;
  category: string;
  description?: string;
  onImageUploaded: (imageUrl: string) => void;
}

export default function MenuItemImageUpload({
  venueId,
  itemName,
  category,
  description,
  onImageUploaded,
}: MenuItemImageUploadProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      input.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      input.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const fileName = `${venueId}/menu-items/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`;
      const { error } = await supabase.storage
        .from("venue-assets")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: true,
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("venue-assets")
        .getPublicUrl(fileName);

      onImageUploaded(publicUrlData.publicUrl);
      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      input.value = "";
    }
  };

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-menu-image", {
        body: { itemName, category, description },
      });

      if (error) throw error;

      if (data?.imageUrl) {
        onImageUploaded(data.imageUrl);
        toast.success("AI image generated successfully");
      } else {
        throw new Error("No image returned");
      }
    } catch (error) {
      console.error("AI generation error:", error);
      const message = error instanceof Error ? error.message : "";

      if (message.includes("429")) {
        toast.error("Rate limit exceeded. Please try again later.");
      } else if (message.includes("402")) {
        toast.error("AI credits exhausted. Please add more credits.");
      } else {
        toast.error("Failed to generate image");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const isLoading = isGenerating || isUploading;

  return (
    <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
      <PopoverTrigger asChild>
        <button
          type="button"
          className="venue-menu-image-change"
          aria-label={`Change image for ${itemName}`}
          disabled={isLoading}
          onClick={(event) => event.stopPropagation()}
        >
          {isLoading ? <Loader2 className="venue-menu-spin" aria-hidden="true" /> : <ImageUp aria-hidden="true" />}
          <span>{isLoading ? (isGenerating ? "Generating..." : "Uploading...") : "Change image"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="venue-menu-image-change__menu w-auto p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="venue-menu-image-change__action"
          onClick={() => {
            setIsMenuOpen(false);
            fileInputRef.current?.click();
          }}
        >
          <Upload aria-hidden="true" />
          <span>Upload image</span>
        </button>
        <button
          type="button"
          className="venue-menu-image-change__action"
          onClick={() => {
            setIsMenuOpen(false);
            void handleAIGenerate();
          }}
        >
          <Sparkles aria-hidden="true" />
          <span>Generate with AI</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
