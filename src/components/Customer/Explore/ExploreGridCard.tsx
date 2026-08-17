import { Play } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';

interface ExploreGridCardProps {
  post: {
    id: string;
    image_url?: string;
    video_url?: string;
    content: string;
    pounds_count: number;
    user_id: string;
    author_name?: string;
    author_avatar?: string;
    customer_profiles?: {
      display_name?: string;
      avatar_url?: string;
    } | null;
  };
  rank?: number;
  onClick: () => void;
}

const ExploreGridCard = ({ post, rank, onClick }: ExploreGridCardProps) => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const mediaUrl = post.video_url || post.image_url;
  const authorName = post.customer_profiles?.display_name || post.author_name || "Anonymous";
  const authorAvatar = post.customer_profiles?.avatar_url || post.author_avatar;

  const rankBadgeClass = rank === 1
    ? "bg-gradient-to-br from-amber-400 to-amber-600 text-black font-black"
    : rank === 2
    ? "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-900 font-black"
    : rank === 3
    ? "bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 font-black"
    : "bg-black/70 text-white font-bold";

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="relative w-full rounded-xl overflow-hidden bg-black cursor-pointer group hover:scale-[1.03] hover:shadow-xl transition-all duration-200"
      style={{ aspectRatio: "9/16" }}
    >
      {/* Media thumbnail — object-cover to fill card */}
      {mediaUrl && (
        post.video_url ? (
          <video
            src={post.video_url}
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <img
            src={post.image_url}
            alt={post.content?.slice(0, 40) || "Post"}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )
      )}

      {/* Play icon for videos */}
      {post.video_url && (
        <div className="absolute top-2 right-2 z-10">
          <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}

      {/* Rank badge overlay */}
      {rank != null && (
        <div className={`absolute top-2 left-2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm ${rankBadgeClass}`}>
          #{rank}
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10" />

      {/* Author + engagement info */}
      <div className="absolute bottom-2 left-2 right-2 z-20">
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            if (post.user_id) navigate(`/app/user/${post.user_id}`);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              if (post.user_id) navigate(`/app/user/${post.user_id}`);
            }
          }}
          className="flex items-center gap-1.5 mb-1 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <Avatar className="w-5 h-5">
            <AvatarImage src={authorAvatar} />
            <AvatarFallback className="bg-white/20 text-white text-[8px]">
              {authorName[0]}
            </AvatarFallback>
          </Avatar>
          <span className="text-white text-xs font-medium truncate hover:underline">{authorName}</span>
        </div>
        {post.content && (
          <p className="text-white/70 text-[10px] line-clamp-1">{post.content}</p>
        )}
      </div>

      {/* No media fallback */}
      {!mediaUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 p-3">
          <p className="text-white/60 text-xs text-center line-clamp-4">{post.content}</p>
        </div>
      )}
    </div>
  );
};

export default ExploreGridCard;
