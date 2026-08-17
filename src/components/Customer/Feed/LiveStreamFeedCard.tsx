import { useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Eye } from "lucide-react";

import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import { useTranslation } from 'react-i18next';

interface LiveStreamFeedCardProps {
  streamId: string;
  hostName: string;
  hostAvatar?: string;
  hostTier?: string;
  title: string;
  viewerCount: number;
  isCloseFriend?: boolean;
}

const LiveStreamFeedCard = ({
  streamId,
  hostName,
  hostAvatar,
  hostTier,
  title,
  viewerCount,
  isCloseFriend,
}: LiveStreamFeedCardProps) => {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/app/live/watch/${streamId}`)}
      className={`relative w-full h-full cursor-pointer overflow-hidden ${
        isCloseFriend
          ? "ring-2 ring-teal-400/60 shadow-[0_0_15px_rgba(45,212,191,0.3)]"
          : ""
      }`}
    >
      {/* Vibrant gradient background — NOT pure black */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-red-900/80 to-black" />

      {/* Animated equalizer bars */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-end gap-1.5 h-32">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className="w-2.5 rounded-t animate-pulse"
              style={{
                height: `${20 + Math.random() * 60}%`,
                animationDelay: `${i * 0.12}s`,
                animationDuration: `${0.6 + Math.random() * 0.5}s`,
                background: `linear-gradient(to top, rgba(239,68,68,0.9), rgba(168,85,247,0.6))`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Large pulsing LIVE glow in center */}
      <div className="absolute inset-0 flex items-center justify-center z-[1]">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/40 rounded-full blur-xl animate-pulse scale-150" />
            <div className="relative bg-red-500 px-6 py-2 rounded-full flex items-center gap-2">
              <span className="w-3 h-3 bg-white rounded-full animate-pulse" />
              <span className="text-white text-lg font-black tracking-wider">{t("golive.live")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top-right viewer count */}
      <div className="absolute top-4 right-4 z-10">
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full">
          <Eye className="w-3.5 h-3.5 text-white" />
          <span className="text-white text-xs font-medium">{viewerCount}</span>
        </div>
      </div>

      {/* Host info — bottom */}
      <div className="absolute bottom-8 left-4 right-4 z-10 flex items-center gap-3">
        <Avatar className="w-11 h-11 border-2 border-red-500 shadow-lg shadow-red-500/30">
          <AvatarImage src={hostAvatar} />
          <AvatarFallback className="bg-gradient-to-br from-red-500 to-purple-600 text-white font-bold text-sm">
            {hostName?.[0] ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-white font-semibold text-sm truncate">{hostName}</p>
            {hostTier && hostTier !== "member" && (
              <TierBadge tier={hostTier as TierName} size="sm" showLabel={false} />
            )}
          </div>
          {title && (
            <p className="text-white/60 text-xs truncate">{title}</p>
          )}
        </div>
      </div>

      {/* Tap to watch — more prominent */}
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <span className="text-white/50 text-xs font-medium">{t("golive.tap_to_watch")}</span>
      </div>
    </div>
  );
};

export default LiveStreamFeedCard;
