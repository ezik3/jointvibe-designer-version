import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Compass, Radio, Eye, Play } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import useCustomerDashboardPresentation from "@/hooks/useCustomerDashboardPresentation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFollowingFeed } from "@/hooks/useExploreData";
import { globalCache } from "@/hooks/useGlobalPrefetch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useLivePresence } from "@/hooks/useLivePresence";
import ImmersivePostCard from "@/components/Customer/Feed/ImmersivePostCard";
import CommentModal from "@/components/Customer/Feed/CommentModal";
import ExploreGridCard from "@/components/Customer/Explore/ExploreGridCard";
import DesktopPostViewer from "@/components/Customer/Explore/DesktopPostViewer";
import { useVideoPreload } from "@/hooks/useVideoPreload";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import { rankAndDiversify } from "@/utils/postRanking";
import { performanceCache, CACHE_KEYS } from "@/utils/cache";
import { useTranslation } from 'react-i18next';
import { cutoffIsoForPublicFeeds, hoursRemaining } from "@/lib/postExpiry";
import "./explore.css";

type TabId = "foryou" | "explore" | "city" | "live" | "following";

interface Post {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
  venue_id?: string;
  visibility?: string;
  post_type?: string;
  is_live?: boolean;
  author_name?: string;
  author_avatar?: string;
  author_tier?: string;
  customer_profiles?: {
    display_name?: string;
    avatar_url?: string;
  } | null;
  venues?: {
    name: string;
  } | null;
}

const tabs: { id: TabId; label: string }[] = [
  { id: "foryou", label: "For you" },
  { id: "explore", label: "Explore" },
  { id: "city", label: "City" },
  { id: "live", label: "Live" },
  { id: "following", label: "Following" },
];

const Explore = () => {
  const { t } = useTranslation('common');
  // Read ?tab= query param for initial tab
  const initialTab = (() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && ["foryou", "explore", "city", "live", "following"].includes(tab)) {
      return tab as TabId;
    }
    return "explore" as TabId;
  })();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Sync activeTab when URL query param changes (e.g. bottom nav taps)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["foryou", "explore", "city", "live", "following"].includes(tab)) {
      setActiveTab(tab as TabId);
    }
  }, [searchParams]);
  const isMobile = useIsMobile();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const usesImmersiveMobilePresentation = isMobile && !isDashboardPresentation;
  const { user } = useAuth();
  
  // Initialize from global cache for instant display
  const [posts, setPosts] = useState<Post[]>(() => {
    const cached = (globalCache.trendingPosts || globalCache.posts || []) as Post[];
    return cached.filter((post) => post.created_at && post.created_at >= cutoffIsoForPublicFeeds());
  });
  const [loading, setLoading] = useState(!globalCache.trendingPosts && !globalCache.posts);
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [postPendingDeletion, setPostPendingDeletion] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{ posts: Post[]; initialIndex: number } | null>(null);
  const [userProfile, setUserProfile] = useState<{ avatar_url?: string } | null>(null);
  const { streams: livePresenceStreams, loading: livePresenceLoading } = useLivePresence();
  const liveLoading = livePresenceLoading;
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Only fetch following feed when the tab is active
  const { posts: followingPosts, loading: followingLoading } = useFollowingFeed(activeTab === 'following');

  // Video preloading
  useVideoPreload(posts.map(p => ({ id: p.id, video_url: p.video_url })), currentPostIndex);

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('customer_profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data) {
        setUserProfile(data);
      }
    };
    
    fetchUserProfile();
  }, [user]);

  // Fetch posts based on active tab with caching and parallel queries
  const fetchPosts = useCallback(async () => {
    try {
      // Generate cache key based on active tab
      const cacheKey = (() => {
        switch (activeTab) {
          case "foryou":
            return CACHE_KEYS.EXPLORE_FOR_YOU(user?.id || 'anonymous');
          case "city":
            return CACHE_KEYS.EXPLORE_CITY('global'); // Could be city-specific later
          case "explore":
          default:
            return CACHE_KEYS.EXPLORE_TRENDING;
        }
      })();
      
      // Check cache first
      const cachedPosts = performanceCache.get<Post[]>(cacheKey);
      if (cachedPosts) {
        setPosts(cachedPosts);
        setLoading(false);
        return;
      }
      
      let query = supabase.from('posts').select('*').gte('created_at', cutoffIsoForPublicFeeds());
      
      switch (activeTab) {
        case "foryou":
        case "explore":
          query = query
            .eq('visibility', 'public')
            .order('pounds_count', { ascending: false })
            .limit(20);
          break;
        case "city":
          query = query
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(20);
          break;
        case "live":
          // Live tab uses live_streams table, not posts - handled separately
          return;
        case "following":
          // Use the following feed hook data
          return;
        default:
          query = query.order('created_at', { ascending: false }).limit(20);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error(error);
        return;
      }
      
      // Fetch profiles and tiers in parallel
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(p => p.user_id))];
        
        const [profilesResult, tiersResult] = await Promise.all([
          supabase
            .from('customer_profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', userIds),
          supabase
            .from("user_tiers")
            .select("user_id, current_tier")
            .in("user_id", userIds)
        ]);
        
        const profileMap = new Map(profilesResult.data?.map(p => [p.user_id, p]) || []);
        const tierMap = new Map((tiersResult.data || []).map((tier) => [tier.user_id, tier.current_tier]));

        const postsWithProfiles = data.map(post => ({
          ...post,
          customer_profiles: profileMap.get(post.user_id) || null,
          author_name: profileMap.get(post.user_id)?.display_name || 'Anonymous',
          author_avatar: profileMap.get(post.user_id)?.avatar_url,
          author_tier: tierMap.get(post.user_id) || undefined,
        }));
        
        setPosts(postsWithProfiles as Post[]);
        // Cache for 60 seconds
        performanceCache.set(cacheKey, postsWithProfiles, 60000);
      } else {
        setPosts([]);
      }
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }, [activeTab, user?.id]);

  // fetchLiveStreams is now handled by useLivePresence hook
  const fetchLiveStreams = useCallback(() => {
    // No-op — live streams come from useLivePresence
  }, []);

  useEffect(() => {
    if (activeTab === "following") {
      const mappedPosts = followingPosts.map(p => ({
        ...p,
        author_name: p.author_name || 'Anonymous',
        author_avatar: p.author_avatar,
      })) as Post[];
      setPosts(mappedPosts);
      setLoading(followingLoading);
    } else if (activeTab === "live") {
      fetchLiveStreams();
    } else {
      fetchPosts();
    }
    setCurrentPostIndex(0);
  }, [activeTab, fetchPosts, fetchLiveStreams, followingPosts, followingLoading]);

  // Realtime for live_streams is handled globally by useLivePresence hook

  // Handle scroll for snap detection
  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const postHeight = containerRef.current.clientHeight || window.innerHeight;
    const newIndex = Math.round(scrollTop / postHeight);
    setCurrentPostIndex(newIndex);
  };

  // Handle comment click
  const handleCommentClick = (post: Post) => {
    setSelectedPost(post);
    setShowCommentModal(true);
  };

  // Handle pound
  const handlePound = async (postId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("post_pounds")
      .insert({ post_id: postId, user_id: user.id });
    if (error && !error.message.includes("duplicate")) {
      toast.error("Failed to pound post");
    }
  };

  // Handle comment submission
  const handleSubmitComment = async (data: { content: string; isPrivate: boolean; postId: string }) => {
    if (!user) return;
    
    try {
      const { error } = await supabase.from("post_comments").insert({
        post_id: data.postId,
        user_id: user.id,
        content: data.content,
      });

      if (error) throw error;
      toast.success("Comment posted!");
      fetchPosts();
    } catch (error) {
      toast.error("Failed to post comment");
    }
  };

  // Navigate to similar post
  const handleNavigateToSimilar = (postId: string) => {
    const targetIndex = posts.findIndex(p => p.id === postId);
    if (targetIndex !== -1 && containerRef.current) {
      const postHeight = containerRef.current.clientHeight || window.innerHeight;
      containerRef.current.scrollTo({ top: targetIndex * postHeight, behavior: 'smooth' });
      setCurrentPostIndex(targetIndex);
    }
  };

  // Save post handler
  const handleSavePost = async (postId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("saved_posts").upsert(
        { user_id: user.id, post_id: postId },
        { onConflict: "user_id,post_id" }
      );
      if (error) throw error;
      toast.success("Post saved to your profile!", { icon: "🔖" });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate")) {
        toast.info("Post already saved");
      } else {
        toast.error("Failed to save post");
      }
    }
  };

  // Delete post handler
  const handleDeletePost = (postId: string) => {
    if (!user) return;
    setPostPendingDeletion(postId);
  };

  const handleConfirmDeletePost = async () => {
    const postId = postPendingDeletion;
    setPostPendingDeletion(null);
    if (!user || !postId) return;

    try {
      const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", user.id);
      if (error) throw error;
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.success("Post deleted");
    } catch {
      toast.error("Failed to delete post");
    }
  };

  // Report post handler
  const handleReportPost = async (postId: string, reason: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("post_reports").insert({
        post_id: postId,
        reporter_id: user.id,
        reason,
      });
      if (error) throw error;
      toast.success("Report submitted. Thanks for keeping the community safe.");
    } catch {
      toast.error("Failed to submit report");
    }
  };

  // Get current posts based on tab — ranked + diversified
  const displayPosts = useMemo(() => rankAndDiversify(posts), [posts]);

  const changeTab = (tab: TabId) => {
    setActiveTab(tab);
  };

  const renderTabs = (className: string) => (
    <nav className={className} aria-label="Explore filters" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const isLive = tab.id === "live";

        return (
          <button
            key={tab.id}
            className={`customer-explore-page__tab${isActive ? " customer-explore-page__tab--active" : ""}${isLive ? " customer-explore-page__tab--live" : ""}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => changeTab(tab.id)}
          >
            {isLive && <Radio aria-hidden="true" />}
            {tab.label}
            {isLive && <span aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );

  const renderPostEmpty = (isLoading: boolean) => (
    <div className="customer-explore-page__state" aria-live="polite">
      <span className={`customer-explore-page__state-icon${isLoading ? " customer-explore-page__state-icon--loading" : ""}`}>
        {isLoading ? <span aria-hidden="true" /> : <Compass aria-hidden="true" />}
      </span>
      <div>
        <h2>{isLoading ? t("feed:loading") : t("feed:empty.no_posts")}</h2>
        {!isLoading && <p>{t("feed:empty.check_back_later")}</p>}
      </div>
    </div>
  );

  return (
    <div className={`customer-explore-page${usesImmersiveMobilePresentation ? " customer-explore-page--mobile" : ""}${isDashboardPresentation ? " customer-explore-page--dashboard-presentation" : ""}`} role="main" aria-labelledby="explore-title">
      <h1 id="explore-title" className="customer-explore-page__sr-only">Explore</h1>
      {usesImmersiveMobilePresentation && (
        <>
          <Web3FeedHeader />
          <div className="customer-explore-page__mobile-tabs">
            {renderTabs("customer-explore-page__tabs")}
          </div>
        </>
      )}

      {/* Desktop explore tabs (no back arrow, just tabs) */}
      {!usesImmersiveMobilePresentation && (
        <div className="customer-explore-page__desktop-tabs">
          {renderTabs("customer-explore-page__tabs")}
        </div>
      )}

      {/* Live Tab - Shows real-time streams from live_streams table */}
      {activeTab === "live" ? (
        <div className={`customer-explore-page__live-content${usesImmersiveMobilePresentation ? " customer-explore-page__live-content--mobile" : ""}`}>
          <div className="customer-explore-page__live-inner">
          {liveLoading ? (
            renderPostEmpty(true)
          ) : livePresenceStreams.length === 0 ? (
            <div className="customer-explore-page__state" aria-live="polite">
              <span className="customer-explore-page__state-icon customer-explore-page__state-icon--live"><Radio aria-hidden="true" /></span>
              <div>
                <h2>{t("feed:empty.no_live_streams")}</h2>
                <p>{t("feed:empty.be_first_to_go_live")}</p>
              </div>
            </div>
          ) : (
            <div className="customer-explore-page__live-grid">
              {livePresenceStreams.map((stream) => (
                <button
                  key={stream.id}
                  onClick={() => navigate(`/app/live/watch/${stream.id}`)}
                  className="customer-explore-page__live-card"
                >
                  <div className="customer-explore-page__live-card-art" />
                  <div className="customer-explore-page__live-card-shade" />

                  {/* Live badge */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-destructive px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-white text-[10px] font-bold">LIVE</span>
                  </div>

                  {/* Viewer count */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full">
                    <Eye className="w-3 h-3 text-white" />
                    <span className="text-white text-[10px]">{stream.viewer_count || 0}</span>
                  </div>

                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 rounded-full bg-destructive/80 backdrop-blur flex items-center justify-center">
                      <Play className="w-6 h-6 text-white fill-white ml-1" />
                    </div>
                  </div>

                  {/* Host info */}
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar className="w-6 h-6 ring-2 ring-destructive">
                        <AvatarImage src={stream.host_avatar} />
                        <AvatarFallback className="bg-destructive text-white text-xs">
                          {stream.host_name?.[0] || "S"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-white text-xs font-semibold truncate">
                        {stream.host_name}
                      </span>
                    </div>
                    <p className="text-white/80 text-[10px] line-clamp-2">{stream.title}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          </div>{/* end max-w-6xl */}
        </div>
      ) : !usesImmersiveMobilePresentation ? (
        <div className="customer-explore-page__desktop-content">
          <div className="customer-explore-page__desktop-inner">
            {displayPosts.length === 0 ? (
              renderPostEmpty(loading)
            ) : (
              <div className="customer-explore-page__grid">
                {displayPosts.map((post, index) => (
                  <ExploreGridCard
                    key={post.id}
                    post={post}
                    onClick={() => setViewerState({ posts: displayPosts, initialIndex: index })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Desktop Post Viewer */}
          {viewerState && (
            <DesktopPostViewer
              posts={viewerState.posts}
              initialIndex={viewerState.initialIndex}
              onClose={() => setViewerState(null)}
              onPound={handlePound}
              onComment={handleCommentClick}
              onShare={() => toast.info("Share coming soon!")}
              onSave={handleSavePost}
              onDelete={handleDeletePost}
              onReport={handleReportPost}
              currentUserId={user?.id}
            />
          )}
        </div>
      ) : (
      /* Mobile: Full-Screen Snap-Scroll Posts */
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="customer-explore-page__mobile-feed"
        style={{ touchAction: 'pan-y' }}
      >
        {displayPosts.length === 0 ? (
          <div className="customer-explore-page__mobile-empty">
            {renderPostEmpty(loading)}
          </div>
        ) : (
          displayPosts.map((post, index) => (
            <div
              key={post.id}
              className="customer-explore-page__mobile-post"
            >
              <ImmersivePostCard
                id={post.id}
                authorId={post.user_id}
                authorName={post.customer_profiles?.display_name || post.author_name || "Anonymous"}
                authorAvatar={post.customer_profiles?.avatar_url || post.author_avatar}
                authorTier={post.author_tier}
                isOnline={Math.random() > 0.5}
                isGold={post.post_type === "gold"}
                isAR={index % 3 === 0}
                content={post.content}
                imageUrl={post.image_url}
                videoUrl={post.video_url}
                venueName={post.venues?.name}
                poundsCount={post.pounds_count || 0}
                commentsCount={post.comments_count || 0}
                createdAt={post.created_at}
                expiresIn={hoursRemaining(post.created_at)}
                onPound={() => handlePound(post.id)}
                onComment={() => handleCommentClick(post)}
                onShare={() => toast.info("Share coming soon!")}
                isActive={index === currentPostIndex}
                allPosts={displayPosts.map(p => ({ id: p.id, content: p.content, videoUrl: p.video_url, imageUrl: p.image_url }))}
                onNavigateToSimilar={handleNavigateToSimilar}
                currentUserId={user?.id}
                onSavePost={handleSavePost}
                onDeletePost={handleDeletePost}
                onReportPost={handleReportPost}
              />
            </div>
          ))
        )}
      </div>
      )}

      {/* Comment Modal */}
      <CommentModal
        isOpen={showCommentModal}
        onClose={() => {
          setShowCommentModal(false);
          setSelectedPost(null);
        }}
        postId={selectedPost?.id || ""}
        postAuthorName={selectedPost?.customer_profiles?.display_name || selectedPost?.author_name || "Anonymous"}
        postAuthorAvatar={selectedPost?.customer_profiles?.avatar_url || selectedPost?.author_avatar}
        userAvatar={userProfile?.avatar_url}
        userName={undefined}
        onSubmitComment={handleSubmitComment}
      />
      <AlertDialog open={Boolean(postPendingDeletion)} onOpenChange={(open) => { if (!open) setPostPendingDeletion(null); }}>
        <AlertDialogContent className="customer-dialog-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleConfirmDeletePost()}>
              Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Explore;
