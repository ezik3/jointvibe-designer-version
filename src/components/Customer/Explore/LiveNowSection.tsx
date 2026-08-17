import { Radio, Eye, Play } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from 'react-i18next';

interface LiveStream {
  id: string;
  content: string;
  video_url?: string;
  author_name?: string;
  author_avatar?: string;
  venue_name?: string;
  viewer_count: number;
}

interface LiveNowSectionProps {
  streams: LiveStream[];
  loading?: boolean;
  fullView?: boolean;
}

const LiveNowSection = ({ streams, loading, fullView = false }: LiveNowSectionProps) => {
  const { t } = useTranslation('feed');
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-red-500" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className={fullView ? "grid grid-cols-2 gap-3" : "flex gap-3 overflow-x-auto scrollbar-hide pb-2"}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className={`${fullView ? "" : "flex-shrink-0"} w-full h-36 rounded-xl`} />
          ))}
        </div>
      </div>
    );
  }

  if (streams.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-red-500" />
          <h3 className="font-semibold text-white">{t("discover.live_right_now")}</h3>
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        </div>
        <div className="p-8 text-center bg-white/5 rounded-xl border border-white/10">
          <Radio className="w-8 h-8 text-white/30 mx-auto mb-2" />
          <p className="text-white/50 text-sm">{t("discover.no_live_streams")}</p>
          <p className="text-white/30 text-xs mt-1">{t("discover.be_first_live")}</p>
        </div>
      </div>
    );
  }

  const displayStreams = fullView ? streams : streams.slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-red-500" />
        <h3 className="font-semibold text-white">{t("discover.live_right_now")}</h3>
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      </div>
      
      <div className={fullView ? "grid grid-cols-2 gap-3" : "flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4"}>
        {displayStreams.map((stream) => (
          <div
            key={stream.id}
            className={`relative ${fullView ? "" : "w-40 flex-shrink-0"} h-48 rounded-xl overflow-hidden bg-gradient-to-br from-red-500/20 to-purple-500/20 group cursor-pointer`}
          >
            {stream.video_url ? (
              <video
                src={stream.video_url}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-red-500/30 via-purple-500/30 to-pink-500/30" />
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            
            {/* Live badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-500 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-white text-[10px] font-bold">{t("golive.live")}</span>
            </div>
            
            {/* Viewer count */}
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full">
              <Eye className="w-3 h-3 text-white" />
              <span className="text-white text-[10px]">{stream.viewer_count}</span>
            </div>
            
            {/* Play overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-14 h-14 rounded-full bg-red-500/80 backdrop-blur flex items-center justify-center">
                <Play className="w-6 h-6 text-white fill-white ml-1" />
              </div>
            </div>
            
            {/* Content */}
            <div className="absolute bottom-2 left-2 right-2">
              <div className="flex items-center gap-2 mb-1">
                <Avatar className="w-6 h-6 ring-2 ring-red-500">
                  <AvatarImage src={stream.author_avatar} />
                  <AvatarFallback className="bg-red-500 text-white text-xs">
                    {stream.author_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white text-xs font-semibold truncate">
                  {stream.author_name}
                </span>
              </div>
              <p className="text-white/80 text-[10px] line-clamp-2">{stream.content}</p>
              {stream.venue_name && (
                <p className="text-cyan text-[9px] mt-0.5">📍 {stream.venue_name}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveNowSection;
