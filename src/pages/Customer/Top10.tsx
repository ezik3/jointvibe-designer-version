import { useState, useEffect } from "react";
import {
  ArrowRight,
  Building2,
  Flag,
  Globe2,
  Image,
  Landmark,
  Map as MapIcon,
  MapPin,
  MapPinned,
  Navigation,
  Play,
  Search,
  Star,
  Trophy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import FilterDropdown from "@/components/ui/FilterDropdown";
import { supabase } from "@/integrations/supabase/client";
import { fetchRegisteredLocations, getLocationsByCountry } from "@/utils/locationData";
import { useIsMobile } from "@/hooks/use-mobile";
import useCustomerDashboardPresentation from "@/hooks/useCustomerDashboardPresentation";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { recordTierEvent } from "@/hooks/useUserTier";
import DesktopPostViewer from "@/components/Customer/Explore/DesktopPostViewer";
import ExploreGridCard from "@/components/Customer/Explore/ExploreGridCard";
import { performanceCache, CACHE_KEYS } from "@/utils/cache";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { cutoffIsoForPublicFeeds } from "@/lib/postExpiry";
import "./top10.css";

const venueTypes = ["All", "Nightclubs", "Bars/Pubs", "Restaurants/Cafes", "Events"];
type DiscoveryLevel = "suburb" | "local" | "regional" | "state" | "national" | "international";

interface TopUser {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
  total_pounds: number;
}

interface TopVenue {
  id: string;
  name: string;
  image_url: string | null;
  city: string | null;
  venue_type: string | null;
  vibe_score: number | null;
}

interface RankingViewerPost {
  id: string;
  user_id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count: number;
  created_at: string;
  customer_profiles: {
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  venues: { name: string } | null;
}

const DISCOVERY_LEVELS: { value: DiscoveryLevel; label: string; icon: typeof MapPin }[] = [
  { value: "suburb", label: "Suburb / Town", icon: MapPin },
  { value: "local", label: "Local", icon: Navigation },
  { value: "regional", label: "Metro / Regional", icon: MapIcon },
  { value: "state", label: "State", icon: Landmark },
  { value: "national", label: "National", icon: Flag },
  { value: "international", label: "International", icon: Globe2 },
];

const Top10 = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isDashboardPresentation = useCustomerDashboardPresentation();
  const navigate = useNavigate();
  const [discoveryLevel, setDiscoveryLevel] = useState<DiscoveryLevel>("suburb");
  const [selectedCountry, setSelectedCountry] = useState("All Countries");
  const [selectedCity, setSelectedCity] = useState("All Locations");
  const [selectedType, setSelectedType] = useState("All");
  const [contentType, setContentType] = useState<"videos" | "pics">("videos");
  const [viewMode, setViewMode] = useState<"users" | "venues">("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topVenues, setTopVenues] = useState<TopVenue[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [locations, setLocations] = useState<{ country: string; location: string }[]>([]);
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);
  const [userPostImages, setUserPostImages] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [showTop100, setShowTop100] = useState(false);
  const [top100Users, setTop100Users] = useState<TopUser[]>([]);
  const [viewerState, setViewerState] = useState<{ posts: RankingViewerPost[]; initialIndex: number } | null>(null);

  // Open viewer instantly with cached data, then hydrate real posts in the background
  const handleRankCardClick = async (clickedUser: TopUser, clickedIndex: number) => {
    if (isMobile) return;

    // 1) Build immediate placeholder posts from cached user data — open viewer NOW
    const placeholderPosts: RankingViewerPost[] = filteredUsers.map((rankedUser) => {
      const postImage = userPostImages.get(rankedUser.user_id);
      return {
        id: rankedUser.id, user_id: rankedUser.user_id, content: "", pounds_count: rankedUser.total_pounds, comments_count: 0,
        created_at: new Date().toISOString(), venues: null,
        image_url: postImage && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(postImage) ? postImage : undefined,
        video_url: postImage && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(postImage) ? postImage : undefined,
        customer_profiles: { display_name: rankedUser.display_name, avatar_url: rankedUser.avatar_url },
      };
    });
    setViewerState({ posts: placeholderPosts, initialIndex: clickedIndex });

    // 2) Hydrate with real posts in the background
    const allUserIds = filteredUsers.map(u => u.user_id).filter(Boolean);
    const { data: allPostsData } = await supabase
      .from("posts")
      .select("id, user_id, content, image_url, video_url, pounds_count, comments_count, created_at, visibility, venues(name)")
      .in("user_id", allUserIds)
      .eq("visibility", "public")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("pounds_count", { ascending: false });

    const bestPostByUser = new Map<string, RankingViewerPost>();
    allPostsData?.forEach((post) => {
      if (!bestPostByUser.has(post.user_id)) {
        bestPostByUser.set(post.user_id, post as unknown as RankingViewerPost);
      }
    });

    const viewerPosts: RankingViewerPost[] = filteredUsers.map((rankedUser, index) => {
      const post = bestPostByUser.get(rankedUser.user_id);
      if (post) {
        return { ...post, customer_profiles: { display_name: rankedUser.display_name, avatar_url: rankedUser.avatar_url } };
      }
      return placeholderPosts[index];
    });

    setViewerState(prev => prev ? { ...prev, posts: viewerPosts } : { posts: viewerPosts, initialIndex: clickedIndex });
  };

  const handlePound = async (postId: string) => {
    if (!user) return;
    const { error } = await supabase.from("post_pounds").insert({ post_id: postId, user_id: user.id });
    if (error && !error.message.includes("duplicate")) toast.error("Failed to pound post");
    else if (!error) recordTierEvent(user.id, "fist_bump", { post_id: postId });
  };

  const handleSavePost = async (postId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("saved_posts").upsert({ user_id: user.id, post_id: postId }, { onConflict: "user_id,post_id" });
      if (error) throw error;
      toast.success("Post saved!", { icon: "🔖" });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("duplicate")) toast.info("Already saved");
      else toast.error("Failed to save");
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user) return;
    await supabase.from("posts").delete().eq("id", postId).eq("user_id", user.id);
    setViewerState(null);
    toast.success("Post deleted");
  };

  const handleReportPost = async (postId: string, reason: string) => {
    if (!user) return;
    await supabase.from("post_reports").insert({ post_id: postId, reporter_id: user.id, reason });
    toast.success("Post reported");
  };

  // Fetch registered locations and data in parallel
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      
      // Check performance cache first for instant display (60 second TTL)
      const cachedUsers = performanceCache.get<TopUser[]>(CACHE_KEYS.TOP10_USERS);
      const cachedVenues = performanceCache.get<TopVenue[]>(CACHE_KEYS.TOP10_VENUES);
      const cachedPostImages = performanceCache.get<Map<string, string>>(CACHE_KEYS.TOP10_POST_IMAGES);
      
      if (cachedUsers) {
        setTopUsers(cachedUsers);
      }
      if (cachedVenues) {
        setTopVenues(cachedVenues);
      }
      if (cachedPostImages) {
        setUserPostImages(cachedPostImages);
      }
      
      // If all data is cached and still valid, skip fetching
      const allCached = cachedUsers && cachedVenues && cachedPostImages;
      if (allCached) {
        setLoading(false);
        // Still fetch locations in background (they change less frequently)
        fetchRegisteredLocations().then(locationsResult => {
          setCountries(locationsResult.countries);
          setLocations(locationsResult.locations);
          setAvailableLocations(getLocationsByCountry(locationsResult.locations, "All Countries"));
        });
        return;
      }

      // Fetch fresh data in parallel
      const [locationsResult, usersResult, venuesResult] = await Promise.all([
        fetchRegisteredLocations(),
        supabase
          .from('top_users_by_pounds')
          .select('*')
          .order('total_pounds', { ascending: false })
          .limit(10),
        supabase
          .from('venues')
          .select('id, name, image_url, city, venue_type, vibe_score')
          .eq('approval_status', 'approved')
          .eq('venue_status', 'live')
          .order('vibe_score', { ascending: false })
          .limit(10),
      ]);

      // Update locations
      setCountries(locationsResult.countries);
      setLocations(locationsResult.locations);
      setAvailableLocations(getLocationsByCountry(locationsResult.locations, "All Countries"));

      // Update users from optimized view
      if (usersResult.data) {
        const users = usersResult.data.map(u => ({
          id: u.id || '',
          user_id: u.user_id || '',
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          location: u.location,
          total_pounds: u.total_pounds || 0,
        }));
        setTopUsers(users);
        
        // Update performance cache (60 seconds TTL)
        performanceCache.set(CACHE_KEYS.TOP10_USERS, users, 60000);

        // Fetch post images for top users in parallel with profiles
        const userIds = users.map(u => u.user_id).filter(Boolean);
        if (userIds.length > 0) {
          // Parallel query for posts and profiles
          const [postsResult, profilesResult] = await Promise.all([
            supabase
              .from('posts')
              .select('user_id, image_url, video_url, pounds_count')
              .in('user_id', userIds)
              .eq('visibility', 'public')
              .gte('created_at', cutoffIsoForPublicFeeds())
              .order('pounds_count', { ascending: false }),
            supabase
              .from('customer_profiles')
              .select('user_id, display_name, avatar_url')
              .in('user_id', userIds)
          ]);

          if (postsResult.data) {
            const recentUserIds = new Set(postsResult.data.map(post => post.user_id));
            const activeUsers = users.filter((u) => recentUserIds.has(u.user_id));
            const imageMap = new Map<string, string>();
            // Get the best post image for each user (highest pounds)
            postsResult.data.forEach(post => {
              if (!imageMap.has(post.user_id)) {
                const mediaUrl = post.image_url || post.video_url;
                if (mediaUrl && mediaUrl.length > 0) {
                  imageMap.set(post.user_id, mediaUrl);
                }
              }
            });
            setTopUsers(activeUsers);
            performanceCache.set(CACHE_KEYS.TOP10_USERS, activeUsers, 60000);
            setUserPostImages(imageMap);
            performanceCache.set(CACHE_KEYS.TOP10_POST_IMAGES, imageMap, 60000);
          }
        }
      }

      // Update venues
      if (venuesResult.data) {
        setTopVenues(venuesResult.data);
        performanceCache.set(CACHE_KEYS.TOP10_VENUES, venuesResult.data, 60000);
      }
      
      setLoading(false);
    };

    loadAll();
  }, []);

  // Fetch Top 100 when toggled
  useEffect(() => {
    if (showTop100 && top100Users.length === 0) {
      const fetchTop100 = async () => {
        const { data } = await supabase
          .from('top_users_by_pounds')
          .select('*')
          .order('total_pounds', { ascending: false })
          .limit(100);

        if (data) {
          const userIds = data.map(u => u.user_id).filter(Boolean);
          const { data: recentPosts } = await supabase
            .from('posts')
            .select('user_id')
            .in('user_id', userIds)
            .eq('visibility', 'public')
            .gte('created_at', cutoffIsoForPublicFeeds());

          const recentUserIds = new Set((recentPosts || []).map((post) => post.user_id));
          setTop100Users(data.filter(u => recentUserIds.has(u.user_id)).map(u => ({
            id: u.id || '',
            user_id: u.user_id || '',
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            location: u.location,
            total_pounds: u.total_pounds || 0,
          })));
        }
      };
      fetchTop100();
    }
  }, [showTop100, top100Users.length]);

  // Update available locations when country changes
  useEffect(() => {
    const locs = getLocationsByCountry(locations, selectedCountry);
    setAvailableLocations(locs);
    if (selectedCity !== "All Locations" && !locs.includes(selectedCity)) {
      setSelectedCity("All Locations");
    }
  }, [selectedCountry, selectedCity, locations]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (...values: Array<string | null | undefined>) =>
    !normalizedSearchQuery || values.some((value) => value?.toLowerCase().includes(normalizedSearchQuery));

  // Filter users and venues
  const filteredUsers = (showTop100 ? top100Users : topUsers).filter(user => {
    const userLocation = user.location || '';
    const [userCity, userCountry] = userLocation.split(',').map(s => s.trim());
    
    if (selectedCountry !== "All Countries" && userCountry !== selectedCountry) return false;
    if (selectedCity !== "All Locations" && userCity !== selectedCity) return false;
    return matchesSearch(user.display_name, userLocation);
  });

  const filteredVenues = topVenues.filter(venue => {
    const matchesLocation = selectedCity === "All Locations" || venue.city === selectedCity;
    const matchesType = selectedType === "All" || venue.venue_type?.toLowerCase().includes(selectedType.toLowerCase());
    return matchesLocation && matchesType && matchesSearch(venue.name, venue.city, venue.venue_type);
  });

  const getDefaultImage = (type: string | null) => {
    switch (type?.toLowerCase()) {
      case 'nightclub':
      case 'nightclubs':
        return "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600";
      case 'bar':
      case 'bars':
        return "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600";
      case 'restaurant':
      case 'restaurants':
        return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600";
      default:
        return "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600";
    }
  };

  // Dropdown options
  const countryOptions = [
    { value: "All Countries", label: "All Countries", icon: <Globe2 className="w-4 h-4" /> },
    ...countries.map(c => ({ value: c, label: c }))
  ];

  const locationOptions = [
    { value: "All Locations", label: "All Locations", icon: <MapPinned className="w-4 h-4" /> },
    ...availableLocations.map(loc => ({ value: loc, label: loc }))
  ];

  const typeOptions = venueTypes.map(type => ({
    value: type,
    label: type,
  }));

  // Render "View Top 100" card
  const renderViewTop100Card = () => (
    <button
      type="button"
      onClick={() => setShowTop100(true)}
      className="customer-top10-page__top100-card"
    >
      <div>
        <Trophy aria-hidden="true" />
        <strong>{t("feed:discover.view_top_100", "View Top 100")}</strong>
        <span>{t("feed:discover.see_all_ranked_users", "See all ranked users")}</span>
        <ArrowRight aria-hidden="true" />
      </div>
    </button>
  );

  return (
    <div className={`customer-top10-page${isMobile ? " customer-top10-page--mobile" : ""}${isDashboardPresentation ? " customer-top10-page--dashboard-presentation" : ""}`}>
      {isMobile && !isDashboardPresentation && <Web3FeedHeader />}

      <main className="customer-top10-page__main" aria-labelledby="top10-title">
        <header className="customer-top10-page__heading">
          <h1 id="top10-title">
            <Trophy aria-hidden="true" />
            {showTop100 ? 'Top 100' : 'Top 10'}
          </h1>
          {showTop100 && (
            <Button 
              variant="ghost" 
              onClick={() => setShowTop100(false)}
              className="customer-top10-page__back"
            >
              Back to Top 10
            </Button>
          )}
        </header>

        <section className="customer-top10-page__controls" aria-label="Ranking filters">
          <form
            className="customer-top10-page__search"
            onSubmit={(event) => {
              event.preventDefault();
              if (searchQuery.trim()) toast.info("Rankings updated for your search.");
            }}
          >
            <Search aria-hidden="true" />
            <Input
              placeholder="Search cities, countries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="customer-top10-page__search-input"
            />
          </form>

          <div className="customer-top10-page__scope-tabs" role="tablist" aria-label="Ranking area">
            {DISCOVERY_LEVELS.map((level) => {
              const Icon = level.icon;
              const isActive = discoveryLevel === level.value;

              return (
                <button
                  key={level.value}
                  className={isActive ? "customer-top10-page__scope-tab customer-top10-page__scope-tab--active" : "customer-top10-page__scope-tab"}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setDiscoveryLevel(level.value)}
                >
                  <Icon aria-hidden="true" />
                  {level.label}
                </button>
              );
            })}
          </div>

          <div className="customer-top10-page__filter-row">
          {/* Country Dropdown */}
          <FilterDropdown
            className="customer-top10-page__dropdown"
            options={countryOptions}
            value={selectedCountry}
            onChange={setSelectedCountry}
            placeholder="All Countries"
            variant="compact"
          />

          {/* Location Dropdown */}
          <FilterDropdown
            className="customer-top10-page__dropdown"
            options={locationOptions}
            value={selectedCity}
            onChange={setSelectedCity}
            placeholder="All Locations"
            variant="compact"
          />

          {/* View Mode Toggle */}
          <div className="customer-top10-page__segmented" role="tablist" aria-label="Ranking type">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "users"}
              onClick={() => setViewMode("users")}
              className={viewMode === "users" ? "customer-top10-page__segment customer-top10-page__segment--active" : "customer-top10-page__segment"}
            >
              Top Users
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "venues"}
              onClick={() => setViewMode("venues")}
              className={viewMode === "venues" ? "customer-top10-page__segment customer-top10-page__segment--active" : "customer-top10-page__segment"}
            >
              Top Venues
            </button>
          </div>

          {/* Content Type or Venue Type */}
          {viewMode === "users" ? (
            <div className="customer-top10-page__segmented" role="tablist" aria-label="Media filter">
              <button
                type="button"
                role="tab"
                aria-selected={contentType === "videos"}
                onClick={() => setContentType("videos")}
                className={contentType === "videos" ? "customer-top10-page__segment customer-top10-page__segment--active" : "customer-top10-page__segment"}
              >
                <Play className="w-3.5 h-3.5" />
                Videos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={contentType === "pics"}
                onClick={() => setContentType("pics")}
                className={contentType === "pics" ? "customer-top10-page__segment customer-top10-page__segment--active" : "customer-top10-page__segment"}
              >
                <Image className="w-3.5 h-3.5" />
                Photos
              </button>
            </div>
          ) : (
            <FilterDropdown
              className="customer-top10-page__dropdown"
              options={typeOptions}
              value={selectedType}
              onChange={setSelectedType}
              placeholder="All Types"
              variant="compact"
            />
          )}
        </div>

        </section>

        <section className="customer-top10-page__results" aria-live="polite">

        {loading ? (
          <div className="customer-top10-page__rank-grid customer-top10-page__rank-grid--loading" aria-live="polite">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="customer-top10-page__skeleton">
                <div />
              </div>
            ))}
          </div>
        ) : (
          <>
            {viewMode === "users" ? (
              filteredUsers.length > 0 ? (
                <div className="customer-top10-page__rank-grid">
                  {filteredUsers.slice(0, showTop100 ? 100 : 10).map((u, index) => {
                    const postImage = userPostImages.get(u.user_id);
                    const isVideo = postImage && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(postImage);
                    return (
                      <ExploreGridCard
                        key={u.id}
                        rank={index + 1}
                        post={{
                          id: u.id,
                          image_url: postImage && !isVideo ? postImage : undefined,
                          video_url: postImage && isVideo ? postImage : undefined,
                          content: "",
                          pounds_count: u.total_pounds,
                          user_id: u.user_id,
                          customer_profiles: {
                            display_name: u.display_name || undefined,
                            avatar_url: u.avatar_url || undefined,
                          },
                        }}
                        onClick={() => handleRankCardClick(u, index)}
                      />
                    );
                  })}
                  
                  {!showTop100 && filteredUsers.length > 0 && renderViewTop100Card()}
                </div>
              ) : (
                <div className="customer-top10-page__empty" aria-live="polite">
                  <span><Trophy aria-hidden="true" /></span>
                  <div>
                    <h2>{normalizedSearchQuery ? `No results for "${searchQuery.trim()}"` : t("feed:discover.no_top_users")}</h2>
                    <p>{normalizedSearchQuery ? "Try a different city, country, or user." : t("feed:discover.be_first_to_earn")}</p>
                  </div>
                  <button className="customer-top10-page__start" type="button" onClick={() => navigate("/app/feed/immersive")}>
                    Start Posting
                  </button>
                </div>
              )
            ) : (
              filteredVenues.length > 0 ? (
                <div className="customer-top10-page__venue-grid">
                  {filteredVenues.map((venue, index) => (
                    <div
                      key={venue.id}
                      className="customer-top10-page__venue-card"
                    >
                      <div className="customer-top10-page__venue-media">
                        <img
                          src={venue.image_url || getDefaultImage(venue.venue_type)}
                          alt={venue.name}
                          className="customer-top10-page__venue-image"
                        />
                      </div>
                      <div className="customer-top10-page__venue-rank">
                        {index + 1}
                      </div>
                      <div className="customer-top10-page__venue-shade" />
                      <div className="customer-top10-page__venue-copy">
                        <h3>{venue.name}</h3>
                        <p>
                          {venue.city || "Location TBD"} - {venue.venue_type || "Venue"}
                        </p>
                        <p className="customer-top10-page__venue-score">
                          <Star aria-hidden="true" />
                          {venue.vibe_score || 0} vibes
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="customer-top10-page__empty" aria-live="polite">
                  <span><Building2 aria-hidden="true" /></span>
                  <div>
                    <h2>{normalizedSearchQuery ? `No results for "${searchQuery.trim()}"` : "No top venues yet"}</h2>
                    <p>{normalizedSearchQuery ? "Try a different city, country, or venue." : "Venues with the best vibes will appear here. Explore and check in to help them rank."}</p>
                  </div>
                  <button className="customer-top10-page__start" type="button" onClick={() => setSelectedType("All")}>
                    Clear filters
                  </button>
                </div>
              )
            )}
          </>
        )}
        </section>
      </main>

      {/* Desktop Post Viewer */}
      {viewerState && !isMobile && (
        <DesktopPostViewer
          posts={viewerState.posts}
          initialIndex={viewerState.initialIndex}
          onClose={() => setViewerState(null)}
          onPound={handlePound}
          onComment={() => {}}
          onShare={() => toast.info("Share coming soon")}
          onSave={handleSavePost}
          onDelete={handleDeletePost}
          onReport={handleReportPost}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
};

export default Top10;
