import { TrendingUp, Play } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from 'react-i18next';

interface TrendingPost {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  author_name?: string;
  author_avatar?: string;
}

interface TrendingSectionProps {
  posts: TrendingPost[];
  city: string;
  loading?: boolean;
}

const TrendingSection = ({ posts, city, loading }: TrendingSectionProps) => {
  const { t } = useTranslation('feed');
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-orange-500" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-32 h-40 rounded-xl flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-white">{t("discover.trending_in_city", { city })}</h3>
        </div>
        <div className="p-6 text-center bg-white/5 rounded-xl border border-white/10">
          <p className="text-white/50 text-sm">{t("discover.no_trending_posts")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold text-white">{t("discover.trending_in_city", { city })}</h3>
      </div>
      
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
        {posts.slice(0, 6).map((post) => (
          <div
            key={post.id}
            className="relative w-32 h-48 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple/30 to-pink/30 group cursor-pointer"
          >
            {post.image_url || post.video_url ? (
              <img
                src={post.image_url || post.video_url}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple via-pink to-cyan opacity-50" />
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            
            {/* Video indicator */}
            {post.video_url && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="w-3 h-3 text-white fill-white" />
              </div>
            )}
            
            {/* Content */}
            <div className="absolute bottom-2 left-2 right-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Avatar className="w-5 h-5 ring-1 ring-white/30">
                  <AvatarImage src={post.author_avatar} />
                  <AvatarFallback className="bg-purple text-white text-[8px]">
                    {post.author_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white text-[10px] font-medium truncate">
                  {post.author_name}
                </span>
              </div>
              <p className="text-white/80 text-[10px] line-clamp-2">{post.content}</p>
              <div className="flex items-center gap-1 mt-1 text-white/60 text-[9px]">
                <span>👊 {post.pounds_count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrendingSection;
