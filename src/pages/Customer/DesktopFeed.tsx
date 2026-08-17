import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MapPin, Radio, MessageCircle, Bookmark, Share2, Plus, Footprints,
  Video, CheckCircle, Bot, Send, ChevronRight, Star, TrendingUp, Gift,
  ArrowUpRight, ChevronUp, MoreHorizontal, User, Tag, SlidersHorizontal, UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useJVCoinWallet } from "@/hooks/useJVCoinWallet";
import { useCurrency } from "@/hooks/useCurrency";
import { useUserCheckIn } from "@/hooks/useUserCheckIn";
import { globalCache } from "@/hooks/useGlobalPrefetch";
import { toast } from "sonner";
import { recordTierEvent } from "@/hooks/useUserTier";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import fistIcon from "@/assets/fist-icon.png";
import CreatePostModal from "@/components/Customer/Feed/CreatePostModal";
import LocationVenueModal, { type LocationData } from "@/components/Customer/Feed/LocationVenueModal";
import DashboardHighlights, {
  type DashboardFeaturedEvent,
  type DashboardRecommendation,
} from "@/components/Customer/Feed/DashboardHighlights";
import GoLiveRecorder from "@/components/Customer/Feed/GoLiveRecorder";
import { OPEN_CUSTOMER_AI_EVENT } from "@/components/Customer/FloatingAIButton";
import CommentModal from "@/components/Customer/Feed/CommentModal";
import DesktopPostViewer from "@/components/Customer/Explore/DesktopPostViewer";
import LiveDebugBanner from "@/components/Customer/Live/LiveDebugBanner";
import TaggedUsersDisplay from "@/components/Customer/Feed/TaggedUsersDisplay";
import MediaFrame from "@/components/Customer/Feed/MediaFrame";
import ClampedCaption from "@/components/Customer/Feed/ClampedCaption";
import { useLivePresence } from "@/hooks/useLivePresence";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import DealCard from "@/components/Customer/Deals/DealCard";
import { useActiveAd } from "@/hooks/useActiveAd";
import type { VenuePostIntentType } from "@/utils/venueInterestSignals";
import { useTranslation } from 'react-i18next';
import { cutoffIsoForPublicFeeds } from "@/lib/postExpiry";
import "./desktop-feed.css";

/* ───────────────────── NAV CONFIG ───────────────────── */

/* ───────────────────── TYPES ───────────────────── */

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
  isLive?: boolean;
  hasUnseen?: boolean;
  tag?: string;
}

interface DashboardVenue {
  id?: string;
  name?: string;
  city?: string | null;
  image_url?: string | null;
  current_occupancy?: number | null;
}

type FeedTab = "for-you" | "following" | "nearby";
type FeedContentFilter = "all" | "media" | "venue" | "gold";

const feedTabs: { id: FeedTab; label: string }[] = [
  { id: "for-you", label: "For you" },
  { id: "following", label: "Following" },
  { id: "nearby", label: "Nearby" },
];

const feedContentFilters: { id: FeedContentFilter; label: string }[] = [
  { id: "all", label: "All posts" },
  { id: "media", label: "Media" },
  { id: "venue", label: "At venues" },
  { id: "gold", label: "Gold posts" },
];

/* ───────────────────── COMPONENT ───────────────────── */

const DesktopFeed = () => {
  const { t } = useTranslation('feed');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { balance } = useJVCoinWallet();
  const { formatCurrency, jvcToLocal } = useCurrency();
  const { currentCheckIn } = useUserCheckIn();
  const { deals: feedDeals, redeemDeal, recordImpression, snoozeDeal } = useActiveDeals('feed', 5);
  const { deals: sidebarDeals, redeemDeal: redeemSidebar, snoozeDeal: snoozeSidebar } = useActiveDeals('desktop_sidebar', 2);

  // Posts state - seed from global cache
  const [posts, setPosts] = useState<Post[]>(() =>
    (((globalCache.posts as Post[]) || []).filter((post) => post.created_at && post.created_at >= cutoffIsoForPublicFeeds()))
  );
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  // Set of user_ids whose content is allowed on the Home feed (self + followed). Empty until first fetch.
  const [feedAllowedUserIds, setFeedAllowedUserIds] = useState<Set<string>>(new Set());
  const [currentUserProfile, setCurrentUserProfile] = useState<{ display_name?: string; avatar_url?: string; city?: string | null } | null>(null);
  const { activeAd: sidebarAd, trackClick: sidebarTrackClick } = useActiveAd(currentUserProfile?.city || '', 'sidebar');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCheckInLocation, setShowCheckInLocation] = useState(false);
  const [showGoLiveRecorder, setShowGoLiveRecorder] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [viewerState, setViewerState] = useState<{ posts: Post[]; initialIndex: number } | null>(null);
  const [canUseGold, setCanUseGold] = useState(true);
  const [sharedPost, setSharedPost] = useState<{ id: string; content: string; authorName: string; imageUrl?: string; videoUrl?: string } | null>(null);
  const [savedHighlightIds, setSavedHighlightIds] = useState<string[]>([]);
  const [composerDraft, setComposerDraft] = useState("");
  const [createPostInitialContent, setCreatePostInitialContent] = useState("");
  const [checkInLocation, setCheckInLocation] = useState<LocationData | null>(null);
  const [activeFeedTab, setActiveFeedTab] = useState<FeedTab>("for-you");
  const [activeContentFilter, setActiveContentFilter] = useState<FeedContentFilter>("all");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Trending venues from cache
  const trendingVenues = (globalCache.hotVenues || []).slice(0, 3);
  const dashboardHighlights = useMemo(() => {
    const venues = trendingVenues as DashboardVenue[];
    const featuredVenue = venues[0];

    if (!featuredVenue?.name) {
      const featuredEventId = "reference-neon-skyline";
      return {
        featuredEvent: {
          id: featuredEventId,
          title: "Neon Skyline: A rooftop session",
          category: "Live music",
          timeLabel: "8:00 PM - 1:00 AM",
          date: { day: "13", month: "JUL" },
          venueName: "AER at Four Seasons, Worli",
          imageUrl: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=85",
          attendeeCount: 126,
          isSaved: savedHighlightIds.includes(featuredEventId),
          onSave: (event: DashboardFeaturedEvent) => {
            const alreadySaved = savedHighlightIds.includes(event.id);
            setSavedHighlightIds((currentIds) => (
              alreadySaved ? currentIds.filter((id) => id !== event.id) : [...currentIds, event.id]
            ));
            toast.success(alreadySaved ? "Removed from saved events" : "Saved for later");
          },
          onClick: () => navigate("/app/venue/reference"),
        } satisfies DashboardFeaturedEvent,
        recommendations: [
          {
            id: "reference-jazz-room",
            title: "The Jazz Room",
            dateLabel: "Fri, 21 Jul",
            distanceLabel: "1.4 km",
            imageUrl: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=600&q=85",
            onClick: () => navigate("/app/venue/reference"),
          },
          {
            id: "reference-garden-house-social",
            title: "Garden House Social",
            dateLabel: "Sat, 22 Jul",
            distanceLabel: "2.1 km",
            imageUrl: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=85",
            onClick: () => navigate("/app/venue/reference"),
          },
        ] satisfies DashboardRecommendation[],
      };
    }

    const date = new Date();
    const dateLabel = {
      day: String(date.getDate()).padStart(2, "0"),
      month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase(),
    };

    const featuredEventId = featuredVenue ? `venue-${featuredVenue.id || featuredVenue.name}` : "";
    const featuredEvent: DashboardFeaturedEvent | null = featuredVenue?.name
      ? {
        id: featuredEventId,
        title: featuredVenue.name,
        category: "Happening now",
        timeLabel: featuredVenue.current_occupancy ? `${featuredVenue.current_occupancy} people here` : "Explore tonight",
        date: dateLabel,
        venueName: featuredVenue.city || "Nearby venue",
        imageUrl: featuredVenue.image_url,
        attendeeCount: featuredVenue.current_occupancy ?? undefined,
        isSaved: savedHighlightIds.includes(featuredEventId),
        onSave: (event) => {
          const alreadySaved = savedHighlightIds.includes(event.id);
          setSavedHighlightIds((currentIds) => (
            alreadySaved ? currentIds.filter((id) => id !== event.id) : [...currentIds, event.id]
          ));
          toast.success(alreadySaved ? "Removed from saved events" : "Saved for later");
        },
        onClick: featuredVenue.id ? () => navigate(`/app/venue/${featuredVenue.id}`) : undefined,
      }
      : null;

    const recommendations: DashboardRecommendation[] = venues.slice(1, 3)
      .filter((venue) => Boolean(venue.name))
      .map((venue) => ({
        id: `venue-${venue.id || venue.name}`,
        title: venue.name || "Venue",
        dateLabel: venue.city || "Explore tonight",
        distanceLabel: venue.current_occupancy ? `${venue.current_occupancy} people here` : undefined,
        imageUrl: venue.image_url,
        onClick: venue.id ? () => navigate(`/app/venue/${venue.id}`) : undefined,
      }));

    return { featuredEvent, recommendations };
  }, [navigate, savedHighlightIds, trendingVenues]);
  const { streams: liveStreams, isUserLive, getStreamForUser } = useLivePresence();

  // Merge live streams INTO the story ring as additional bubbles (not a separate rail).
  // Home feed: only show live bubbles for hosts the user follows (or themselves).
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
        hasUnseen: true,
      }));
    return [...liveOnlyBubbles, ...base];
  }, [storyUsers, liveStreams, feedAllowedUserIds]);

  /* ─── FETCH USER PROFILE ─── */
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data: profile } = await supabase
        .from("customer_profiles")
        .select("display_name, avatar_url, city")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile) setCurrentUserProfile(profile);
    };
    fetchProfile();
  }, [user]);

  /* ─── FETCH POSTS ─── */
  const fetchPosts = useCallback(async () => {
    try {
      // Home feed must only show posts from self + followed users.
      let followingIds: string[] = [];
      if (user) {
        const { data: followData } = await supabase
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", user.id);
        followingIds = followData?.map((f) => f.following_id) || [];
      }
      const feedUserIds = user ? [user.id, ...followingIds] : [];
      const allowedSet = new Set(feedUserIds);
      // Only update state when membership actually changes — avoids an infinite
      // refetch loop (new Set ref → effect dep change → fetchPosts → new Set …).
      setFeedAllowedUserIds((prev) => {
        if (prev.size === allowedSet.size) {
          let same = true;
          for (const id of allowedSet) {
            if (!prev.has(id)) { same = false; break; }
          }
          if (same) return prev;
        }
        return allowedSet;
      });

      // Logged out OR following nobody → empty home feed (Explore/Top10/CityView/Public Profile remain public).
      if (feedUserIds.length === 0) {
        setPosts([]);
        globalCache.posts = [];
        globalCache.lastFetch.posts = Date.now();
        return;
      }

      const { data, error } = await supabase
        .from("posts")
        .select("id, user_id, venue_id, content, source_language, language_confidence, image_url, video_url, pounds_count, comments_count, share_count, created_at, visibility, post_type, is_live, shared_post_id, venues(name)")
        .in("user_id", feedUserIds)
        .gte("created_at", cutoffIsoForPublicFeeds())
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) { console.error(error); return; }

      // Hydrate profiles BEFORE first setPosts to avoid the "Anonymous → name" flicker.
      // If we already have a cached version of the posts with profiles attached,
      // render that immediately so headers don't flash.
      if (!data || data.length === 0) {
        setPosts([]);
        globalCache.posts = [];
        globalCache.lastFetch.posts = Date.now();
        return;
      }

      // If cache already has these posts with profiles, paint instantly.
      const cachedById = new Map<string, any>();
      (globalCache.posts || []).forEach((p: any) => {
        if (p && p.customer_profiles) cachedById.set(p.id, p);
      });
      if (cachedById.size > 0) {
        const merged = data.map((p: any) => cachedById.get(p.id) ? { ...p, ...cachedById.get(p.id) } : p);
        setPosts(merged as unknown as Post[]);
      }

      // Always run the profile/tier/tag fetch and update with the authoritative data.
      {
        const userIds = [...new Set(data.map(p => p.user_id))];
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

        // Fetch tagged users
        const postIds = data.map(p => p.id);
        const { data: taggedData } = await (supabase as any)
          .from("post_tagged_users")
          .select("post_id, user_id")
          .in("post_id", postIds);
        
        let taggedProfileMap = new Map<string, any>();
        if (taggedData && taggedData.length > 0) {
          const taggedUserIds = [...new Set(taggedData.map((t: any) => t.user_id))] as string[];
          const { data: taggedProfiles } = await supabase
            .from("customer_profiles")
            .select("user_id, display_name, avatar_url")
            .in("user_id", taggedUserIds);
          taggedProfileMap = new Map(taggedProfiles?.map(p => [p.user_id, p]) || []);
        }
        
        const tagsByPost = new Map<string, any[]>();
        if (taggedData) {
          for (const tag of taggedData) {
            const profile = taggedProfileMap.get(tag.user_id);
            const tagUser = { id: tag.user_id, username: profile?.display_name || "Anonymous", avatar_url: profile?.avatar_url };
            if (!tagsByPost.has(tag.post_id)) tagsByPost.set(tag.post_id, []);
            tagsByPost.get(tag.post_id)!.push(tagUser);
          }
        }
        
        const postsWithAll = data.map(post => ({
          ...post,
          customer_profiles: profileMap.get(post.user_id) || null,
          taggedUsers: tagsByPost.get(post.id) || [],
          author_tier: tierMap.get(post.user_id) || undefined,
        }));
        setPosts(postsWithAll as Post[]);
        globalCache.posts = postsWithAll;
        globalCache.lastFetch.posts = Date.now();
      }
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  useEffect(() => {
    fetchPosts();

    // Build story users from posts (use fetched posts as well as cache).
    // Home feed story rail must be limited to self + followed users only.
    const buildStoryUsers = (): StoryUser[] => {
      if (!user || feedAllowedUserIds.size === 0) return [];
      const source = (globalCache.publicPostsWithProfiles?.length ? globalCache.publicPostsWithProfiles : globalCache.publicPosts) || [];
      return source
        .filter((post: any) => post.user_id && feedAllowedUserIds.has(String(post.user_id)))
        .slice(0, 8)
        .map((post: any) => {
          const profile = post.profile || post.customer_profiles || null;
          const displayName = profile?.display_name?.trim();
          const firstName = displayName && displayName.length > 0 ? displayName.split(' ')[0] : "Anonymous";
          return {
            id: String(post.id || post.user_id),
            username: firstName,
            avatar_url: profile?.avatar_url && profile.avatar_url !== '/placeholder.svg' ? profile.avatar_url : undefined,
            isLive: false,
            hasUnseen: true,
            tag: post.post_type === "gold" ? "K" : undefined,
          } satisfies StoryUser;
        });
    };

    const cached = buildStoryUsers();
    setStoryUsers(cached);

    // Realtime with debouncing — listen to posts AND user_follows so new posts
    // (and newly followed users) appear live.
    let fetchTimeout: NodeJS.Timeout | null = null;
    const scheduleRefetch = () => {
      if (fetchTimeout) clearTimeout(fetchTimeout);
      fetchTimeout = setTimeout(() => {
        fetchPosts();
      }, 500);
    };

    // StrictMode can replay this effect before async channel cleanup finishes.
    // A per-effect topic prevents Supabase from reusing a subscribed channel.
    const channelId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`desktop-posts-realtime-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_follows" }, scheduleRefetch)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (fetchTimeout) clearTimeout(fetchTimeout);
    };
    // NOTE: do NOT include `feedAllowedUserIds` here — it is updated *inside*
    // fetchPosts, and re-running this effect on every change would tear down
    // and resubscribe the realtime channel in a loop, causing the story-rail
    // bubbles to flicker.
  }, [fetchPosts, user]);

  // Build story users from fetched posts - each public post gets its own bubble.
  // Only run AFTER profiles have been hydrated (avoids "Anonymous" flash that
  // immediately re-renders to the real name).
  useEffect(() => {
    if (posts.length === 0) return;
    const publicPosts = posts.filter(p => p.visibility === "public");
    const hasAnyProfile = publicPosts.some(p => (p as any).customer_profiles);
    if (!hasAnyProfile) return;
    const fromPosts: StoryUser[] = publicPosts.slice(0, 8).map((post) => {
      const profile = (post as any).customer_profiles;
      const displayName = profile?.display_name?.trim();
      const firstName = displayName ? displayName.split(' ')[0] : "Anonymous";
      return {
        id: post.id,
        username: firstName,
        avatar_url: profile?.avatar_url && profile.avatar_url !== '/placeholder.svg' ? profile.avatar_url : undefined,
        isLive: isUserLive(post.user_id),
        hasUnseen: true,
        tag: post.post_type === "gold" ? "K" : undefined,
      };
    });
    if (fromPosts.length > 0) {
      setStoryUsers(fromPosts);
    }
  }, [posts]);

  /* ─── HANDLERS ─── */
  const handlePound = async (postId: string) => {
    if (!user) return;
    const { error } = await supabase.from("post_pounds").insert({ post_id: postId, user_id: user.id });
    if (error && !error.message.includes("duplicate")) toast.error("Failed to pound post");
    else if (!error) recordTierEvent(user.id, "fist_bump", { post_id: postId });
  };

  const handleCommentClick = (post: Post) => {
    setSelectedPost(post);
    setShowCommentModal(true);
  };

  const handleSubmitComment = async (data: { content: string; isPrivate: boolean; postId: string }) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("post_comments").insert({ post_id: data.postId, user_id: user.id, content: data.content });
      if (error) throw error;
      toast.success(data.isPrivate ? "Private reply sent!" : "Comment posted!");
      fetchPosts();
    } catch { toast.error("Failed to post comment"); }
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
      id: `temp-${Date.now()}`, user_id: user.id, content: data.content, visibility: data.visibility,
      post_type: data.isGold ? "gold" : "standard", is_live: data.isLive, image_url: data.imageUrl,
      video_url: data.videoUrl, pounds_count: 0, comments_count: 0, share_count: 0, created_at: new Date().toISOString(),
      customer_profiles: currentUserProfile, shared_post_id: data.sharedPostId,
      venue_id: data.venue,
      venues: data.location?.name ? { name: data.location.name } : null,
      metadata: data.venueMentionIntent ? { venue_mention_intent: data.venueMentionIntent } : null,
      taggedUsers: data.taggedFriends?.map(f => ({ id: f.id, username: f.display_name, avatar_url: f.avatar_url })) || [],
    };
    setPosts(prev => [optimisticPost, ...prev]);

    const insertPayload: any = {
      user_id: user.id, content: data.content, visibility: data.visibility,
      post_type: data.isGold ? "gold" : "standard", is_live: data.isLive,
      image_url: data.imageUrl, video_url: data.videoUrl,
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
      if (data.venue) recordTierEvent(user.id, "venue_post", { venue_id: data.venue, post_id: newPost?.id });
      setPosts(prev => prev.map(p => p.id === optimisticPost.id ? { ...newPost, customer_profiles: currentUserProfile, venues: optimisticPost.venues, taggedUsers: optimisticPost.taggedUsers } : p));

      // Store tagged friends
      if (data.taggedFriends && data.taggedFriends.length > 0 && newPost) {
        const tags = data.taggedFriends.map(f => ({ post_id: newPost.id, user_id: f.id }));
        await (supabase as any).from("post_tagged_users").insert(tags).catch(() => {});
      }

      // Increment share_count on original post
      if (data.sharedPostId) {
        await (supabase as any).rpc("increment_share_count", { post_id: data.sharedPostId }).catch(() => {
          supabase.from("posts").select("share_count").eq("id", data.sharedPostId).maybeSingle().then(({ data: orig }) => {
            if (orig) {
              (supabase as any).from("posts").update({ share_count: ((orig as any).share_count || 0) + 1 }).eq("id", data.sharedPostId);
            }
          });
        });
      }

      // Refresh story ring for public posts
      if (data.visibility === "public") {
        setTimeout(() => fetchPosts(), 500);
      }
    }
  };

  const handleSavePost = async (postId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("saved_posts").upsert({ user_id: user.id, post_id: postId }, { onConflict: "user_id,post_id" });
      if (error) throw error;
      toast.success("Post saved!", { icon: "🔖" });
    } catch (err: any) {
      if (err?.message?.includes("duplicate")) toast.info("Already saved");
      else toast.error("Failed to save");
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user) return;
    const { error } = await supabase.from("posts").delete().eq("id", postId).eq("user_id", user.id);
    if (error) { toast.error("Failed to delete post"); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
    setViewerState(null);
    toast.success("Post deleted");
  };

  const handleReportPost = async (postId: string, reason: string) => {
    if (!user) return;
    await (supabase as any).from("post_reports").insert({ post_id: postId, user_id: user.id, reason });
    toast.success("Post reported. Thanks for keeping the community safe.");
  };

  const openCreatePost = (initialContent = "") => {
    setCreatePostInitialContent(initialContent);
    setShowCreateModal(true);
  };

  const closeCreatePost = () => {
    setShowCreateModal(false);
    setSharedPost(null);
    setCreatePostInitialContent("");
  };

  const handleCheckInLocation = (location: LocationData | null) => {
    setCheckInLocation(location);
    if (!location) return;

    if (location.type === "venue" && location.venueId) {
      navigate(`/app/venue/${location.venueId}`);
      return;
    }

    navigate("/app/maps");
  };

  const handleComposerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const initialContent = composerDraft.trim();
    if (!initialContent) return;
    openCreatePost(initialContent);
  };

  const visiblePosts = useMemo(() => {
    let nextPosts = posts;

    if (activeFeedTab === "following") {
      nextPosts = user ? nextPosts.filter((post) => post.user_id !== user.id) : [];
    }

    if (activeFeedTab === "nearby") {
      nextPosts = currentCheckIn
        ? nextPosts.filter((post) => post.venue_id === currentCheckIn.venueId)
        : [];
    }

    switch (activeContentFilter) {
      case "media":
        return nextPosts.filter((post) => post.image_url || post.video_url);
      case "venue":
        return nextPosts.filter((post) => post.venue_id);
      case "gold":
        return nextPosts.filter((post) => post.post_type === "gold");
      default:
        return nextPosts;
    }
  }, [activeContentFilter, activeFeedTab, currentCheckIn, posts, user]);

  const emptyFeedMessage = useMemo(() => {
    if (activeFeedTab === "nearby" && !currentCheckIn) {
      return "Check in to a venue to see posts from that venue.";
    }
    if (activeFeedTab === "following") {
      return "No posts from people you follow yet.";
    }
    if (activeContentFilter !== "all") {
      return "No posts match this filter yet.";
    }
    return "No posts yet. Be the first to post!";
  }, [activeContentFilter, activeFeedTab, currentCheckIn]);

  /* ─── HELPERS ─── */
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  /* ─── RENDER ─── */
  return (
    <div className="customer-feed-dashboard">
        {/* ─── CONTENT: CENTER + RIGHT ─── */}
        <main className="customer-feed-dashboard__main">
          {/* ═══════ CENTER COLUMN ═══════ */}
          <section className="customer-feed-dashboard__feed" aria-label="Feed">
            <div className="customer-feed-dashboard__feed-content">
              {/* Stories Row (live streams are merged in as bubbles with LIVE badge) */}
              <div className="customer-feed-stories" aria-label="Stories">
                {/* Add story button */}
                <button onClick={() => openCreatePost()} className="customer-feed-story customer-feed-story--add">
                  <div className="customer-feed-story__avatar">
                    <div>
                      <Plus size={20} />
                    </div>
                  </div>
                  <span className="customer-feed-story__name">Your story</span>
                </button>

                {liveStoryUsers.map((u) => (
                  <button
                    key={u.id}
                    className="customer-feed-story"
                    onClick={() => {
                      const stream = getStreamForUser(u.id);
                      if (stream) {
                        navigate(`/app/live/watch/${stream.id}`);
                      } else {
                        navigate(`/app/city-view?highlight=${u.id}`);
                      }
                    }}
                  >
                    <div className={`customer-feed-story__avatar${u.isLive ? " customer-feed-story__avatar--live" : ""}${u.hasUnseen ? " customer-feed-story__avatar--unseen" : ""}`}>
                      <div>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.username} />
                        ) : (
                          <div className="customer-feed-story__fallback">
                            <User size={20} />
                          </div>
                        )}
                      </div>
                      {u.isLive && (
                        <span className="customer-feed-story__live">LIVE</span>
                      )}
                      {u.tag && (
                        <span className="customer-feed-story__tag">{u.tag}</span>
                      )}
                    </div>
                    <span className="customer-feed-story__name">{u.username}</span>
                  </button>
                ))}
                <button className="customer-feed-story customer-feed-story--more" type="button">
                  <div className="customer-feed-story__avatar">
                    <MoreHorizontal size={18} />
                  </div>
                  <span className="customer-feed-story__name">More</span>
                </button>
              </div>

              {/* Composer Bar */}
              <div className="customer-feed-composer">
                <form className="customer-feed-composer__prompt" onSubmit={handleComposerSubmit}>
                  <Avatar>
                    {currentUserProfile?.avatar_url ? <AvatarImage src={currentUserProfile.avatar_url} /> : null}
                    <AvatarFallback><User size={14} /></AvatarFallback>
                  </Avatar>
                  <Input
                    value={composerDraft}
                    onChange={(event) => setComposerDraft(event.target.value)}
                    placeholder="What's the vibe?"
                    aria-label="What's the vibe?"
                    maxLength={120}
                    className="customer-feed-composer__input"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    className="customer-feed-composer__send"
                    disabled={!composerDraft.trim()}
                    aria-label="Continue to create post"
                    title="Continue to create post"
                  >
                    <Send size={15} />
                  </Button>
                </form>
                <div className="customer-feed-composer__actions">
                  <Button size="sm" variant="ghost" className="customer-feed-composer__action" onClick={() => openCreatePost(composerDraft.trim())}>
                    <Plus size={14} /> Post
                  </Button>
                  <Button size="sm" variant="ghost" className="customer-feed-composer__action" onClick={() => navigate("/app/live/host")}>
                    <Radio size={14} /> Go Live
                  </Button>
                  <Button size="sm" variant="ghost" className="customer-feed-composer__action" onClick={() => setShowGoLiveRecorder(true)}>
                    <Video size={14} /> Record
                  </Button>
                  <Button size="sm" variant="ghost" className="customer-feed-composer__action" onClick={() => {
                    if (currentCheckIn) {
                      navigate(`/app/venue/${currentCheckIn.venueId}`);
                    } else {
                      setShowCheckInLocation(true);
                    }
                  }}>
                    <CheckCircle size={14} /> {currentCheckIn ? currentCheckIn.venueName || "Venue" : "Check In"}
                  </Button>
                  <Button size="sm" variant="ghost" className="customer-feed-composer__action" onClick={() => window.dispatchEvent(new Event(OPEN_CUSTOMER_AI_EVENT))}>
                    <Bot size={14} /> Ask AI
                  </Button>
                  <div className="customer-feed-composer__utility">
                    <Link to="/app/runner/request" className="customer-feed-composer__runner" title="Request a JV Runner"><Footprints size={14} /></Link>
                  </div>
                </div>
              </div>

              <div className="customer-feed-toolbar">
                <div className="customer-feed-tabs" role="tablist" aria-label="Feed filters">
                  {feedTabs.map((tab) => (
                    <button
                      key={tab.id}
                      id={`customer-feed-tab-${tab.id}`}
                      className={`customer-feed-tabs__item${activeFeedTab === tab.id ? " customer-feed-tabs__item--active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={activeFeedTab === tab.id}
                      aria-controls="customer-feed-posts"
                      onClick={() => setActiveFeedTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="customer-feed-filter-wrap">
                  <button
                    className={`customer-feed-filter${activeContentFilter !== "all" ? " customer-feed-filter--active" : ""}`}
                    type="button"
                    aria-label={activeContentFilter === "all" ? "Feed filters" : `Feed filters: ${feedContentFilters.find((filter) => filter.id === activeContentFilter)?.label}`}
                    aria-expanded={isFilterMenuOpen}
                    aria-controls="customer-feed-filter-options"
                    onClick={() => setIsFilterMenuOpen((open) => !open)}
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    <span>Filters</span>
                  </button>
                  {isFilterMenuOpen && (
                    <div id="customer-feed-filter-options" className="customer-feed-filter-menu" role="group" aria-label="Filter posts by content">
                      {feedContentFilters.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          className={`customer-feed-filter-menu__item${activeContentFilter === filter.id ? " customer-feed-filter-menu__item--active" : ""}`}
                          aria-pressed={activeContentFilter === filter.id}
                          onClick={() => {
                            setActiveContentFilter(filter.id);
                            setIsFilterMenuOpen(false);
                          }}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <DashboardHighlights
                className="customer-feed-dashboard__highlights"
                featuredEvent={dashboardHighlights.featuredEvent}
                recommendations={dashboardHighlights.recommendations}
                onSeeAll={() => navigate("/app/venues")}
              />

              <div id="customer-feed-posts" role="tabpanel" aria-labelledby={`customer-feed-tab-${activeFeedTab}`}>
              {visiblePosts.length === 0 ? (
                <div>
                  {/* Deals Near You section for empty feeds */}
                  {posts.length === 0 && feedDeals.length > 0 && (
                    <div className="customer-feed-empty-deals mb-6">
                      <div className="customer-feed-section-heading flex items-center gap-2 mb-3 px-1">
                        <Tag size={14} className="text-cyan-400" />
                        <span className="text-sm font-semibold text-white">Deals Near You</span>
                      </div>
                      <div className="space-y-3">
                        {feedDeals.map((deal) => (
                          <DealCard key={deal.id} deal={deal} onRedeem={redeemDeal} onImpression={recordImpression} onSnooze={snoozeDeal} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="customer-feed-empty-state text-center py-20 text-zinc-500">{emptyFeedMessage}</div>
                </div>
              ) : (
                visiblePosts.map((post, index) => {
                  const elements: React.ReactNode[] = [];
                  // Guaranteed deal slot at position 2, then every 6-10 posts
                  if (index === 2 && feedDeals[0]) {
                    elements.push(
                      <div key={`deal-${feedDeals[0].id}`} className="customer-feed-deal-slot mb-4">
                        <DealCard deal={feedDeals[0]} onRedeem={redeemDeal} onImpression={recordImpression} onSnooze={snoozeDeal} />
                      </div>
                    );
                  } else if (index > 2) {
                    const dealSlotIndex = Math.floor((index - 2) / 7);
                    const intervalBase = 6 + ((dealSlotIndex * 37) % 5);
                    if (dealSlotIndex > 0 && (index - 2) % intervalBase === 0 && feedDeals[dealSlotIndex]) {
                      const deal = feedDeals[dealSlotIndex];
                      elements.push(
                        <div key={`deal-${deal.id}`} className="customer-feed-deal-slot mb-4">
                          <DealCard deal={deal} onRedeem={redeemDeal} onImpression={recordImpression} onSnooze={snoozeDeal} />
                        </div>
                      );
                    }
                  }
                  elements.push(
                    <article
                      key={post.id}
                      className="customer-feed-post bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm mb-6 cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button')) return;
                        const idx = visiblePosts.findIndex(p => p.id === post.id);
                        setViewerState({ posts: visiblePosts, initialIndex: idx >= 0 ? idx : 0 });
                      }}
                    >
                      <div className="customer-feed-post__header p-4 pb-2 flex items-start gap-3">
                        <Avatar className={`customer-feed-post__avatar w-10 h-10 cursor-pointer ${post.post_type === "gold" ? "ring-2 ring-amber-500/60" : ""}`} onClick={() => navigate(`/app/user/${post.user_id}`)}>
                          {post.customer_profiles?.avatar_url ? <AvatarImage src={post.customer_profiles.avatar_url} /> : null}
                          <AvatarFallback>{(post.customer_profiles?.display_name || "A")[0]}</AvatarFallback>
                        </Avatar>
                        <div className="customer-feed-post__identity flex-1 min-w-0">
                          <div className="customer-feed-post__name-row flex items-center gap-2">
                            <span className="customer-feed-post__author font-semibold text-sm cursor-pointer hover:underline" onClick={() => navigate(`/app/user/${post.user_id}`)}>
                              {post.customer_profiles?.display_name || "Anonymous"}
                            </span>
                            {post.author_tier && post.author_tier !== "member" && (
                              <TierBadge tier={post.author_tier as TierName} size="sm" showLabel={false} />
                            )}
                            {post.post_type === "gold" && <Star size={12} className="text-amber-400 fill-amber-400" />}
                            <span className="customer-feed-post__time text-xs text-zinc-600 ml-auto">{timeAgo(post.created_at)}</span>
                          </div>
                          {post.venues?.name && (
                            <div className="customer-feed-post__venue flex items-center gap-1 mt-0.5">
                              <MapPin size={10} className="text-cyan-400" />
                              <span className="text-[11px] text-cyan-400">{post.venues.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="customer-feed-post__body px-4 pb-2">
                        <ClampedCaption
                          text={post.content}
                          className="customer-feed-post__caption text-zinc-300"
                          contentId={post.id}
                          contentType="post"
                          sourceLang={post.source_language}
                          sourceConfidence={post.language_confidence}
                        />
                      </div>
                      {post.taggedUsers && post.taggedUsers.length > 0 && (
                        <div className="customer-feed-post__tags px-4 pb-3">
                          <TaggedUsersDisplay users={post.taggedUsers} size="sm" maxDisplay={5} />
                        </div>
                      )}
                      {(post.image_url || post.video_url) && (
                        <div className="customer-feed-post__media max-h-[75vh]">
                          <MediaFrame
                            imageUrl={post.image_url}
                            videoUrl={post.video_url}
                            aspectRatio="4/5"
                            autoPlay={false}
                          />
                        </div>
                      )}
                      <div className="customer-feed-post__actions p-4 flex items-center gap-5">
                        <button className="customer-feed-post__action flex items-center gap-1.5 text-zinc-400 hover:text-amber-400 transition-colors" onClick={() => handlePound(post.id)}>
                          <img src={fistIcon} alt="pound" className="w-5 h-5 opacity-60" />
                          <span className="text-xs font-medium">{post.pounds_count || 0}</span>
                        </button>
                        <button className="customer-feed-post__action flex items-center gap-1.5 text-zinc-400 hover:text-cyan-400 transition-colors" onClick={() => handleCommentClick(post)}>
                          <MessageCircle size={16} />
                          <span className="text-xs font-medium">{post.comments_count || 0}</span>
                        </button>
                        <button className="customer-feed-post__action flex items-center gap-1.5 text-zinc-400 hover:text-purple-400 transition-colors" onClick={() => handleSavePost(post.id)}>
                          <Bookmark size={16} />
                        </button>
                        <button className="customer-feed-post__action customer-feed-post__action--share flex items-center gap-1.5 text-zinc-400 hover:text-green-400 transition-colors ml-auto" onClick={() => {
                          if (post.user_id === user?.id) { toast.info("You can't share your own post"); return; }
                          setSharedPost({ id: post.id, content: post.content, authorName: post.customer_profiles?.display_name || "Anonymous", imageUrl: post.image_url, videoUrl: post.video_url });
                          openCreatePost();
                        }}>
                          <Share2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                  return elements;
                })
              )}
              </div>
            </div>
          </section>

          {/* ═══════ RIGHT SIDEBAR ═══════ */}
          <aside className="customer-feed-dashboard__rail" aria-label="Feed details">
            <div className="customer-feed-dashboard__rail-content">
                {/* Wallet Summary */}
                <Link to="/app/wallet" className="customer-feed-wallet block">
                  <div className="customer-feed-wallet__card bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm hover:bg-white/8 transition-colors">
                    <div className="customer-feed-rail-heading flex items-center justify-between mb-3">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{t("common:navigation.wallet")}</span>
                      <ChevronRight size={14} className="customer-feed-rail-heading__action text-zinc-600" />
                    </div>
                    <div className="customer-feed-wallet__balance text-2xl font-bold text-cyan-400 font-mono mb-2">
                      {formatCurrency(jvcToLocal(balance.jvc))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="customer-feed-wallet__reward bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
                        <Gift size={10} className="mr-1" /> {balance.rewards} JVC Rewards
                      </Badge>
                    </div>
                  </div>
                </Link>

                {/* City Teaser */}
                <button className="customer-feed-city-card relative rounded-2xl overflow-hidden h-28 cursor-pointer" type="button" onClick={() => navigate("/app/city-view")}>
                  <img
                    src="https://images.unsplash.com/photo-1514395462725-fb4566210144?w=400&h=200&fit=crop"
                    alt="City"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="customer-feed-city-card__content absolute bottom-3 left-3">
                    <div className="text-xs text-zinc-400">{t("common:navigation.explore")}</div>
                    <div className="text-sm font-semibold">Your City Tonight</div>
                  </div>
                </button>

                {/* Featured Tonight — sidebar ad (native feel) */}
                {sidebarAd && (
                  <>
                    <div
                      className="customer-feed-featured rounded-2xl overflow-hidden border border-white/10 bg-white/5 cursor-pointer group"
                      onClick={() => {
                        sidebarTrackClick();
                        if (sidebarAd.cta_url) window.open(sidebarAd.cta_url, "_blank", "noopener");
                      }}
                    >
                      {sidebarAd.media_url && (
                        <img
                          src={sidebarAd.media_url}
                          alt={sidebarAd.headline}
                          className="w-full h-32 object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      )}
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Star size={11} className="text-amber-400 fill-amber-400" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Featured Tonight</span>
                        </div>
                        <div className="font-medium text-sm leading-snug">{sidebarAd.headline}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin size={10} />
                          <span className="truncate">{sidebarAd.property_address}</span>
                        </div>
                        {sidebarAd.property_price && (
                          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px]">
                            ${sidebarAd.property_price.toLocaleString()}
                          </Badge>
                        )}
                        {sidebarAd.cta_text && (
                          <Button size="sm" className="w-full mt-1 h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                            {sidebarAd.cta_text} <ChevronRight size={12} />
                          </Button>
                        )}
                        <div className="text-[9px] text-muted-foreground/50 text-right">Promoted</div>
                      </div>
                    </div>
                    <div className="customer-feed-rail-divider" />
                  </>
                )}

                <div className="customer-feed-rail-divider" />

                {/* Deals Near You - Desktop Only (9b) */}
                {sidebarDeals.length > 0 && (
                  <section className="customer-feed-rail-section customer-feed-rail-section--deals">
                    <div className="customer-feed-rail-section__title flex items-center gap-2 mb-3">
                      <Tag size={14} className="text-cyan-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Deals Near You</span>
                    </div>
                    <div className="space-y-2">
                      {sidebarDeals.map((deal) => (
                        <DealCard key={deal.id} deal={deal} variant="compact" onRedeem={redeemSidebar} onSnooze={snoozeSidebar} />
                      ))}
                    </div>
                  </section>
                )}

                <div className="customer-feed-rail-divider" />

                {/* LIVE NOW */}
                {liveStreams.length > 0 && (
                  <section className="customer-feed-rail-section customer-feed-rail-section--live">
                    <div className="customer-feed-rail-section__title flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Live Now</span>
                    </div>
                    <div className="customer-feed-live-card bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                      <div className="customer-feed-live-card__body">
                        <span className="customer-feed-live-card__icon"><Radio aria-hidden="true" /></span>
                        <div className="customer-feed-live-card__copy">
                          <strong>{liveStreams[0].host_name || liveStreams[0].title || "Live now"}</strong>
                          <span>
                            <UsersRound aria-hidden="true" />
                            {liveStreams[0].viewer_count} {liveStreams[0].viewer_count === 1 ? "viewer" : "viewers"}
                          </span>
                        </div>
                        <button
                          className="customer-feed-live-card__join"
                          type="button"
                          onClick={() => navigate(`/app/live/watch/${liveStreams[0].id}`)}
                        >
                          Join <ArrowUpRight aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                <div className="customer-feed-rail-divider" />

                {/* TRENDING */}
                {trendingVenues.length > 1 && (
                  <section className="customer-feed-rail-section customer-feed-rail-section--trending">
                    <div className="customer-feed-rail-section__title flex items-center gap-2 mb-3">
                      <TrendingUp size={14} className="text-cyan-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider">{t("feed:discover.trending")}</span>
                    </div>
                    <div className="customer-feed-trending-list space-y-2">
                      {trendingVenues.map((v: any) => (
                        <div
                          key={v.id || v.name}
                          className="customer-feed-trending-item flex items-center gap-3 bg-white/5 rounded-xl p-2.5 hover:bg-white/8 transition-colors cursor-pointer"
                          onClick={() => v.id && navigate(`/app/venue/${v.id}`)}
                        >
                          {v.image_url && (
                            <img src={v.image_url} alt={v.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{v.name}</div>
                            <span className="text-[11px] text-zinc-500">{v.city}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="text-[11px] text-cyan-400 hover:bg-cyan-500/10 h-7 px-2.5">
                            JOIN
                          </Button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <div className="customer-feed-rail-divider" />

                <button
                  className="customer-feed-rail-chat"
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(OPEN_CUSTOMER_AI_EVENT))}
                >
                  <ChevronUp aria-hidden="true" />
                  <span>Chat</span>
                </button>
              </div>
          </aside>
        </main>

      {/* FloatingAIButton moved to CustomerLayout for persistence */}

      {/* Create Post Modal */}
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={closeCreatePost}
        userAvatar={currentUserProfile?.avatar_url}
        userName={currentUserProfile?.display_name}
        canUseGold={canUseGold}
        initialContent={createPostInitialContent}
        onGoLive={() => { closeCreatePost(); navigate("/app/live/host"); }}
        sharedPost={sharedPost || undefined}
        onSubmit={async (data) => {
          await handleCreatePost(data);
          setComposerDraft("");
          if (sharedPost) {
            // Increment share count on original post
            supabase.rpc("increment_field" as any, { row_id: sharedPost.id, table_name: "posts", field_name: "share_count" }).then(() => {});
          }
          setSharedPost(null);
        }}
      />

      <LocationVenueModal
        isOpen={showCheckInLocation}
        onClose={() => setShowCheckInLocation(false)}
        selectedLocation={checkInLocation}
        onSelectLocation={handleCheckInLocation}
      />

      {/* Go Live Recorder */}
      <GoLiveRecorder
        isOpen={showGoLiveRecorder}
        onClose={() => setShowGoLiveRecorder(false)}
        userAvatar={currentUserProfile?.avatar_url}
        userName={currentUserProfile?.display_name}
        onComplete={(data) => {
          handleCreatePost({ content: data.content, visibility: data.visibility, isGold: false, isLive: false, videoUrl: data.videoUrl });
          setShowGoLiveRecorder(false);
        }}
      />

      {/* Comment Modal */}
      <CommentModal
        isOpen={showCommentModal}
        onClose={() => { setShowCommentModal(false); setSelectedPost(null); }}
        postId={selectedPost?.id || ""}
        postAuthorName={selectedPost?.customer_profiles?.display_name || "Anonymous"}
        postAuthorAvatar={selectedPost?.customer_profiles?.avatar_url}
        userAvatar={currentUserProfile?.avatar_url}
        userName={currentUserProfile?.display_name}
        onSubmitComment={handleSubmitComment}
      />

      {/* Desktop Post Viewer */}
      {viewerState && (
        <DesktopPostViewer
          posts={viewerState.posts}
          initialIndex={viewerState.initialIndex}
          onClose={() => setViewerState(null)}
          onPound={handlePound}
          onComment={(post) => {
            setViewerState(null);
            handleCommentClick(post as Post);
          }}
          onShare={(post) => {
            if (post.user_id === user?.id) { toast.info("You can't share your own post"); return; }
            setSharedPost({ id: post.id, content: post.content, authorName: post.customer_profiles?.display_name || "Anonymous", imageUrl: post.image_url, videoUrl: post.video_url });
            setViewerState(null);
            openCreatePost();
          }}
          onSave={handleSavePost}
          onDelete={handleDeletePost}
          onReport={handleReportPost}
          currentUserId={user?.id}
        />
      )}

      <LiveDebugBanner />
    </div>
  );
};

export default DesktopFeed;
