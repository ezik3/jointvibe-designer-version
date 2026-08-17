import { useState } from "react";
import { motion } from "framer-motion";
import { Image, Video, Upload, Check, X, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface DisplaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  currentVideoUrl?: string;
  onSave: (settings: { imageUrl?: string; videoUrl?: string; displayType: 'image' | 'video' }) => Promise<void>;
}

const DisplaySettingsModal = ({
  isOpen,
  onClose,
  currentImageUrl,
  currentVideoUrl,
  onSave,
}: DisplaySettingsModalProps) => {
  const { t } = useTranslation('venue');
  const [displayType, setDisplayType] = useState<'image' | 'video'>(currentVideoUrl ? 'video' : 'image');
  const [imageUrl, setImageUrl] = useState(currentImageUrl || '');
  const [videoUrl, setVideoUrl] = useState(currentVideoUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        imageUrl: displayType === 'image' ? imageUrl : undefined,
        videoUrl: displayType === 'video' ? videoUrl : undefined,
        displayType,
      });
      toast.success("Display settings saved!");
      onClose();
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="venue-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <Image className="w-5 h-5 text-cyan" />
            Display Settings
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Set your venue's default backdrop for the public page
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Display Type Selection */}
          <div className="space-y-3">
            <Label className="text-slate-300">Display Type</Label>
            <RadioGroup 
              value={displayType} 
              onValueChange={(v) => setDisplayType(v as 'image' | 'video')}
              className="grid grid-cols-2 gap-3"
            >
              <Card 
                className={`border cursor-pointer transition-colors ${
                  displayType === 'image' 
                    ? 'bg-cyan/10 border-cyan/50' 
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
                onClick={() => setDisplayType('image')}
              >
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <RadioGroupItem value="image" id="image" className="sr-only" />
                  <Image className={`w-8 h-8 ${displayType === 'image' ? 'text-cyan' : 'text-slate-400'}`} />
                  <span className={displayType === 'image' ? 'text-white' : 'text-slate-400'}>Image</span>
                </CardContent>
              </Card>
              
              <Card 
                className={`border cursor-pointer transition-colors ${
                  displayType === 'video' 
                    ? 'bg-cyan/10 border-cyan/50' 
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
                onClick={() => setDisplayType('video')}
              >
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <RadioGroupItem value="video" id="video" className="sr-only" />
                  <Video className={`w-8 h-8 ${displayType === 'video' ? 'text-cyan' : 'text-slate-400'}`} />
                  <span className={displayType === 'video' ? 'text-white' : 'text-slate-400'}>Video</span>
                </CardContent>
              </Card>
            </RadioGroup>
          </div>

          {/* URL Input */}
          {displayType === 'image' ? (
            <div className="space-y-2">
              <Label className="text-slate-300">Image URL</Label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white pl-10"
                />
              </div>
              <p className="text-xs text-slate-500">Enter a direct link to your backdrop image</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-slate-300">Video URL</Label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="https://example.com/video.mp4"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white pl-10"
                />
              </div>
              <p className="text-xs text-slate-500">Enter a direct link to your backdrop video (will loop)</p>
            </div>
          )}

          {/* Preview */}
          {(displayType === 'image' && imageUrl) || (displayType === 'video' && videoUrl) ? (
            <div className="space-y-2">
              <Label className="text-slate-300">Preview</Label>
              <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-800 border border-slate-700">
                {displayType === 'image' && imageUrl && (
                  <img 
                    src={imageUrl} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                    onError={() => toast.error("Failed to load image")}
                  />
                )}
                {displayType === 'video' && videoUrl && (
                  <video 
                    src={videoUrl} 
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    onError={() => toast.error("Failed to load video")}
                  />
                )}
              </div>
            </div>
          ) : null}

          {/* Info about takeover */}
          <Card className="bg-cyan-500/10 border-cyan-500/30">
            <CardContent className="p-3 text-sm text-cyan-100">
              <strong>Note:</strong> When a performer with "Display Takeover" permission goes live, 
              their stream will temporarily replace this backdrop. It will revert when they stop.
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="venue-dialog-secondary-action flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="venue-dialog-primary-action flex-1"
          >
            {isSaving ? (
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-white border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DisplaySettingsModal;
