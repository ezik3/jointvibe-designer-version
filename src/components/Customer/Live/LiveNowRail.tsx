import { useNavigate } from "react-router-dom";
import { Radio, Eye } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { LiveStream } from "@/hooks/useLiveStreams";
import { useTranslation } from 'react-i18next';

interface LiveNowRailProps {
  streams: LiveStream[];
}

const LiveNowRail = ({ streams }: LiveNowRailProps) => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();

  if (streams.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-4">
        <Radio className="w-4 h-4 text-red-500" />
        <span className="text-white text-sm font-semibold">{t('live.live_now')}</span>
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2">
        {streams.map((stream) => (
          <button
            key={stream.id}
            onClick={() => navigate(`/app/live/watch/${stream.id}`)}
            className="flex-shrink-0 w-20 flex flex-col items-center gap-1"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-red-500 via-pink-500 to-red-600">
                <Avatar className="w-full h-full border-2 border-black">
                  <AvatarImage src={stream.host_profile?.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-red-500 to-pink-500 text-white text-sm">
                    {(stream.host_profile?.display_name || "L")[0]}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-red-500 px-1.5 py-0.5 rounded-full">
                <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                <span className="text-white text-[8px] font-bold">{t('live.live_label')}</span>
              </div>
            </div>
            <span className="text-white/80 text-[10px] truncate w-full text-center">
              {stream.host_profile?.display_name?.split(" ")[0] || t('live.live_fallback_name')}
            </span>
            <div className="flex items-center gap-0.5">
              <Eye className="w-2.5 h-2.5 text-white/50" />
              <span className="text-white/50 text-[9px]">{stream.viewer_count}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LiveNowRail;
