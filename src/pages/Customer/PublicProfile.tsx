import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import {
  User, MapPin, MessageCircle, UserPlus, Users, ArrowLeft, Grid3X3
} from "lucide-react";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import { useHideBodyScrollbar } from "@/hooks/useHideBodyScrollbar";
import { useFollowers, useFollowing } from "@/hooks/useFollowers";
import FollowButton from "@/components/Customer/FollowButton";
import FistPoundIcon from "@/components/Customer/Feed/FistPoundIcon";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';
import { cutoffIsoForPublicFeeds } from "@/lib/postExpiry";

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
}

interface UserPost {
  id: string;
  image_url: string | null;
  video_url: string | null;
  content: string;
  created_at: string;
  pounds_count: number;
}

const PublicProfile = () => {
  const { t } = useTranslation('common');
  useHideBodyScrollbar(true);

  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState(false);
  const [friendRequestPending, setFriendRequestPending] = useState(false);
  const [userTier, setUserTier] = useState<TierName>("member");
  
  // Get follower/following counts for this user
  const { followerCount } = useFollowers(userId);
  const { followingCount } = useFollowing(userId);

  // Check if viewing own profile - redirect to /app/profile
  useEffect(() => {
    if (currentUser?.id === userId) {
      navigate('/app/profile', { replace: true });
    }
  }, [currentUser?.id, userId, navigate]);

  // Fetch profile and posts
  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      setLoading(true);
      
      // Fetch profile from customer_profiles, fallback to profiles table
      const [{ data: customerProfile }, { data: fallbackProfile }, { data: userPosts }] = await Promise.all([
        supabase
          .from("customer_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("posts")
          .select("id, image_url, video_url, content, created_at, pounds_count")
          .eq("user_id", userId)
          .eq("visibility", "public")
          .gte("created_at", cutoffIsoForPublicFeeds())
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      // Merge profile data
      const displayName = customerProfile?.display_name?.trim() || fallbackProfile?.full_name?.trim() || "User";
      const avatarUrl = (customerProfile?.avatar_url && customerProfile.avatar_url !== '/placeholder.svg')
        ? customerProfile.avatar_url
        : fallbackProfile?.avatar_url || null;

      setProfile({
        id: customerProfile?.id || '',
        user_id: userId,
        display_name: displayName,
        avatar_url: avatarUrl,
        bio: customerProfile?.bio || null,
        location: customerProfile?.location || null,
      });

      setPosts(userPosts || []);

      // Fetch tier
      const { data: tierRow } = await supabase
        .from("user_tiers")
        .select("current_tier")
        .eq("user_id", userId)
        .maybeSingle();
      if (tierRow) setUserTier((tierRow as any).current_tier as TierName);

      // Check friend status
      if (currentUser?.id) {
        const { data: connection } = await supabase
          .from("user_connections")
          .select("status")
          .or(`and(user_id.eq.${currentUser.id},connected_user_id.eq.${userId}),and(user_id.eq.${userId},connected_user_id.eq.${currentUser.id})`)
          .maybeSingle();

        if (connection) {
          if (connection.status === 'accepted') {
            setIsFriend(true);
          } else if (connection.status === 'pending') {
            setFriendRequestPending(true);
          }
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [userId, currentUser?.id]);

  const handleAddFriend = async () => {
    if (!currentUser?.id || !userId) return;

    try {
      const { error } = await supabase
        .from("user_connections")
        .insert({
          user_id: currentUser.id,
          connected_user_id: userId,
          status: 'pending',
        });

      if (error) {
        if (error.message.includes('duplicate')) {
          toast.info(t('public_profile.friend_request_already_sent'));
        } else {
          throw error;
        }
      } else {
        setFriendRequestPending(true);
        toast.success(t('public_profile.friend_request_sent'));
      }
    } catch (error) {
      toast.error(t('public_profile.friend_request_failed'));
    }
  };

  const handleMessage = () => {
    // Navigate to messages with this user
    navigate('/app/notifications', { state: { openChatWith: userId } });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black flex items-center justify-center">
        <p className="text-white/60">{t("common:messages.user_not_found")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <style>{`::-webkit-scrollbar { display: none; }`}</style>
      <Web3FeedHeader />
      
      <div className="max-w-2xl mx-auto px-4 pt-20 pb-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4 text-white/70 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("common:actions.back")}
        </Button>

        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center mb-8"
        >
          {/* Avatar */}
          <div className="relative mb-4">
            <Avatar className="w-28 h-28 ring-4 ring-cyan-500/30">
              <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-cyan-600 to-purple-600 text-white text-3xl">
                {profile.display_name?.[0]?.toUpperCase() || <User className="w-12 h-12" />}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Name and Handle */}
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{profile.display_name}</h1>
            {userTier !== "member" && <TierBadge tier={userTier} size="sm" />}
          </div>
          <p className="text-white/50 text-sm mb-2">@{profile.display_name?.toLowerCase().replace(/\s+/g, '')}</p>
          
          {/* Location */}
          {profile.location && (
            <div className="flex items-center gap-1 text-white/50 text-sm mb-4">
              <MapPin className="w-3 h-3" />
              <span>{profile.location}</span>
            </div>
          )}

          {/* Bio */}
          {profile.bio && (
            <p className="text-white/70 text-center max-w-md mb-6">{profile.bio}</p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-8 mb-6">
            <div className="text-center">
              <p className="text-xl font-bold text-white">{posts.length}</p>
              <p className="text-xs text-white/50">{t("common:profile.posts")}</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">{followerCount}</p>
              <p className="text-xs text-white/50">{t("common:profile.followers")}</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">{followingCount}</p>
              <p className="text-xs text-white/50">{t("common:navigation.following")}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 w-full max-w-sm">
            {/* Follow Button */}
            <FollowButton 
              targetUserId={userId!} 
              className="flex-1"
            />
            
            {/* Friend Button */}
            <Button
              variant={isFriend ? "secondary" : "outline"}
              onClick={handleAddFriend}
              disabled={isFriend || friendRequestPending}
              className={`flex-1 ${
                isFriend 
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                  : friendRequestPending
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  : "border-white/20 text-white hover:bg-white/10"
              }`}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {isFriend ? t("common:profile.friends") : friendRequestPending ? t("common:status.pending") : t("common:profile.add_friend")}
            </Button>
            
            {/* Message Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleMessage}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
          </div>
        </motion.div>

        {/* Posts Grid Section Header */}
        <div className="border-t border-white/10 pt-6">
          <div className="flex items-center justify-center gap-2 mb-4 text-white/70">
            <Grid3X3 className="w-4 h-4" />
            <span className="text-sm font-medium">{t("common:profile.posts")}</span>
          </div>
        </div>
      </div>

      {/* Posts Grid - Wider on Desktop */}
      <div className="w-full md:max-w-[90%] mx-auto px-4 pb-20">
        {posts.length > 0 ? (
          <div className="grid grid-cols-3 gap-1 md:gap-3">
            {posts.map((post) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="relative aspect-square bg-zinc-800 rounded-sm md:rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => navigate(`/app/post/${post.id}`)}
              >
                {post.video_url ? (
                  <video
                    src={post.video_url}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : post.image_url ? (
                  <img
                    src={post.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-xs p-2 text-center">
                    {post.content.substring(0, 50)}...
                  </div>
                )}
                
                {/* Dark Gradient Overlay with Pounds Count */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white">
                    <FistPoundIcon className="w-4 h-4" filled />
                    <span className="text-xs font-medium">{post.pounds_count || 0}</span>
                  </div>
                </div>
                
                {/* Hover Effect */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/50">{t("feed:empty.no_posts_yet")}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProfile;
