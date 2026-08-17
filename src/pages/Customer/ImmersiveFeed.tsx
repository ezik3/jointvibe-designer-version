import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useMobileNavVisibility } from "@/contexts/MobileNavVisibilityContext";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileBottomNav from "@/components/Customer/MobileBottomNav";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { recordTierEvent } from "@/hooks/useUserTier";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import DealCard from "@/components/Customer/Deals/DealCard";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import HexagonalStoryRing from "@/components/Customer/Feed/HexagonalStoryRing";
import CreatePostModal from "@/components/Customer/Feed/CreatePostModal";
import GoLiveRecorder from "@/components/Customer/Feed/GoLiveRecorder";
import CommentModal from "@/components/Customer/Feed/CommentModal";
import FloatingAIButton from "@/components/Customer/FloatingAIButton";
import LiveDebugBanner from "@/components/Customer/Live/LiveDebugBanner";
import TaggedUsersDisplay from "@/components/Customer/Feed/TaggedUsersDisplay";
import VenueMentionText from "@/components/Customer/Feed/VenueMentionText";
import MediaFrame from "@/components/Customer/Feed/MediaFrame";
import ClampedCaption from "@/components/Customer/Feed/ClampedCaption";
import ImmersivePostCard from "@/components/Customer/Feed/ImmersivePostCard";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { Plus, Radio, Video, CheckCircle, Bot, Mic, Wand2, MessageCircle, Bookmark, Share2, MapPin, Star, User, Play, Sparkles, Tag, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { globalCache } from "@/hooks/useGlobalPrefetch";
import { useVideoPreload, preloadInitialVideos } from "@/hooks/useVideoPreload";
import { useWatchTimeTracker } from "@/hooks/useWatchTimeTracker";
import { useLivePresence } from "@/hooks/useLivePresence";
import { useUserCheckIn } from "@/hooks/useUserCheckIn";
import fistIcon from "@/assets/fist-icon.png";
import type { VenuePostIntentType } from "@/utils/venueInterestSignals";
import { hoursRemaining, cutoffIsoForPublicFeeds } from "@/lib/postExpiry";

interface Post {
  id: string;
  content: string;
  source_language?: string | null;
  language_confidence?: number | null;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count: number;
  share_count?: number;
  created_at: string;
  user_id: string;
  venue_id?: string;
  visibility?: string;
  post_type?: string;
  is_live?: boolean;
  shared_post_id?: string;
  taggedUsers?: any[];
  author_tier?: string;
  customer_profiles?: {
    display_name?: string;
    avatar_url?: string;
  } | null;
  venues?: {
    name: string;
  } | null;
  metadata?: {
    venue_mention_intent?: {
      venueId: string;
      venueName: string;
      mentionText: string;
      intent: VenuePostIntentType;
    };
  } | null;
}

interface StoryUser {
  id: string;
  username: string;
  avatar_url?: string;
  isGold?: boolean;
  hasUnseenStory?: boolean;
  expiresIn?: number;
  city?: string;
  distance?: number;
  isOnline?: boolean;
  isLive?: boolean;
}

const ImmersiveFeed = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t } = useTranslation(["feed", "common"]);
  const { navsVisible } = useScrollDirection(!isMobile);
  const { currentCheckIn } = useUserCheckIn();
  const { deals: feedDeals, redeemDeal, recordImpression, snoozeDeal } = useActiveDeals('feed', 5);
  
  // Force black background while immersive feed is mounted
  useEffect(() => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;

    const prevHtmlBg = htmlEl.style.backgroundColor;
    const prevBodyBg = bodyEl.style.backgroundColor;

    document.documentElement.classList.add('immersive-feed');
    htmlEl.style.backgroundColor = '#000';
    bodyEl.style.backgroundColor = '#000';

    return () => {
      document.documentElement.classList.remove('immersive-feed');
      htmlEl.style.backgroundColor = prevHtmlBg;
      bodyEl.style.backgroundColor = prevBodyBg;
    };
  }, []);
  
  // Initialize from global cache for instant display.
  // If there is no cache yet, start loading=true so the skeleton renders immediately
  // instead of a flash of "No posts yet" while the first fetch is in-flight.
  const [posts, setPosts] = useState<Post[]>(() =>
    (((globalCache.posts as Post[]) || []).filter((post) => post.created_at && post.created_at >= cutoffIsoForPublicFeeds()))
  );
  const [loading, setLoading] = useState(() => !globalCache.posts);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGoLiveRecorder, setShowGoLiveRecorder] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [postPendingDeletion, setPostPendingDeletion] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ display_name?: string; avatar_url?: string; location?: string } | null>(null);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [canUseGold, setCanUseGold] = useState(true);
  const [userCity, setUserCity] = useState<string>("Brisbane");
  const [sharePost, setSharePost] = useState<{ id: string; content: string; authorName: string; imageUrl?: string; videoUrl?: string } | null>(null);
  // Set of user_ids whose content is allowed on the Home feed (self + followed). Empty until first fetch.
  const [feedAllowedUserIds, setFeedAllowedUserIds] = useState<Set<string>>(new Set());
  const { streams: liveStreams, isUserLive, getStreamForUser } = useLivePresence();

  // Merge live streams INTO the story ring as additional bubbles.
  // Only show live bubbles for hosts the user follows (or themselves) on the Home feed.
  const liveStoryUsers = useMemo(() => {
    const base = storyUsers.map((u) => ({ ...u, isLive: isUserLive(u.id) }));
    const existingUserIds = new Set(storyUsers.map(u => u.id));
    const liveOnlyBubbles: StoryUser[] = liveStreams
      .filter(s => feedAllowedUserIds.has(s.host_user_id))
      .filter(s => !existingUserIds.has(s.id) && !existingUserIds.has(s.host_user_id))
      .map(s => ({
        id: s.host_user_id,
        username: s.host_name?.split(' ')[0] || 'Live',
        avatar_url: s.host_avatar || undefined,
        isLive: true,
        hasUnseenStory: true,
        isOnline: true,
      }));
    return [...liveOnlyBubbles, ...base];
  }, [storyUsers, liveStreams]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Video preloading
  useVideoPreload(posts.map(p => ({ id: p.id, video_url: p.video_url })), 0);

  // Fetch user profile including location/city
  useEffect(() => {
    const fetchUserProfile = async () => {
      const verifiedName = localStorage.getItem("jv_verified_name");
      const profilePic = localStorage.getItem("jv_profile_picture");
      
      if (verifiedName || profilePic) {
        setCurrentUserProfile({
          display_name: verifiedName || undefined,
          avatar_url: profilePic || undefined,
        });
      }
      
      if (!user) return;

      const { data: profile } = await supabase
        .from("customer_profiles")
        .select("display_name, avatar_url, location")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        setCurrentUserProfile({
          display_name: profile.display_name || verifiedName || undefined,
          avatar_url: profile.avatar_url || profilePic || undefined,
          location: profile.location || undefined,
        });
        
        if (profile.location) {
          const city = profile.location.split(',')[0]?.trim();
          if (city) setUserCity(city);
        }
      }
    };

    fetchUserProfile();
  }, [user]);

  // Fetch posts - optimized for speed with caching
  const fetchPosts = useCallback(async () => {
    if (!globalCache.posts) setLoading(true);
    try {
      // Fetch the user's following list to filter feed
      let followingIds: string[] = [];
      if (user) {
        const { data: followData } = await supabase
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", user.id);
        followingIds = followData?.map(f => f.following_id) || [];
      }

      // Build the list of user IDs whose posts to show (self + followed)
      const feedUserIds = user ? [user.id, ...followingIds] : [];
      const allowedSet = new Set(feedUserIds);
      setFeedAllowedUserIds(allowedSet);

      // If not logged in or following nobody (other than self with no posts),
      // show empty feed (deals/vibes still show independently)
      if (feedUserIds.length === 0) {
        setPosts([]);
        globalCache.posts = [];
        globalCache.lastFetch.posts = Date.now();
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, user_id, venue_id, content, source_language, language_confidence, image_url, video_url, pounds_count, comments_count, share_count, created_at, visibility, post_type, is_live, shared_post_id, venues(name)",
        )
        .in("user_id", feedUserIds)
        .gte("created_at", cutoffIsoForPublicFeeds())
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) { console.error(error); setLoading(false); return; }
      
      // Client-side filter: RLS allows all public posts through (needed for Explore/CityView),
      // but the home feed should only show posts from self + followed users.
      const feedFiltered = (data || []).filter(
        (p: any) => feedUserIds.includes(p.user_id)
      );
      
      // Avoid the "Anonymous → real name" flicker by NOT painting raw posts first.
      // If we already have a cached version with profiles, paint that immediately;
      // otherwise wait until profiles are hydrated below.
      const sliced = feedFiltered.slice(0, 20);
      const cachedById = new Map<string, any>();
      (globalCache.posts || []).forEach((p: any) => {
        if (p && p.customer_profiles) cachedById.set(p.id, p);
      });
      if (cachedById.size > 0) {
        const merged = sliced.map((p: any) => cachedById.get(p.id) ? { ...p, ...cachedById.get(p.id) } : p);
        setPosts(merged as unknown as Post[]);
        setLoading(false);
      }

      preloadInitialVideos(sliced.filter((p: any) => p.video_url).slice(0, 3));

      if (sliced.length > 0) {
        // Re-bind feedFiltered name used below
        const feedFilteredHydrated = sliced;
        const userIds = [...new Set(feedFiltered.map((p: any) => p.user_id))];
        const { data: profiles } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);
        
        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

        // Fetch tiers for post authors
        const { data: tierRows } = await supabase
          .from("user_tiers")
          .select("user_id, current_tier")
          .in("user_id", userIds);
        const tierMap = new Map(tierRows?.map((t: any) => [t.user_id, t.current_tier]) || []);

        const postsWithProfiles = feedFiltered.map((post: any) => ({
          ...post,
          customer_profiles: profileMap.get(post.user_id) || null,
          author_tier: tierMap.get(post.user_id) || undefined,
        }));
        
        const postIds = feedFiltered.map((p: any) => p.id);
        const { data: taggedData } = await (supabase as any)
          .from("post_tagged_users")
          .select("post_id, user_id")
          .in("post_id", postIds);
        
        let taggedProfileMap = new Map<string, any>();
        if (taggedData && taggedData.length > 0) {
          const taggedUserIds = [...new Set(taggedData.map((t: any) => t.user_id))] as string[];
          const { data: taggedProfiles } = await supabase
            .from("customer_profiles")
            .select("user_id, display_name, avatar_url, age, relationship_status, location, connection_count")
            .in("user_id", taggedUserIds);
          taggedProfileMap = new Map(taggedProfiles?.map(p => [p.user_id, p]) || []);
        }
        
        const tagsByPost = new Map<string, any[]>();
        if (taggedData) {
          for (const tag of taggedData) {
            const profile = taggedProfileMap.get(tag.user_id);
            const tagUser = {
              id: tag.user_id,
              username: profile?.display_name || "Anonymous",
              avatar_url: profile?.avatar_url,
              age: profile?.age,
              relationship_status: profile?.relationship_status,
              location: profile?.location,
              connection_count: profile?.connection_count,
            };
            if (!tagsByPost.has(tag.post_id)) tagsByPost.set(tag.post_id, []);
            tagsByPost.get(tag.post_id)!.push(tagUser);
          }
        }
        
        const postsWithAll = postsWithProfiles.map(post => ({
          ...post,
          taggedUsers: tagsByPost.get(post.id) || [],
        }));
        
        setPosts(postsWithAll as Post[]);
        globalCache.posts = postsWithAll;
        globalCache.lastFetch.posts = Date.now();
        setLoading(false);
      } else {
        setPosts([]);
        globalCache.posts = [];
        globalCache.lastFetch.posts = Date.now();
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPosts();

    const buildStoryUsersFromCache = (): StoryUser[] => {
      // Home feed story rail must be limited to self + followed users only.
      if (!user || feedAllowedUserIds.size === 0) return [];
      const source =
        (globalCache.publicPostsWithProfiles && globalCache.publicPostsWithProfiles.length > 0
          ? globalCache.publicPostsWithProfiles
          : globalCache.publicPosts) || [];

      return source
        .filter((post: any) => post.created_at && post.created_at >= cutoffIsoForPublicFeeds())
        .filter((post: any) => post.user_id && feedAllowedUserIds.has(String(post.user_id)))
        .slice(0, 12)
        .map((post: any) => {
          const profile = post.profile || post.customer_profiles || null;
          const displayName = profile?.display_name?.trim();
          const username = displayName && displayName.length > 0 ? displayName : "Anonymous";
          const avatarUrl = profile?.avatar_url && profile.avatar_url !== '/placeholder.svg' 
            ? profile.avatar_url 
            : undefined;
          const firstName = username !== "Anonymous" ? username.split(' ')[0] : "Anonymous";
          return {
            id: String(post.id || post.user_id),
            username: firstName,
            avatar_url: avatarUrl,
            isGold: post.post_type === "gold",
            hasUnseenStory: true,
            expiresIn: hoursRemaining(post.created_at),
            isOnline: true,
            isLive: isUserLive(String(post.user_id)),
          } satisfies StoryUser;
        });
    };

    const refreshStoryUsers = async (allowEmpty: boolean = true) => {
      const cached = buildStoryUsersFromCache();
      if (cached.length > 0) { setStoryUsers(cached); return; }

      // Home feed story rail: only self + followed users.
      if (!user || feedAllowedUserIds.size === 0) {
        if (allowEmpty) setStoryUsers([]);
        return;
      }

      const { data: postsData, error } = await supabase
        .from("posts")
        .select("id, user_id, post_type, is_live, created_at")
        .eq("visibility", "public")
        .in("user_id", Array.from(feedAllowedUserIds))
        .gte("created_at", cutoffIsoForPublicFeeds())
        .order("created_at", { ascending: false })
        .limit(30);

      // On realtime refresh, never wipe the rail with an empty result —
      // it causes a visible flicker when posts/follows momentarily transition.
      if (error || !postsData?.length) {
        if (allowEmpty) setStoryUsers([]);
        return;
      }

      const userIds = [...new Set(postsData.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("customer_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      const story = postsData
        .filter((p) => p.user_id)
        .map((p) => {
          const displayName = profileMap.get(p.user_id)?.display_name?.trim();
          const firstName = displayName ? displayName.split(' ')[0] : "Anonymous";
          const avatarUrl = profileMap.get(p.user_id)?.avatar_url;
          return {
            id: String(p.id),
            username: firstName,
            avatar_url: avatarUrl && avatarUrl !== '/placeholder.svg' ? avatarUrl : undefined,
            isGold: p.post_type === "gold",
            hasUnseenStory: true,
            expiresIn: hoursRemaining(p.created_at),
            isOnline: true,
            isLive: isUserLive(String(p.user_id)),
          };
        })
        .slice(0, 12);

      setStoryUsers(story);
    };

    refreshStoryUsers();

    // Debounced realtime handler: coalesce bursts of post/follow events
    // into at most one refetch every 5s, after a 2s settle delay.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefetch = 0;
    const handleRealtimeChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const now = Date.now();
        if (now - lastRefetch < 5000) return;
        lastRefetch = now;
        fetchPosts().then(() => {
          const updated = buildStoryUsersFromCache();
          if (updated.length > 0) setStoryUsers(updated);
          else refreshStoryUsers(false); // never wipe rail on realtime refresh
        });
      }, 2000);
    };
    // StrictMode can replay this effect before async channel cleanup finishes.
    // A per-effect topic prevents Supabase from reusing a subscribed channel.
    const channelId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`immersive-posts-realtime-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, handleRealtimeChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_follows" }, handleRealtimeChange)
      .subscribe();

    // NOTE: Removed `visibilitychange` refetch — it caused a visible blink
    // when returning to the tab. Realtime + cache TTL keep data fresh.

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchPosts, user, feedAllowedUserIds]);

  // Handle story user click
  const handleStoryClick = (storyUser: StoryUser) => {
    const stream = getStreamForUser(storyUser.id);
    if (stream) {
      navigate(`/app/live/watch/${stream.id}`);
    } else {
      navigate("/app/city-view", { state: { city: userCity || storyUser.city || "Brisbane", highlightUserId: storyUser.id } });
    }
  };

  const handleCommentClick = (post: Post) => {
    setSelectedPost(post);
    setShowCommentModal(true);
  };

  const handleSubmitComment = async (data: { content: string; isPrivate: boolean; postId: string }) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("post_comments").insert({
        post_id: data.postId,
        user_id: user.id,
        content: data.content,
      });
      if (error) throw error;
      if (data.isPrivate) {
        toast.success("Private reply sent! They'll receive a special notification.");
      } else {
        toast.success("Comment posted!");
      }
      fetchPosts();
    } catch (error) {
      toast.error("Failed to post comment");
    }
  };

  const handlePound = async (postId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("post_pounds")
      .insert({ post_id: postId, user_id: user.id });
    if (error && !error.message.includes("duplicate")) {
      toast.error("Failed to pound post");
    } else if (!error) {
      recordTierEvent(user.id, "fist_bump", { post_id: postId });
    }
  };

  const handleCreatePost = async (data: { 
    content: string; 
    visibility: "private" | "public"; 
    isGold: boolean;
    isLive: boolean;
    imageUrl?: string;
    videoUrl?: string;
    sharedPostId?: string;
    taggedFriends?: { id: string; display_name: string; avatar_url?: string }[];
    venue?: string;
    location?: any;
    venueMentionIntent?: {
      venueId: string;
      venueName: string;
      mentionText: string;
      intent: VenuePostIntentType;
    };
  }) => {
    if (!user) return;

    const optimisticPost: Post = {
      id: `temp-${Date.now()}`,
      user_id: user.id,
      content: data.content,
      visibility: data.visibility,
      post_type: data.isGold ? "gold" : "standard",
      is_live: data.isLive,
      image_url: data.imageUrl,
      video_url: data.videoUrl,
      pounds_count: 0,
      comments_count: 0,
      share_count: 0,
      created_at: new Date().toISOString(),
      customer_profiles: currentUserProfile,
      shared_post_id: data.sharedPostId,
      venue_id: data.venue,
      venues: data.location?.name ? { name: data.location.name } : null,
      metadata: data.venueMentionIntent ? { venue_mention_intent: data.venueMentionIntent } : null,
      taggedUsers: data.taggedFriends?.map(f => ({ id: f.id, username: f.display_name, avatar_url: f.avatar_url })) || [],
    };

    setPosts(prev => [optimisticPost, ...prev]);

    const insertPayload: any = {
      user_id: user.id,
      content: data.content,
      visibility: data.visibility,
      post_type: data.isGold ? "gold" : "standard",
      is_live: data.isLive,
      image_url: data.imageUrl,
      video_url: data.videoUrl,
    };
    if (data.sharedPostId) insertPayload.shared_post_id = data.sharedPostId;
    if (data.venue) insertPayload.venue_id = data.venue;
    if (data.venueMentionIntent) insertPayload.metadata = { venue_mention_intent: data.venueMentionIntent };

    const { data: newPost, error } = await supabase.from("posts").insert(insertPayload).select().single();

    if (error) {
      toast.error("Failed to create post");
      setPosts(prev => prev.filter(p => p.id !== optimisticPost.id));
    } else {
      toast.success(data.isGold ? "⭐ Gold post published!" : data.isLive ? "🔴 You're now live!" : "Post published!");
      if (data.isGold) setCanUseGold(false);
      // Record tier event for venue-tagged post
      if (data.venue) {
        recordTierEvent(user.id, "venue_post", { venue_id: data.venue, post_id: newPost?.id });
      }
      setPosts(prev => prev.map(p => p.id === optimisticPost.id ? { 
        ...newPost, 
        customer_profiles: currentUserProfile,
        venues: optimisticPost.venues,
        taggedUsers: optimisticPost.taggedUsers,
      } : p));

      if (data.taggedFriends && data.taggedFriends.length > 0 && newPost) {
        const tags = data.taggedFriends.map(f => ({ post_id: newPost.id, user_id: f.id }));
        await (supabase as any).from("post_tagged_users").insert(tags).catch(() => {});
      }

      if (data.sharedPostId) {
        await (supabase as any).rpc("increment_share_count", { post_id: data.sharedPostId }).catch(() => {
          supabase.from("posts").select("share_count").eq("id", data.sharedPostId).maybeSingle().then(({ data: orig }) => {
            if (orig) {
              (supabase as any).from("posts").update({ share_count: (orig.share_count || 0) + 1 }).eq("id", data.sharedPostId);
            }
          });
        });
      }

      if (data.visibility === "public") {
        setTimeout(() => fetchPosts(), 500);
      }
    }

    setSharePost(null);
  };

  const handleSharePost = (post: Post) => {
    if (post.user_id === user?.id) {
      toast.info("You can't share your own post");
      return;
    }
    setSharePost({
      id: post.id,
      content: post.content,
      authorName: post.customer_profiles?.display_name || "Anonymous",
      imageUrl: post.image_url,
      videoUrl: post.video_url,
    });
    setShowCreateModal(true);
  };

  const handleSavePost = async (postId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("saved_posts").upsert(
        { user_id: user.id, post_id: postId },
        { onConflict: "user_id,post_id" }
      );
      if (error) throw error;
      toast.success("Post saved to your profile!", { icon: "🔖" });
    } catch (err: any) {
      if (err?.message?.includes("duplicate")) {
        toast.info("Post already saved");
      } else {
        toast.error("Failed to save post");
      }
    }
  };

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

  /* ─── HELPERS ─── */
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  // Snap-scroll: track current post index for video autoplay + nav visibility
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const lastSnapScrollY = useRef(0);
  const { mobileNavsVisible, setMobileNavsVisible: setContextMobileNavsVisible } = useMobileNavVisibility();
  const mobileOverlayRoot = typeof document !== "undefined" ? document.body : null;

  // Watch-time tracking
  const activePostForWatch = posts[currentPostIndex];
  useWatchTimeTracker(activePostForWatch?.id, user?.id);

  // Sync local scroll state to context so CustomerLayout can read it
  const setMobileNavsVisible = useCallback((v: boolean) => {
    setContextMobileNavsVisible(v);
  }, [setContextMobileNavsVisible]);

  // Lightweight scroll listener — only drives nav hide/show.
  // Active post index is now derived via IntersectionObserver below
  // (more accurate during inertial / snap scrolling).
  const handleSnapScroll = useCallback(() => {
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const delta = scrollTop - lastSnapScrollY.current;
    if (scrollTop <= 20) {
      setMobileNavsVisible(true);
    } else if (delta > 8) {
      setMobileNavsVisible(false);
    } else if (delta < -8) {
      setMobileNavsVisible(true);
    }
    lastSnapScrollY.current = scrollTop;
  }, [setMobileNavsVisible]);

  useEffect(() => {
    if (!isMobile) return;

    lastSnapScrollY.current = window.scrollY || 0;

    const onScroll = () => handleSnapScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      setMobileNavsVisible(true);
    };
  }, [handleSnapScroll, isMobile, setMobileNavsVisible]);

  // IntersectionObserver — pick the post whose center is closest to viewport center.
  // This is jank-free during snap/inertial scrolling and avoids math drift from
  // browser chrome collapse on mobile.
  useEffect(() => {
    if (!isMobile) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    if (posts.length === 0) return;

    const items = Array.from(
      document.querySelectorAll<HTMLDivElement>('[data-post-index]')
    );
    if (items.length === 0) return;

    const visibility = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.postIndex);
          visibility.set(idx, entry.intersectionRatio);
        }
        let bestIdx = 0;
        let bestRatio = -1;
        visibility.forEach((ratio, idx) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIdx = idx;
          }
        });
        if (bestRatio > 0.5) {
          setCurrentPostIndex((prev) => (prev === bestIdx ? prev : bestIdx));
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isMobile, posts.length]);


  const handleNavigateToSimilar = useCallback((postId: string) => {
    const targetIndex = posts.findIndex(p => p.id === postId);
    if (targetIndex === -1) return;
    const el = document.querySelector<HTMLElement>(`[data-post-index="${targetIndex}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: targetIndex * window.innerHeight, behavior: 'smooth' });
    }
    setCurrentPostIndex(targetIndex);
  }, [posts]);

  return (
    <div className="min-h-screen bg-black" style={{ backgroundColor: '#000' }}>
      
      {/* Header — on mobile, portal to body so animate-page-in transform doesn't break position:fixed */}
      {isMobile && mobileOverlayRoot ? createPortal(
        <Web3FeedHeader visible={mobileNavsVisible} onCreatePost={() => setShowCreateModal(true)} />,
        mobileOverlayRoot,
      ) : (
        <Web3FeedHeader visible={navsVisible} onCreatePost={() => setShowCreateModal(true)} />
      )}
      
      {isMobile ? (
        /* ─── MOBILE: Fullscreen Snap-Scroll Feed ─── */
        <>
          {/* Stories Section — portaled to body so position:fixed works correctly */}
          {mobileOverlayRoot && createPortal(
            <div
              className="fixed top-12 left-0 right-0 z-30 pb-2 bg-gradient-to-b from-black/90 via-black/60 to-transparent pointer-events-auto transition-transform duration-200 ease-out"
              style={{ transform: mobileNavsVisible ? 'translateY(0)' : 'translateY(-150%)' }}
            >
              <div className="pt-1">
                <HexagonalStoryRing users={liveStoryUsers} onUserClick={handleStoryClick} />
              </div>
            </div>,
            mobileOverlayRoot,
          )}

          {/* Page-scroll feed — browser chrome can collapse naturally */}
          {posts.length === 0 && loading ? (
            <div className="flex items-center justify-center min-h-screen">
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 border-4 border-cyan/30 rounded-full animate-ping" />
                  <div className="absolute inset-2 border-4 border-purple/50 rounded-full animate-pulse" />
                  <div className="absolute inset-4 border-4 border-pink/70 rounded-full animate-spin" />
                </div>
                <p className="text-white/80 animate-pulse">{t("feed:loading")}</p>
              </div>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 text-center min-h-screen">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/40 flex items-center justify-center mb-5">
                <Sparkles className="w-7 h-7 text-zinc-500" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-semibold text-zinc-300 mb-2">{t("feed:empty.nothing_here")}</h3>
              <p className="text-sm text-zinc-500 max-w-xs leading-relaxed mb-6">
                {t("feed:empty.follow_prompt")}
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("feed:empty.share_vibe")}
              </button>
            </div>
          ) : (
            <div
              className="immersive-feed-track relative w-full"
            >
              {posts.map((post, index) => {
                // Render only nearby posts; off-screen ones get content-visibility for perf.
                const distance = Math.abs(index - currentPostIndex);
                const isNear = distance <= 1;
                return (
                <div
                  key={post.id}
                  data-post-index={index}
                  className="immersive-post w-full h-dvh relative shrink-0"
                  style={
                    isNear
                      ? undefined
                      : { contentVisibility: "auto", containIntrinsicSize: "100dvh" }
                  }
                >
                  <ImmersivePostCard
                    id={post.id}
                    authorId={post.user_id}
                    authorName={post.customer_profiles?.display_name || "Anonymous"}
                    authorAvatar={post.customer_profiles?.avatar_url}
                    authorTier={post.author_tier}
                    isOnline={false}
                    isGold={post.post_type === "gold"}
                    isAR={false}
                    content={post.content}
                    sourceLanguage={post.source_language}
                    sourceConfidence={post.language_confidence}
                    imageUrl={post.image_url}
                    videoUrl={post.video_url}
                    venueName={post.venues?.name}
                    taggedUsers={post.taggedUsers}
                    poundsCount={post.pounds_count || 0}
                    commentsCount={post.comments_count || 0}
                    shareCount={post.share_count || 0}
                    createdAt={post.created_at}
                    expiresIn={hoursRemaining(post.created_at)}
                    onPound={() => handlePound(post.id)}
                    onComment={() => handleCommentClick(post)}
                    onShare={() => handleSharePost(post)}
                    onAuthorClick={() => navigate(`/app/user/${post.user_id}`)}
                    isActive={index === currentPostIndex}
                    allPosts={posts.map(p => ({ id: p.id, content: p.content, videoUrl: p.video_url, imageUrl: p.image_url }))}
                    onNavigateToSimilar={handleNavigateToSimilar}
                    currentUserId={user?.id}
                    onSavePost={handleSavePost}
                    onDeletePost={handleDeletePost}
                    onReportPost={handleReportPost}
                  />
                </div>
                );
              })}
            </div>
          )}

        </>
      ) : (
        /* ─── DESKTOP: Keep existing card layout ─── */
        <>
          {/* Stories Section */}
          <div className="pt-14 pb-2">
            <div className="lg:max-w-2xl lg:mx-auto">
              <HexagonalStoryRing users={liveStoryUsers} onUserClick={handleStoryClick} />
            </div>
          </div>

          {/* Scrollable Feed Content — centered column on lg+ */}
          <div className="lg:flex lg:justify-center">
          <div ref={containerRef} className="px-3 pb-24 w-full lg:max-w-2xl">
            <Separator className="bg-white/5 my-2" />

            {/* Composer Bar */}
            <div className="bg-white/[0.05] border border-white/[0.08] rounded-2xl p-3 backdrop-blur-md mb-4
                            ring-1 ring-inset ring-white/[0.04] shadow-inner">
              <div
                className="flex items-center gap-3 mb-2.5 cursor-pointer group"
                onClick={() => setShowCreateModal(true)}
              >
                <Avatar className="w-8 h-8 shrink-0 ring-1 ring-white/10 group-hover:ring-primary/40 transition-all duration-150">
                  {currentUserProfile?.avatar_url ? <AvatarImage src={currentUserProfile.avatar_url} /> : null}
                  <AvatarFallback className="bg-white/5 text-zinc-400"><User size={13} /></AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm text-zinc-500 group-hover:text-zinc-400 transition-colors duration-150">
                  {t("feed:composer.whats_the_vibe")}
                </span>
              </div>
              <div className="flex items-center gap-0.5 flex-wrap">
                <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 active:scale-95 h-8 px-2.5 rounded-lg gap-1.5 font-medium" onClick={() => setShowCreateModal(true)}>
                  <Plus size={13} /> {t("feed:composer.post")}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 active:scale-95 h-8 px-2.5 rounded-lg gap-1.5 font-medium" onClick={() => navigate("/app/live/host")}>
                  <Radio size={13} /> {t("feed:composer.go_live")}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 active:scale-95 h-8 px-2.5 rounded-lg gap-1.5 font-medium" onClick={() => setShowGoLiveRecorder(true)}>
                  <Video size={13} /> {t("feed:composer.record")}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-green-400 hover:bg-green-500/10 active:scale-95 h-8 px-2.5 rounded-lg gap-1.5 font-medium" onClick={() => {
                  if (currentCheckIn) { navigate(`/app/venue/${currentCheckIn.venueId}`); } else { toast.info(t("feed:not_checked_in")); }
                }}>
                  <CheckCircle size={13} /> {currentCheckIn ? currentCheckIn.venueName || t("feed:composer.venue") : t("feed:composer.check_in")}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 active:scale-95 h-8 px-2.5 rounded-lg gap-1.5 font-medium">
                  <Bot size={13} /> {t("feed:composer.ask_ai")}
                </Button>
                <div className="ml-auto flex gap-0.5">
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all active:scale-95"><Mic size={13} /></button>
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-all active:scale-95"><Wand2 size={13} /></button>
                </div>
              </div>
            </div>

            {/* Feed Cards with Deal Interleaving (desktop only) */}
            {posts.length === 0 && loading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border border-white/[0.07] rounded-2xl overflow-hidden mb-4 p-4">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full skeleton shrink-0" />
                      <div className="flex-1 space-y-2.5 pt-0.5">
                        <div className="h-3 w-28 skeleton rounded-full" />
                        <div className="h-2.5 w-16 skeleton rounded-full" />
                      </div>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="h-2.5 w-full skeleton rounded-full" />
                      <div className="h-2.5 w-4/5 skeleton rounded-full" />
                    </div>
                    <div className="w-full aspect-video rounded-xl skeleton" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="animate-fade-in">
                {feedDeals.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <Tag size={14} className="text-cyan-400" />
                      <span className="text-sm font-semibold text-white">{t("feed:empty.deals_near_you")}</span>
                    </div>
                    <div className="space-y-3">
                      {feedDeals.map((deal) => (
                        <DealCard key={deal.id} deal={deal} onRedeem={redeemDeal} onImpression={recordImpression} onSnooze={snoozeDeal} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/40 flex items-center justify-center mb-5">
                    <Sparkles className="w-7 h-7 text-zinc-500" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-300 mb-2">{t("feed:empty.nothing_here")}</h3>
                  <p className="text-sm text-zinc-500 max-w-xs leading-relaxed mb-6">
                    {t("feed:empty.follow_prompt")}
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {t("feed:empty.share_vibe")}
                  </button>
                </div>
              </div>
            ) : (
              posts.map((post, index) => {
                const elements: React.ReactNode[] = [];
                if (index === 2 && feedDeals[0]) {
                  elements.push(
                    <div key={`deal-${feedDeals[0].id}`} className="mb-4">
                      <DealCard deal={feedDeals[0]} onRedeem={redeemDeal} onImpression={recordImpression} onSnooze={snoozeDeal} />
                    </div>
                  );
                } else if (index > 2) {
                  const dealSlotIndex = Math.floor((index - 2) / 7);
                  const intervalBase = 6 + ((dealSlotIndex * 37) % 5);
                  if (dealSlotIndex > 0 && (index - 2) % intervalBase === 0 && feedDeals[dealSlotIndex]) {
                    const deal = feedDeals[dealSlotIndex];
                    elements.push(
                      <div key={`deal-${deal.id}`} className="mb-4">
                        <DealCard deal={deal} onRedeem={redeemDeal} onImpression={recordImpression} onSnooze={snoozeDeal} />
                      </div>
                    );
                  }
                }
                elements.push(
                  <article
                    key={post.id}
                    style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
                    className={[
                      "border rounded-2xl overflow-hidden backdrop-blur-sm mb-4",
                      "animate-fade-in-up opacity-0",
                      "transition-all duration-200 hover:border-white/[0.12]",
                      post.post_type === "gold"
                        ? "border-amber-500/25 bg-amber-500/[0.03]"
                        : "border-white/[0.07] bg-white/[0.03]",
                    ].join(" ")}
                  >
                    <div className="p-4 pb-2 flex items-start gap-3">
                      <Avatar
                        className={[
                          "w-10 h-10 cursor-pointer shrink-0 transition-transform duration-150 hover:scale-105",
                          post.post_type === "gold" ? "ring-2 ring-amber-500/50" : "ring-1 ring-white/10",
                        ].join(" ")}
                        onClick={() => navigate(`/app/user/${post.user_id}`)}
                      >
                        {post.customer_profiles?.avatar_url ? <AvatarImage src={post.customer_profiles.avatar_url} /> : null}
                        <AvatarFallback className="bg-white/5 text-zinc-400 text-sm font-medium">
                          {(post.customer_profiles?.display_name || "A")[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-white cursor-pointer hover:text-cyan-400 transition-colors" onClick={() => navigate(`/app/user/${post.user_id}`)}>
                            {post.customer_profiles?.display_name || "Anonymous"}
                          </span>
                          {post.author_tier && post.author_tier !== "member" && <TierBadge tier={post.author_tier as TierName} size="sm" showLabel={false} />}
                          {post.post_type === "gold" && <Star size={11} className="text-amber-400 fill-amber-400" />}
                          <span className="text-xs text-zinc-600 ml-auto tabular-nums">{timeAgo(post.created_at)}</span>
                        </div>
                        {post.venues?.name && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin size={9} className="text-cyan-400/80" />
                            <span className="text-[11px] text-cyan-400/80 font-medium">{post.venues.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-4 pb-2.5">
                      <ClampedCaption text={post.content} className="text-zinc-300/90" />
                    </div>
                    {post.taggedUsers && post.taggedUsers.length > 0 && (
                      <div className="px-4 pb-3">
                        <TaggedUsersDisplay users={post.taggedUsers} size="sm" maxDisplay={5} />
                      </div>
                    )}
                    {(post.image_url || post.video_url) && (
                      <MediaFrame imageUrl={post.image_url} videoUrl={post.video_url} aspectRatio="9/16" autoPlay={false} />
                    )}
                    <div className="px-4 py-3 flex items-center gap-4">
                      <button className="flex items-center gap-1.5 text-zinc-500 hover:text-amber-400 active:scale-90 transition-all" onClick={() => handlePound(post.id)}>
                        <img src={fistIcon} alt="pound" className="w-4.5 h-4.5 opacity-60" />
                        <span className="text-xs font-medium tabular-nums">{post.pounds_count || 0}</span>
                      </button>
                      <button className="flex items-center gap-1.5 text-zinc-500 hover:text-cyan-400 active:scale-90 transition-all" onClick={() => handleCommentClick(post)}>
                        <MessageCircle size={15} />
                        <span className="text-xs font-medium tabular-nums">{post.comments_count || 0}</span>
                      </button>
                      <button className="flex items-center gap-1.5 text-zinc-500 hover:text-purple-400 active:scale-90 transition-all" onClick={() => handleSavePost(post.id)}>
                        <Bookmark size={15} />
                      </button>
                      <button className="flex items-center gap-1.5 text-zinc-500 hover:text-green-400 active:scale-90 transition-all ml-auto" onClick={() => handleSharePost(post)}>
                        <Share2 size={15} />
                      </button>
                    </div>
                  </article>
                );
                return elements;
              })
            )}
          </div>
          </div>{/* end lg:flex wrapper */}
        </>
      )}

      {/* FloatingAIButton moved to CustomerLayout for persistence */}

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

      {/* Create Post Modal */}
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setSharePost(null); }}
        userAvatar={currentUserProfile?.avatar_url}
        userName={currentUserProfile?.display_name}
        canUseGold={canUseGold}
        onGoLive={() => {
          setShowCreateModal(false);
          navigate("/app/live/host");
        }}
        onSubmit={handleCreatePost}
        sharedPost={sharePost || undefined}
      />

      {/* Go Live Recorder */}
      <GoLiveRecorder
        isOpen={showGoLiveRecorder}
        onClose={() => setShowGoLiveRecorder(false)}
        userAvatar={currentUserProfile?.avatar_url}
        userName={currentUserProfile?.display_name}
        onComplete={(data) => {
          handleCreatePost({
            content: data.content,
            visibility: data.visibility,
            isGold: false,
            isLive: false,
            videoUrl: data.videoUrl,
          });
          setShowGoLiveRecorder(false);
        }}
      />

      {/* Comment Modal */}
      <CommentModal
        isOpen={showCommentModal}
        onClose={() => {
          setShowCommentModal(false);
          setSelectedPost(null);
        }}
        postId={selectedPost?.id || ""}
        postAuthorName={selectedPost?.customer_profiles?.display_name || "Anonymous"}
        postAuthorAvatar={selectedPost?.customer_profiles?.avatar_url}
        userAvatar={currentUserProfile?.avatar_url}
        userName={currentUserProfile?.display_name}
        onSubmitComment={handleSubmitComment}
      />

      {/* TEMP Debug Banner */}
      <LiveDebugBanner />

      {/* Mobile overlays are portaled to <body> so fixed positioning stays pinned to viewport */}
      {isMobile && mobileOverlayRoot && createPortal(
        <>
          {/* Floating Action Button — centered at bottom above nav, hides on scroll */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="fixed left-1/2 z-40 w-14 h-14 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 ease-out"
            style={{
              bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 12px)",
              transform: mobileNavsVisible
                ? "translateX(-50%) translateY(0)"
                : "translateX(-50%) translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 8rem))",
            }}
          >
            <Plus className="w-7 h-7 text-primary-foreground" />
          </button>

          <MobileBottomNav visible={mobileNavsVisible} />
        </>,
        mobileOverlayRoot,
      )}

      {!isMobile && <MobileBottomNav visible={navsVisible} />}
    </div>
  );
};

export default ImmersiveFeed;
