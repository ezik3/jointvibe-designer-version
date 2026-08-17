import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { X, MapPin, MessageCircle, Share2, UserPlus, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import FollowButton from "@/components/Customer/FollowButton";
import MediaFrame from "@/components/Customer/Feed/MediaFrame";
import FistPoundIcon from "@/components/Customer/Feed/FistPoundIcon";
import CommentModal from "@/components/Customer/Feed/CommentModal";
import TaggedUsersDisplay from "@/components/Customer/Feed/TaggedUsersDisplay";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useActiveAd } from "@/hooks/useActiveAd";
import AdBanner from "@/components/Ads/AdBanner";
import { useTranslation } from 'react-i18next';

const cityBackgrounds: Record<string, string> = {
  "Brisbane": "https://images.unsplash.com/photo-1524293581917-878a6d017c71?w=1920&q=80",
  "Sydney": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=1920&q=80",
  "Melbourne": "https://images.unsplash.com/photo-1514395462725-fb4566210144?w=1920&q=80",
  "New York": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1920&q=80",
  "London": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1920&q=80",
};

// Mock posts for the carousel - would come from navigation state in production
interface PublicPost {
  id: string;
  username: string;
  avatar_url?: string;
  postImage?: string;
  postVideo?: string;
  postContent: string;
  isGold?: boolean;
  pounds: number;
  comments: number;
  viewCount: number;
  taggedUsers: Array<{ id: string; name: string; avatar: string }>;
  user_id?: string;
  isLive?: boolean;
  created_at?: string;
}

const mockPosts: PublicPost[] = [
  {
    id: "1",
    username: "Sarah Miller",
    avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    postImage: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80",
    postContent: "It's Friday night & I'm gonna get my drank on!!! Where are my peoples?",
    isGold: true,
    pounds: 16,
    comments: 8,
    viewCount: 142,
    taggedUsers: [
      { id: "t1", name: "Mike J", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100" },
      { id: "t2", name: "Emma W", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100" },
      { id: "t3", name: "Alex C", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100" },
    ],
  },
  {
    id: "2",
    username: "Mike Johnson",
    avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    postImage: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
    postContent: "Best DJ in town! 🔥🎵",
    isGold: false,
    pounds: 24,
    comments: 12,
    viewCount: 89,
    taggedUsers: [],
  },
  {
    id: "3",
    username: "Emma Wilson",
    avatar_url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150",
    postImage: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=400&q=80",
    postContent: "Living my best life tonight! 💃✨",
    isGold: false,
    pounds: 32,
    comments: 5,
    viewCount: 210,
    taggedUsers: [
      { id: "t4", name: "Sarah M", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100" },
    ],
  },
  {
    id: "4",
    username: "Alex Chen",
    avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
    postImage: "https://images.unsplash.com/photo-1504680177321-2e6a879aac86?w=400&q=80",
    postContent: "Vibes are immaculate 🔥",
    isGold: true,
    pounds: 45,
    comments: 18,
    viewCount: 356,
    taggedUsers: [
      { id: "t5", name: "User 1", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100" },
      { id: "t6", name: "User 2", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100" },
      { id: "t7", name: "User 3", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100" },
      { id: "t8", name: "User 4", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100" },
      { id: "t9", name: "User 5", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100" },
      { id: "t10", name: "User 6", avatar: "https://images.unsplash.com/photo-1463453091185-61582044d556?w=100" },
      { id: "t11", name: "User 7", avatar: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=100" },
    ],
  },
];

const PublicPostView = () => {
  const { t } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const { postId: routePostId } = useParams<{ postId?: string }>();
  const { user } = useAuth();
  const { poster, city, allPosters, postId } = location.state || {};
  const [routePost, setRoutePost] = useState<PublicPost | null>(null);
  const [routePostLoading, setRoutePostLoading] = useState(Boolean(routePostId && !poster));

  useEffect(() => {
    if (!routePostId || poster) {
      setRoutePost(null);
      setRoutePostLoading(false);
      return;
    }

    let active = true;

    const loadRoutePost = async () => {
      setRoutePostLoading(true);

      const { data: post, error } = await supabase
        .from("posts")
        .select("id, user_id, content, image_url, video_url, pounds_count, comments_count, view_count, is_live, created_at")
        .eq("id", routePostId)
        .eq("visibility", "public")
        .maybeSingle();

      if (error || !post) {
        if (active) setRoutePost(null);
        if (error) console.error("Failed to load public post:", error);
        if (active) setRoutePostLoading(false);
        return;
      }

      const [{ data: customerProfile }, { data: profile }] = await Promise.all([
        supabase
          .from("customer_profiles")
          .select("display_name, avatar_url")
          .eq("user_id", post.user_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("user_id", post.user_id)
          .maybeSingle(),
      ]);

      if (!active) return;

      setRoutePost({
        id: post.id,
        user_id: post.user_id,
        username: customerProfile?.display_name || profile?.full_name || "JointVibe member",
        avatar_url: customerProfile?.avatar_url || profile?.avatar_url || undefined,
        postImage: post.image_url || undefined,
        postVideo: post.video_url || undefined,
        postContent: post.content,
        isLive: post.is_live ?? false,
        isGold: false,
        pounds: post.pounds_count ?? 0,
        comments: post.comments_count ?? 0,
        viewCount: post.view_count ?? 0,
        taggedUsers: [],
        created_at: post.created_at ?? new Date().toISOString(),
      });
      setRoutePostLoading(false);
    };

    void loadRoutePost();

    return () => {
      active = false;
    };
  }, [poster, routePostId]);
  
  // Use all posters from navigation or fallback to mock
  const posts = useMemo<PublicPost[]>(
    () => routePost ? [routePost] : allPosters?.length > 0 ? allPosters : mockPosts,
    [allPosters, routePost],
  );
  
  // Find initial index: first try postId, then poster match, then 0
  const findInitialIndex = () => {
    const requestedPostId = postId || routePostId;
    if (requestedPostId) {
      const idx = posts.findIndex((post) => post.id === requestedPostId);
      if (idx >= 0) return idx;
    }
    if (poster) {
      const idx = posts.findIndex((post) => post.id === poster.id || post.username === poster.username);
      if (idx >= 0) return idx;
    }
    return 0;
  };
  const [currentIndex, setCurrentIndex] = useState(findInitialIndex());
  const [poundedPosts, setPoundedPosts] = useState<Set<string>>(new Set());
  const [poundCounts, setPoundCounts] = useState<Record<string, number>>({});
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  
  const currentPost = posts[currentIndex] || poster || mockPosts[0];
  const prevPost = posts[currentIndex - 1];
  const nextPost = posts[currentIndex + 1];

  // Fetch active ad for the selected city
  const selectedCity = city || "Brisbane";
  const { activeAd, trackClick } = useActiveAd(selectedCity, "public_post");

  // Use ad background if available, otherwise fallback to city background
  const backgroundUrl = activeAd?.media_url || cityBackgrounds[selectedCity] || cityBackgrounds["Brisbane"];
  const timeAgo = "11 minutes ago";

  // Fetch user's pounded posts and load counts
  useEffect(() => {
    const loadPostData = async () => {
      // Load pounds user has given
      if (user) {
        const postIds = posts.map((post) => post.id);
        const { data: userPounds } = await supabase
          .from("post_pounds")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds);
        
        if (userPounds) {
          setPoundedPosts(new Set(userPounds.map(p => p.post_id)));
        }
      }

      // Load pound counts for all posts
      const postIds = posts.map((post) => post.id);
      const { data: postsData } = await supabase
        .from("posts")
        .select("id, pounds_count, view_count")
        .in("id", postIds);
      
      if (postsData) {
        const counts: Record<string, number> = {};
        const views: Record<string, number> = {};
        postsData.forEach(p => {
          counts[p.id] = p.pounds_count || 0;
          views[p.id] = p.view_count || 0;
        });
        setPoundCounts(counts);
        setViewCounts(views);
      }
    };

    loadPostData();
  }, [user, posts]);

  // Track view when post changes
  useEffect(() => {
    const trackView = async () => {
      if (!currentPost?.id || currentPost.id.startsWith("mock") || currentPost.id === "1" || currentPost.id === "2" || currentPost.id === "3" || currentPost.id === "4") return;
      
      // Increment view count directly
      const currentViewCount = viewCounts[currentPost.id] || 0;
      await supabase
        .from("posts")
        .update({ view_count: currentViewCount + 1 })
        .eq("id", currentPost.id);
      
      setViewCounts(prev => ({
        ...prev,
        [currentPost.id]: currentViewCount + 1
      }));
    };

    trackView();
  }, [currentIndex, currentPost?.id]);

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < posts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePound = async (postId: string) => {
    if (!user) {
      toast.error("Please sign in to pound posts");
      return;
    }

    const isPounded = poundedPosts.has(postId);
    
    if (isPounded) {
      // Remove pound
      const { error } = await supabase
        .from("post_pounds")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      
      if (!error) {
        setPoundedPosts(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setPoundCounts(prev => ({
          ...prev,
          [postId]: Math.max((prev[postId] || 1) - 1, 0)
        }));
        
        // Update post count
        await supabase
          .from("posts")
          .update({ pounds_count: Math.max((poundCounts[postId] || 1) - 1, 0) })
          .eq("id", postId);
      }
    } else {
      // Add pound
      const { error } = await supabase
        .from("post_pounds")
        .insert({ post_id: postId, user_id: user.id });
      
      if (!error) {
        setPoundedPosts(prev => new Set([...prev, postId]));
        setPoundCounts(prev => ({
          ...prev,
          [postId]: (prev[postId] || 0) + 1
        }));
        
        // Update post count
        await supabase
          .from("posts")
          .update({ pounds_count: (poundCounts[postId] || 0) + 1 })
          .eq("id", postId);
        
        toast.success("Post pounded! 👊");
      }
    }
  };

  const handleSubmitComment = (data: { content: string; isPrivate: boolean; postId: string }) => {
    console.log("Submitting comment:", data);
    // TODO: Implement actual comment submission
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (commentModalOpen) return;
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
      if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, posts.length, commentModalOpen]);

  if (routePostLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (routePostId && !poster && !routePost) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
        <p>This post is unavailable.</p>
        <Button type="button" onClick={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  if (!currentPost) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">No post data available</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* City Background (or Ad Background) */}
      <div 
        className="absolute inset-0 bg-cover bg-center scale-110"
        style={{ backgroundImage: `url(${backgroundUrl})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      </div>

      {/* Ad Banner - Desktop: in content, Mobile: ticker at bottom */}
      {activeAd && (
        <div className="hidden md:block absolute top-20 left-4 right-4 z-20">
          <AdBanner
            headline={activeAd.headline}
            description={activeAd.description}
            propertyPrice={activeAd.property_price}
            propertyType={activeAd.property_type}
            propertyAddress={activeAd.property_address}
            ctaText={activeAd.cta_text}
            ctaUrl={activeAd.cta_url}
            onCtaClick={trackClick}
          />
        </div>
      )}

      {/* Mobile Ad Ticker */}
      {activeAd && (
        <div className="md:hidden">
          <AdBanner
            headline={activeAd.headline}
            description={activeAd.description}
            propertyPrice={activeAd.property_price}
            propertyType={activeAd.property_type}
            propertyAddress={activeAd.property_address}
            ctaText={activeAd.cta_text}
            ctaUrl={activeAd.cta_url}
            onCtaClick={trackClick}
          />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center py-8">
        {/* Carousel Container */}
        <div className="relative w-full max-w-[100vw] flex items-center justify-center perspective-1000">
          
          {/* Previous Post (Left Side) */}
          {prevPost && (
            <div 
              onClick={goToPrev}
              className="absolute left-0 md:left-[5%] cursor-pointer transition-all duration-500 ease-out transform -rotate-y-15 scale-75 opacity-60 hover:opacity-80 z-10"
              style={{
                transform: "perspective(1000px) rotateY(25deg) translateX(-20%) scale(0.7)",
              }}
            >
              <PostCard 
                post={prevPost} 
                city={city} 
                isActive={false}
                isPounded={poundedPosts.has(prevPost.id)}
                onPound={() => {}}
                onComment={() => {}}
              />
            </div>
          )}

          {/* Current Post (Center) */}
          <div className="relative z-20 transition-all duration-500 ease-out transform scale-100">
            <PostCard 
              post={currentPost} 
              city={city} 
              isActive={true} 
              timeAgo={timeAgo}
              isPounded={poundedPosts.has(currentPost.id)}
              onPound={() => handlePound(currentPost.id)}
              onComment={() => setCommentModalOpen(true)}
              onAuthorClick={() => currentPost.user_id && navigate(`/app/user/${currentPost.user_id}`)}
            />
          </div>

          {/* Next Post (Right Side) */}
          {nextPost && (
            <div 
              onClick={goToNext}
              className="absolute right-0 md:right-[5%] cursor-pointer transition-all duration-500 ease-out transform rotate-y-15 scale-75 opacity-60 hover:opacity-80 z-10"
              style={{
                transform: "perspective(1000px) rotateY(-25deg) translateX(20%) scale(0.7)",
              }}
            >
              <PostCard 
                post={nextPost} 
                city={city} 
                isActive={false}
                isPounded={poundedPosts.has(nextPost.id)}
                onPound={() => {}}
                onComment={() => {}}
              />
            </div>
          )}
        </div>

        {/* Navigation Arrows */}
        <div className="flex items-center gap-8 mt-6">
          <button 
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className={`p-3 rounded-full bg-black/40 backdrop-blur-xl transition-all
              ${currentIndex === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-black/60 hover:scale-110"}`}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          
          {/* Dots Indicator */}
          <div className="flex gap-2">
            {posts.map((_, idx) => (
              <div 
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full cursor-pointer transition-all ${
                  idx === currentIndex 
                    ? "w-6 bg-neon-cyan" 
                    : "bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>

          <button 
            onClick={goToNext}
            disabled={currentIndex === posts.length - 1}
            className={`p-3 rounded-full bg-black/40 backdrop-blur-xl transition-all
              ${currentIndex === posts.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-black/60 hover:scale-110"}`}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Close Button */}
        <button 
          onClick={() => navigate(-1)}
          className="mt-6 p-4 bg-black/40 backdrop-blur-xl rounded-full hover:bg-black/60 transition-colors"
        >
          <X className="w-8 h-8 text-white" />
        </button>
      </div>

      {/* Comment Modal */}
      <CommentModal
        isOpen={commentModalOpen}
        onClose={() => setCommentModalOpen(false)}
        postId={currentPost.id}
        postAuthorName={currentPost.username}
        postAuthorAvatar={currentPost.avatar_url}
        userAvatar={localStorage.getItem('jv_profile_picture') || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100"}
        userName={localStorage.getItem('jv_verified_name') || "You"}
        onSubmitComment={handleSubmitComment}
      />
    </div>
  );
};

// Separate PostCard component for reuse
const PostCard = ({ 
  post, 
  city, 
  isActive, 
  timeAgo = "11 minutes ago",
  isPounded,
  onPound,
  onComment,
  onAuthorClick,
}: { 
  post: PublicPost;
  city?: string; 
  isActive: boolean;
  timeAgo?: string;
  isPounded: boolean;
  onPound: () => void;
  onComment: () => void;
  onAuthorClick?: () => void;
}) => {
  const poundCount = isPounded ? (post.pounds || 0) + 1 : (post.pounds || 0);
  
  return (
    <div className={`flex flex-col items-center ${isActive ? "" : "pointer-events-none"}`}>
      {/* Profile Section - Only show for active */}
      {isActive && (
        <div className="flex flex-col items-center mb-4">
          <div
            className={`relative ${onAuthorClick ? "cursor-pointer" : ""}`}
            onClick={onAuthorClick}
          >
            <div className={`p-1 rounded-full ${
              post.isGold 
                ? "bg-gradient-to-br from-yellow-400 via-amber-300 to-yellow-500 shadow-[0_0_30px_rgba(255,215,0,0.5)]" 
                : "bg-gradient-to-br from-neon-purple via-neon-pink to-neon-cyan"
            }`}>
              <Avatar className="w-24 h-24 ring-4 ring-black">
                <AvatarImage src={post.avatar_url} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-neon-purple to-neon-pink text-white text-3xl font-bold">
                  {post.username?.[0]}
                </AvatarFallback>
              </Avatar>
            </div>
            
            {/* Live Indicator - pulsing green circle */}
            {post.isLive && (
              <div className="absolute -top-1 -right-1 w-7 h-7 flex items-center justify-center z-10">
                <div className="absolute w-7 h-7 bg-green-500 rounded-full animate-ping opacity-75" />
                <div className="relative w-6 h-6 bg-green-500 rounded-full border-2 border-black shadow-[0_0_15px_rgba(34,197,94,0.8)] flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                </div>
              </div>
            )}
          </div>
          <h2
            className={`text-2xl font-bold text-white mt-4 drop-shadow-lg ${onAuthorClick ? "cursor-pointer hover:text-neon-cyan transition-colors" : ""}`}
            onClick={onAuthorClick}
          >
            {post.username}
          </h2>
          <div className="flex items-center gap-1 text-neon-cyan">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">@ {city || "Unknown"}</span>
          </div>
          <p className="text-white/70 text-sm mt-1">{timeAgo}</p>
          
          {/* Tagged Users */}
          {post.taggedUsers && post.taggedUsers.length > 0 && (
            <div className="mt-2">
              <TaggedUsersDisplay
                users={post.taggedUsers.map((user) => ({
                  id: user.id,
                  username: user.name,
                  avatar_url: user.avatar,
                }))}
              />
            </div>
          )}
        </div>
      )}

      {/* Post Card */}
      <div className={`${isActive ? "w-80 md:w-96" : "w-64 md:w-72"} mx-auto`}>
        {/* Post Media (9:16) with overlay caption */}
        <div className="relative rounded-2xl overflow-hidden shadow-2xl">
          <MediaFrame
            imageUrl={post.postImage || `https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80`}
            videoUrl={post.postVideo}
            aspectRatio="9/16"
            autoPlay={isActive}
          />
          
          {/* Live Badge */}
          {post.isLive && post.postVideo && (
            <div className="absolute top-3 left-3 z-30 flex items-center gap-1 bg-red-500 px-2 py-1 rounded text-xs font-bold text-white">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </div>
          )}
          
          {/* Bottom overlay: caption + engagement */}
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-3 pt-12">
            {/* Caption overlay */}
            {post.postContent && (
              <CaptionOverlay text={post.postContent} />
            )}
            
            {/* Engagement Stats */}
            <div className="flex items-center gap-4 mt-2">
              <button 
                onClick={onPound}
                className="flex items-center gap-1 text-white hover:text-neon-pink transition-colors group"
              >
                <FistPoundIcon 
                  filled={isPounded} 
                  className={`w-6 h-6 transition-all ${isPounded ? "text-neon-pink scale-110" : "text-white group-hover:scale-110"}`} 
                />
                <span className="text-sm font-bold">{poundCount}</span>
              </button>
              <button 
                onClick={onComment}
                className="flex items-center gap-1 text-white hover:text-neon-cyan transition-colors"
              >
                <MessageCircle className="w-6 h-6" />
                <span className="text-sm font-bold">{post.comments || 0}</span>
              </button>
              {/* View Count */}
              <div className="flex items-center gap-1 text-white/70">
                <Eye className="w-5 h-5" />
                <span className="text-sm">{post.viewCount || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Only for active post */}
        {isActive && (
          <div className="flex gap-3 mt-4">
            {post.user_id ? (
              <FollowButton
                targetUserId={post.user_id}
                className="flex-1"
              />
            ) : (
              <Button 
                className="flex-1 bg-gradient-to-r from-neon-cyan to-neon-purple text-white hover:opacity-90"
                disabled
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Follow
              </Button>
            )}
            <Button 
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// Caption overlay with gradient readability
const CaptionOverlay = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 120;

  return (
    <div className="max-w-[90%]">
      <p className={expanded ? "text-sm text-white leading-relaxed whitespace-pre-wrap" : "text-sm text-white leading-relaxed whitespace-pre-wrap line-clamp-2"}>
        {text}
      </p>
      {isLong && !expanded && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="text-xs text-white/60 hover:text-white/80 mt-0.5"
        >
          more
        </button>
      )}
    </div>
  );
};

export default PublicPostView;
