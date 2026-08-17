import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Maximize2, Minimize2, Radio, Users, Heart, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from 'react-i18next';

interface GoLiveVideoPopupProps {
  isLive: boolean;
  onClose: () => void;
  streamerName: string;
  streamerAvatar?: string;
  viewerCount: number;
}

export default function GoLiveVideoPopup({ 
  isLive, 
  onClose, 
  streamerName, 
  streamerAvatar,
  viewerCount 
}: GoLiveVideoPopupProps) {
  const { t } = useTranslation('venue');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!isLive) return null;

  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <div 
          className="w-40 h-24 rounded-lg overflow-hidden shadow-2xl cursor-pointer group"
          onClick={() => setIsMinimized(false)}
        >
          {/* Mini Video */}
          <div className="relative w-full h-full bg-gradient-to-br from-red-900 to-purple-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center text-white font-bold">
                {streamerName[0]}
              </div>
            </div>
            
            {/* Live indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded text-[10px] font-bold text-white">
              <Radio className="w-2 h-2 animate-pulse" />
              LIVE
            </div>

            {/* Expand overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="w-6 h-6 text-white" />
            </div>

            {/* Close button */}
            <button 
              className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (isFullscreen) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black"
      >
        {/* Fullscreen Video */}
        <div className="relative w-full h-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          {/* Placeholder for actual video stream */}
          <div className="w-48 h-48 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center animate-pulse">
            <Radio className="w-20 h-20 text-white" />
          </div>

          {/* Controls Overlay */}
          <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12 ring-2 ring-red-500">
                <AvatarImage src={streamerAvatar} />
                <AvatarFallback>{streamerName[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-white">{streamerName}</p>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <div className="flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded text-xs font-bold text-white">
                    <Radio className="w-3 h-3 animate-pulse" />
                    LIVE
                  </div>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {viewerCount.toLocaleString()} watching
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-white" onClick={() => setIsFullscreen(false)}>
                <Minimize2 className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
            <Button variant="ghost" className="text-white flex flex-col items-center gap-1">
              <Heart className="w-6 h-6" />
              <span className="text-xs">12K</span>
            </Button>
            <Button variant="ghost" className="text-white flex flex-col items-center gap-1">
              <MessageCircle className="w-6 h-6" />
              <span className="text-xs">Chat</span>
            </Button>
            <Button variant="ghost" className="text-white flex flex-col items-center gap-1">
              <Share2 className="w-6 h-6" />
              <span className="text-xs">{t("common:actions.share")}</span>
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Default: Picture-in-Picture view
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 100 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 100 }}
      className="fixed bottom-6 right-6 z-50"
    >
      <div className="w-80 rounded-xl overflow-hidden shadow-2xl border border-border bg-background">
        {/* Video Area */}
        <div className="relative aspect-video bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          {/* Placeholder for actual video stream */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center animate-pulse">
            <Radio className="w-10 h-10 text-white" />
          </div>

          {/* Live indicator */}
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 px-2 py-1 rounded text-xs font-bold text-white">
            <Radio className="w-3 h-3 animate-pulse" />
            LIVE
          </div>

          {/* Viewer count */}
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-xs text-white">
            <Users className="w-3 h-3" />
            {viewerCount}
          </div>

          {/* Controls */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setIsMinimized(true)}
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setIsFullscreen(true)}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Info Bar */}
        <div className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 ring-2 ring-red-500">
              <AvatarImage src={streamerAvatar} />
              <AvatarFallback>{streamerName[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{streamerName}</p>
              <p className="text-xs text-muted-foreground">Venue Owner</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
