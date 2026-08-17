import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Building2,
  ExternalLink,
  Globe2,
  Grid2X2,
  Link as LinkIcon,
  LogOut,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  User,
  Video,
} from "lucide-react";
import { cutoffIsoForPublicFeeds } from "@/lib/postExpiry";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import useCustomerDashboardPresentation from "@/hooks/useCustomerDashboardPresentation";
import { getCachedUserProfile, cacheUserProfile } from "@/hooks/useGlobalPrefetch";
import { useHideBodyScrollbar } from "@/hooks/useHideBodyScrollbar";
import { useFollowers, useFollowing } from "@/hooks/useFollowers";
import { useUserTier, getNextTierThreshold, type TierName } from "@/hooks/useUserTier";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DesktopPostViewer from "@/components/Customer/Explore/DesktopPostViewer";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import FollowersListModal from "@/components/Customer/FollowersListModal";
import TierBadge from "@/components/Tier/TierBadge";
import TierAvatarRing from "@/components/Tier/TierAvatarRing";
import { FoundersPassCard } from "@/components/FoundersPass/FoundersPassCard";
import { useFounderEntitlement } from "@/hooks/useFoundersPass";
import "./profile.css";

interface ProfileLink {
  id: string;
  heading: string;
  description: string;
  url: string;
}

interface UserPost {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  created_at: string;
  post_type?: string;
}

interface UserProfileData {
  display_name: string;
  bio: string;
  location: string;
  avatar_url: string;
  followers: number;
  following: number;
  posts: number;
}

interface ViewerPost {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
  customer_profiles: {
    display_name?: string;
    avatar_url?: string;
  } | null;
  venues: null;
}

const TIER_THRESHOLDS: Record<TierName, number> = {
  member: 0,
  bronze: 150,
  silver: 500,
  gold: 1000,
  diamond: 3000,
  platinum: 8000,
};

const ProfileNew = () => {
  useHideBodyScrollbar(true);

  const { t } = useTranslation("common");
  const isMobile = useIsMobile();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"posts" | "links">("posts");
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLink, setNewLink] = useState({ heading: "", description: "", url: "" });
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [viewerState, setViewerState] = useState<{ posts: ViewerPost[]; initialIndex: number } | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);

  const { followers, followerCount } = useFollowers(user?.id);
  const { following, followingCount } = useFollowing(user?.id);
  const {
    currentTier,
    jointScore,
    vibeScore,
    reachScore,
    impactLabel,
    geographicReach,
    tierAtRisk,
    loading: tierLoading,
  } = useUserTier();
  const { data: founderEntitlement, isLoading: founderLoading } = useFounderEntitlement("user");

  const [profile, setProfile] = useState<UserProfileData>(() => {
    if (user?.id) {
      const cached = getCachedUserProfile(user.id) as UserProfileData | undefined;
      if (cached) return cached;
    }

    const verifiedName = localStorage.getItem("jv_verified_name");
    const profilePicture = localStorage.getItem("jv_profile_picture");
    return {
      display_name: verifiedName || user?.email?.split("@")[0] || "User",
      bio: "Welcome to my profile!",
      location: "Earth",
      avatar_url: profilePicture || "",
      followers: 0,
      following: 0,
      posts: 0,
    };
  });

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error(error);
        return;
      }

      const verifiedName = localStorage.getItem("jv_verified_name");
      const profilePicture = localStorage.getItem("jv_profile_picture");
      const desktopBackground = data?.background_desktop;
      const mobileBackground = data?.background_mobile;
      const selectedBackground = data?.selected_background;

      if (window.innerWidth >= 768 && desktopBackground) {
        setBackgroundUrl(desktopBackground);
      } else if (window.innerWidth < 768 && mobileBackground) {
        setBackgroundUrl(mobileBackground);
      } else {
        setBackgroundUrl(desktopBackground || mobileBackground || selectedBackground || "");
      }

      const freshProfile: UserProfileData = {
        display_name: data?.display_name || verifiedName || user.email?.split("@")[0] || "User",
        bio: data?.bio || "Welcome to my profile!",
        location: data?.location || "Earth",
        avatar_url: data?.avatar_url || profilePicture || "",
        followers: data?.connection_count || 0,
        following: 0,
        posts: 0,
      };

      setProfile(freshProfile);
      cacheUserProfile(user.id, freshProfile);
    };

    void fetchProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchPosts = async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, content, image_url, video_url, created_at, post_type")
        .eq("user_id", user.id)
        .gte("created_at", cutoffIsoForPublicFeeds())
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        return;
      }

      setUserPosts(data || []);
    };

    void fetchPosts();

    const channel = supabase
      .channel(createRealtimeChannelTopic(`my-posts-realtime-${user.id}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `user_id=eq.${user.id}` },
        () => void fetchPosts(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    try {
      const savedLinks = localStorage.getItem("jv_profile_links");
      if (savedLinks) setLinks(JSON.parse(savedLinks) as ProfileLink[]);
    } catch {
      setLinks([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("jv_profile_links", JSON.stringify(links));
  }, [links]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleAddLink = () => {
    if (links.length >= 100 || !newLink.heading.trim() || !newLink.url.trim()) return;

    const url = newLink.url.trim();
    setLinks((currentLinks) => [
      ...currentLinks,
      {
        id: Date.now().toString(),
        heading: newLink.heading.trim(),
        description: newLink.description.trim(),
        url: url.startsWith("http") ? url : `https://${url}`,
      },
    ]);
    setNewLink({ heading: "", description: "", url: "" });
    setIsAddingLink(false);
  };

  const handleDeleteLink = (id: string) => {
    setLinks((currentLinks) => currentLinks.filter((link) => link.id !== id));
  };

  const openPost = (index: number) => {
    if (isMobile) {
      navigate("/app/feed/immersive");
      return;
    }

    setViewerState({
      initialIndex: index,
      posts: userPosts.map((post) => ({
        id: post.id,
        content: post.content,
        image_url: post.image_url,
        video_url: post.video_url,
        pounds_count: 0,
        comments_count: 0,
        created_at: post.created_at,
        user_id: user?.id || "",
        customer_profiles: {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        },
        venues: null,
      })),
    });
  };

  const username = profile.display_name.toLowerCase().replace(/\s+/g, "");
  const nextTierThreshold = getNextTierThreshold(currentTier);
  const currentTierThreshold = TIER_THRESHOLDS[currentTier];
  const progressPercent = nextTierThreshold
    ? Math.min(100, ((jointScore - currentTierThreshold) / (nextTierThreshold - currentTierThreshold)) * 100)
    : 100;
  const pointsToNext = nextTierThreshold ? Math.max(0, nextTierThreshold - jointScore) : 0;
  const geographicReachLabel = `${geographicReach.charAt(0).toUpperCase()}${geographicReach.slice(1)}`;
  const impactLabelText = `${impactLabel.charAt(0).toUpperCase()}${impactLabel.slice(1)}`;
  const hasVideoBackground = Boolean(backgroundUrl && /\.(mp4|webm|mov)(\?|$)/i.test(backgroundUrl));
  const tabs = [
    { id: "posts" as const, label: t("profile.posts", "Posts"), icon: Grid2X2 },
    { id: "links" as const, label: t("profile.links", "Links"), icon: LinkIcon },
  ];

  return (
    <div className={`customer-profile-page${isMobile ? " customer-profile-page--mobile" : ""}${isDashboardPresentation ? " customer-profile-page--dashboard-presentation" : ""}`}>
      {isMobile && !isDashboardPresentation && <Web3FeedHeader />}

      <main className="customer-profile-page__main" aria-labelledby="profile-name">
        <section className="customer-profile-page__hero">
          {backgroundUrl && (
            <div className="customer-profile-page__hero-media" aria-hidden="true">
              {hasVideoBackground ? (
                <video src={backgroundUrl} autoPlay loop muted playsInline />
              ) : (
                <img src={backgroundUrl} alt="" />
              )}
              <span />
            </div>
          )}

          <div className="customer-profile-page__identity">
            <button
              className="customer-profile-page__avatar-button"
              type="button"
              aria-label={t("profile.editProfile", "Edit profile")}
              title={t("profile.editProfile", "Edit profile")}
              onClick={() => navigate("/app/profile/edit")}
            >
              <TierAvatarRing tier={currentTier} isFounder={Boolean(founderEntitlement)} size="lg" className="customer-profile-page__avatar-ring">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" />
                ) : (
                  <User aria-hidden="true" />
                )}
              </TierAvatarRing>
              <span className="customer-profile-page__avatar-edit"><Plus aria-hidden="true" /></span>
            </button>

            <div className="customer-profile-page__identity-copy">
              <div className="customer-profile-page__name-row">
                <h1 id="profile-name">{profile.display_name}</h1>
                <TierBadge tier={currentTier} size="sm" isFounder={Boolean(founderEntitlement)} />
              </div>
              <p className="customer-profile-page__handle">@{username}</p>
              <p className="customer-profile-page__location"><MapPin aria-hidden="true" /> {profile.location}</p>
              <p className="customer-profile-page__bio"><Sparkles aria-hidden="true" /> {profile.bio}</p>
              <button className="customer-profile-page__sign-out" type="button" onClick={() => void handleSignOut()}>
                <LogOut aria-hidden="true" />
                {t("profile.sign_out", "Sign Out")}
              </button>
            </div>
          </div>

          <dl className="customer-profile-page__stats" aria-label="Profile statistics">
            <div>
              <dt>{t("profile.posts", "Posts")}</dt>
              <dd><button type="button" onClick={() => setActiveTab("posts")}>{userPosts.length}</button></dd>
            </div>
            <div>
              <dt>{t("profile.followers", "Followers")}</dt>
              <dd><button type="button" onClick={() => setShowFollowersModal(true)}>{followerCount}</button></dd>
            </div>
            <div>
              <dt>{t("navigation.following")}</dt>
              <dd><button type="button" onClick={() => setShowFollowingModal(true)}>{followingCount}</button></dd>
            </div>
          </dl>
        </section>

        <section className="customer-profile-page__score" aria-labelledby="profile-score-title">
          <div className="customer-profile-page__score-head">
            <div>
              <TierBadge tier={currentTier} size="sm" isFounder={Boolean(founderEntitlement)} />
              <strong id="profile-score-title">
                {tierLoading ? "..." : jointScore} <small>Joint Score</small>
              </strong>
            </div>
            <span className="customer-profile-page__reach"><Building2 aria-hidden="true" /> {geographicReachLabel}</span>
          </div>

          <div className="customer-profile-page__progress">
            <div>
              <span>Progress to next tier</span>
              <span>{nextTierThreshold ? `${pointsToNext} pts needed` : "Top tier reached"}</span>
            </div>
            <progress value={Math.max(0, progressPercent)} max="100">{progressPercent}%</progress>
          </div>

          <div className="customer-profile-page__score-metrics">
            <article>
              <p><Activity aria-hidden="true" /> Vibe score</p>
              <strong>{tierLoading ? "..." : vibeScore}</strong>
              <span>Real-world activity (60%)</span>
            </article>
            <article>
              <p><Globe2 aria-hidden="true" /> Reach score</p>
              <strong>{tierLoading ? "..." : reachScore}</strong>
              <span>Social influence (40%)</span>
            </article>
          </div>

          <footer>
            <span>Venue impact</span>
            <strong>{impactLabelText}</strong>
          </footer>
          {tierAtRisk && <p className="customer-profile-page__tier-warning">Stay active to retain your current tier.</p>}
        </section>

        {!isDashboardPresentation && (
          <div className="customer-profile-page__founders">
            <FoundersPassCard entitlement={founderEntitlement || null} passType="user" loading={founderLoading} />
          </div>
        )}

        <section className="customer-profile-page__content" aria-labelledby="profile-content-title">
          <h2 id="profile-content-title" className="customer-profile-page__sr-only">Profile content</h2>
          <div className="customer-profile-page__tabs" role="tablist" aria-label="Profile content">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  className={isActive ? "customer-profile-page__tab customer-profile-page__tab--active" : "customer-profile-page__tab"}
                  id={`${tab.id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${tab.id}-panel`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "posts" && (
              <motion.div
                key="posts"
                className="customer-profile-page__panel"
                id="posts-panel"
                role="tabpanel"
                aria-labelledby="posts-tab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {userPosts.length === 0 ? (
                  <div className="customer-profile-page__empty">
                    <span><Grid2X2 aria-hidden="true" /></span>
                    <h3>{t("profile.no_posts", "No posts yet")}</h3>
                    <p>{t("profile.share_first_post", "Share your first post!")}</p>
                  </div>
                ) : (
                  <div className="customer-profile-page__post-grid">
                    {userPosts.map((post, index) => (
                      <button key={post.id} className="customer-profile-page__post" type="button" onClick={() => openPost(index)}>
                        {post.image_url ? (
                          <img src={post.image_url} alt="" />
                        ) : post.video_url ? (
                          <span className="customer-profile-page__post-video"><Video aria-hidden="true" /></span>
                        ) : (
                          <span className="customer-profile-page__post-copy">{post.content}</span>
                        )}
                        {post.post_type === "gold" && <b>Gold</b>}
                        <span className="customer-profile-page__post-hover" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "links" && (
              <motion.div
                key="links"
                className="customer-profile-page__panel customer-profile-page__links-panel"
                id="links-panel"
                role="tabpanel"
                aria-labelledby="links-tab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {!isAddingLink && links.length < 100 && (
                  <button className="customer-profile-page__add-link" type="button" onClick={() => setIsAddingLink(true)}>
                    <Plus aria-hidden="true" />
                    {t("profile.add_link", "Add Link")} ({links.length}/100)
                  </button>
                )}

                {isAddingLink && (
                  <motion.div
                    className="customer-profile-page__link-form"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <Input
                      className="customer-profile-page__field"
                      placeholder={t("profile.heading_placeholder", "Heading")}
                      value={newLink.heading}
                      maxLength={100}
                      onChange={(event) => setNewLink({ ...newLink, heading: event.target.value })}
                    />
                    <Textarea
                      className="customer-profile-page__field customer-profile-page__field--textarea"
                      placeholder={t("profile.description_placeholder", "Description (optional)")}
                      value={newLink.description}
                      maxLength={200}
                      rows={2}
                      onChange={(event) => setNewLink({ ...newLink, description: event.target.value })}
                    />
                    <Input
                      className="customer-profile-page__field"
                      placeholder={t("profile.url_placeholder", "URL")}
                      value={newLink.url}
                      onChange={(event) => setNewLink({ ...newLink, url: event.target.value })}
                    />
                    <div className="customer-profile-page__form-actions">
                      <button
                        className="customer-profile-page__form-button customer-profile-page__form-button--secondary"
                        type="button"
                        onClick={() => {
                          setIsAddingLink(false);
                          setNewLink({ heading: "", description: "", url: "" });
                        }}
                      >
                        {t("app.cancel")}
                      </button>
                      <button
                        className="customer-profile-page__form-button customer-profile-page__form-button--primary"
                        type="button"
                        disabled={!newLink.heading.trim() || !newLink.url.trim()}
                        onClick={handleAddLink}
                      >
                        {t("profile.add_link", "Add Link")}
                      </button>
                    </div>
                  </motion.div>
                )}

                {links.length > 0 && (
                  <div className="customer-profile-page__link-list">
                    {links.map((link) => (
                      <article key={link.id} className="customer-profile-page__link-card">
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <span><LinkIcon aria-hidden="true" /></span>
                          <div>
                            <strong>{link.heading}</strong>
                            {link.description && <p>{link.description}</p>}
                          </div>
                        </a>
                        <div className="customer-profile-page__link-actions">
                          <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${link.heading}`} title={`Open ${link.heading}`}>
                            <ExternalLink aria-hidden="true" />
                          </a>
                          <button type="button" aria-label={`Delete ${link.heading}`} title={`Delete ${link.heading}`} onClick={() => handleDeleteLink(link.id)}>
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {links.length === 0 && !isAddingLink && (
                  <div className="customer-profile-page__empty">
                    <span><LinkIcon aria-hidden="true" /></span>
                    <h3>{t("profile.no_links", "No links yet")}</h3>
                    <p>{t("profile.add_links_hint", "Profile links will appear here.")}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <FollowersListModal
        isOpen={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
        title={t("profile.followers", "Followers")}
        users={followers}
      />

      <FollowersListModal
        isOpen={showFollowingModal}
        onClose={() => setShowFollowingModal(false)}
        title={t("navigation.following")}
        users={following}
      />

      {viewerState && !isMobile && (
        <DesktopPostViewer
          posts={viewerState.posts}
          initialIndex={viewerState.initialIndex}
          onClose={() => setViewerState(null)}
          onPound={async (postId) => {
            if (!user) return;
            await supabase.from("post_pounds").insert({ post_id: postId, user_id: user.id });
          }}
          onComment={() => {}}
          onShare={() => toast.info(t("profile_actions.share_coming_soon"))}
          onSave={async (postId) => {
            if (!user) return;
            await supabase.from("saved_posts").upsert({ user_id: user.id, post_id: postId }, { onConflict: "user_id,post_id" });
            toast.success(t("profile_actions.post_saved"));
          }}
          onDelete={async (postId) => {
            if (!user) return;
            await supabase.from("posts").delete().eq("id", postId).eq("user_id", user.id);
            setViewerState(null);
            toast.success(t("profile_actions.post_deleted"));
          }}
          onReport={() => {}}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
};

export default ProfileNew;
