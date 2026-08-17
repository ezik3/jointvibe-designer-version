import { Users, Play } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import DealCard from "@/components/Customer/Deals/DealCard";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import MediaFrame from "@/components/Customer/Feed/MediaFrame";
import ClampedCaption from "@/components/Customer/Feed/ClampedCaption";
import { useTranslation } from 'react-i18next';

interface Post {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count?: number;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
  author_tier?: string;
}

interface FollowingFeedProps {
  posts: Post[];
  loading?: boolean;
}

const FollowingFeed = ({ posts, loading }: FollowingFeedProps) => {
  const { t } = useTranslation('feed');
  const { deals, recordImpression, redeemDeal } = useActiveDeals('following', 2);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <Skeleton className="h-5 w-24" />
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
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-white">{t("common:navigation.following")}</h3>
        </div>
        <div className="p-12 text-center bg-white/5 rounded-xl border border-white/10">
          <Users className="w-10 h-10 text-white/30 mx-auto mb-3" />
          <p className="text-white/50 text-sm">{t("empty.follow_to_see_posts")}</p>
          <p className="text-white/30 text-xs mt-1">{t("empty.discover_creators")}</p>
        </div>
      </div>
    );
  }

  // Interleave deals: max 1 deal per 8 content items
  const interleaved: (Post | { _isDeal: true; deal: typeof deals[0] })[] = [];
  let dealIndex = 0;
  posts.forEach((post, i) => {
    interleaved.push(post);
    if ((i + 1) % 8 === 0 && dealIndex < deals.length) {
      interleaved.push({ _isDeal: true, deal: deals[dealIndex] });
      dealIndex++;
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-white">{t("common:navigation.following")}</h3>
        <span className="text-white/40 text-sm">• {t("following.chronological")}</span>
      </div>
      
      <div className="space-y-4">
        {interleaved.map((item, idx) => {
          if ('_isDeal' in item) {
            return (
              <DealCard
                key={`deal-${item.deal.id}`}
                deal={item.deal}
                variant="full"
                onImpression={() => recordImpression(item.deal.id, item.deal.venue_id)}
                onRedeem={() => redeemDeal(item.deal.id, item.deal.venue_id)}
              />
            );
          }

          const post = item;
          return (
            <div
              key={post.id}
              className="relative bg-white/5 rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
            >
              {/* Header */}
              <div className="p-3 flex items-center gap-2">
                <Avatar className="w-8 h-8 ring-2 ring-primary/30">
                  <AvatarImage src={post.author_avatar} />
                  <AvatarFallback className="bg-gradient-to-br from-purple to-pink text-white text-xs">
                    {post.author_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-semibold text-sm">{post.author_name}</span>
                    {post.author_tier && post.author_tier !== "member" && (
                      <TierBadge tier={post.author_tier as TierName} size="sm" showLabel={false} />
                    )}
                  </div>
                  <p className="text-white/40 text-xs">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              
              {/* Media */}
              {(post.image_url || post.video_url) && (
                <MediaFrame
                  imageUrl={post.image_url}
                  videoUrl={post.video_url}
                  aspectRatio="9/16"
                  showPlayButton={!!post.video_url}
                  autoPlay={false}
                />
              )}
              
              {/* Content */}
              <div className="p-3">
                <ClampedCaption text={post.content} />
                
                {/* Engagement */}
                <div className="flex items-center gap-4 mt-2 text-white/50 text-xs">
                  <span>👊 {post.pounds_count}</span>
                  {post.comments_count !== undefined && (
                    <span>💬 {post.comments_count}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FollowingFeed;
