import { MapPin, Play } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import DealCard from "@/components/Customer/Deals/DealCard";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import MediaFrame from "@/components/Customer/Feed/MediaFrame";
import { useTranslation } from 'react-i18next';

interface Post {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count?: number;
  author_name?: string;
  author_avatar?: string;
  author_tier?: string;
  venue_name?: string;
}

interface CityFeedProps {
  city: string;
  posts: Post[];
  loading?: boolean;
}

const CityFeed = ({ city, posts, loading }: CityFeedProps) => {
  const { t } = useTranslation('feed');
  const { deals, recordImpression, redeemDeal } = useActiveDeals('explore', 2);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-cyan" />
          <Skeleton className="h-5 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="w-full h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-cyan" />
          <h3 className="font-semibold text-white">{t("discover.whats_happening_in", { city })}</h3>
        </div>
        <div className="p-12 text-center bg-white/5 rounded-xl border border-white/10">
          <MapPin className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-white/50 text-sm">{t("discover.no_city_posts", { city })}</p>
          <p className="text-white/30 text-xs mt-1">{t("discover.be_first_post")}</p>
        </div>
      </div>
    );
  }

  // Interleave deals: max 1 deal per 8 content items
  const interleavedPosts: (Post | { _isDeal: true; deal: typeof deals[0] })[] = [];
  let dealIdx = 0;
  posts.forEach((post, i) => {
    interleavedPosts.push(post);
    if ((i + 1) % 8 === 0 && dealIdx < deals.length) {
      interleavedPosts.push({ _isDeal: true, deal: deals[dealIdx] });
      dealIdx++;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-cyan" />
        <h3 className="font-semibold text-white">{t("discover.whats_happening_in", { city })}</h3>
      </div>
      
      {/* City stats banner */}
      <div className="flex gap-4 p-4 bg-gradient-to-r from-cyan/10 to-primary/10 rounded-xl border border-cyan/20">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{posts.length}</p>
          <p className="text-xs text-white/50">{t("discover.posts_today")}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-cyan">{Math.floor(posts.length * 3.7)}</p>
          <p className="text-xs text-white/50">{t("discover.people_active")}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{Math.floor(posts.length * 0.8)}</p>
          <p className="text-xs text-white/50">{t("discover.venues_buzzing")}</p>
        </div>
      </div>
      
      {/* Posts grid with interleaved deals */}
      <div className="grid grid-cols-2 gap-3">
        {interleavedPosts.map((item, idx) => {
          if ('_isDeal' in item) {
            return (
              <div key={`deal-${item.deal.id}`} className="col-span-2">
                <DealCard
                  deal={item.deal}
                  variant="compact"
                  onImpression={() => recordImpression(item.deal.id, item.deal.venue_id)}
                  onRedeem={() => redeemDeal(item.deal.id, item.deal.venue_id)}
                />
              </div>
            );
          }

          const post = item;
          return (
            <div
              key={post.id}
              className="relative bg-white/5 rounded-xl overflow-hidden border border-white/10 hover:border-cyan/30 transition-colors cursor-pointer group"
            >
              {/* Media */}
              <div className="relative aspect-[4/5]">
                {post.video_url ? (
                  <MediaFrame
                    videoUrl={post.video_url}
                    aspectRatio="4/5"
                    showPlayButton
                    autoPlay={false}
                  />
                ) : post.image_url ? (
                  <MediaFrame
                    imageUrl={post.image_url}
                    aspectRatio="4/5"
                    autoPlay={false}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-cyan/30 via-purple/30 to-pink/30 flex items-center justify-center">
                    <p className="text-white/60 text-xs text-center px-2 line-clamp-4">{post.content}</p>
                  </div>
                )}
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              {/* Info overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                <div className="flex items-center gap-1.5">
                  <Avatar className="w-5 h-5 ring-1 ring-white/30">
                    <AvatarImage src={post.author_avatar} />
                    <AvatarFallback className="bg-purple text-white text-[8px]">
                      {post.author_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-white text-[10px] font-medium truncate">{post.author_name}</span>
                  {post.author_tier && post.author_tier !== "member" && (
                    <TierBadge tier={post.author_tier as TierName} size="sm" showLabel={false} />
                  )}
                </div>
                {post.venue_name && (
                  <p className="text-cyan text-[9px] mt-0.5 truncate">📍 {post.venue_name}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-white/60 text-[9px]">
                  <span>👊 {post.pounds_count}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CityFeed;
