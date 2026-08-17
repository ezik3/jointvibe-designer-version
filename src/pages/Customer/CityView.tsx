import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { X, Search, Users, UserPlus, Globe, ChevronDown, Settings } from "lucide-react";
import FollowButton from "@/components/Customer/FollowButton";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAd } from "@/hooks/useActiveAd";
import { useActiveDeals } from "@/hooks/useActiveDeals";
import { useAuth } from "@/contexts/AuthContext";
import AdBanner from "@/components/Ads/AdBanner";

import DealCard from "@/components/Customer/Deals/DealCard";
import { cityBackgrounds, defaultCityBackground, fetchRegisteredLocations, getLocationsByCountry } from "@/utils/locationData";
import { globalCache } from "@/hooks/useGlobalPrefetch";
import { useLivePresence } from "@/hooks/useLivePresence";
import { DiscoveryLevelSelector, type DiscoveryLevel } from "@/components/shared/DiscoveryLevelSelector";
import { useTranslation } from 'react-i18next';
import { cutoffIsoForPublicFeeds } from "@/lib/postExpiry";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PublicPoster {
  id: string;
  username: string;
  avatar_url?: string;
  age?: number;
  relationship_status?: string;
  city: string;
  connections: number;
  isGold?: boolean;
  isLive?: boolean;
  postContent?: string;
  postImage?: string;
  postVideo?: string;
  createdAt?: string;
  user_id?: string;
}

const CityView = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [userCity, setUserCity] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [discoveryLevel, setDiscoveryLevel] = useState("city" as DiscoveryLevel);
  const [userProfile, setUserProfile] = useState<{ suburb?: string | null; city?: string | null; state?: string | null; country_code?: string | null; default_discovery_level?: string | null } | null>(null);

  // Initialize from global cache for instant render - use profiles if available
  const [publicPosters, setPublicPosters] = useState<PublicPoster[]>(() => {
    // Use pre-fetched data with profiles for instant render
    if (globalCache.publicPostsWithProfiles && globalCache.publicPostsWithProfiles.length > 0) {
      return globalCache.publicPostsWithProfiles.filter((post: any) => post.created_at && post.created_at >= cutoffIsoForPublicFeeds()).slice(0, 30).map((post: any) => {
        const displayName = post.profile?.display_name?.trim();
        const avatarUrl = post.profile?.avatar_url && post.profile.avatar_url !== '/placeholder.svg' 
          ? post.profile.avatar_url 
          : undefined;
        return {
          id: post.id,
          user_id: post.user_id,
          username: displayName && displayName.length > 0 ? displayName : "Anonymous",
          avatar_url: avatarUrl,
          age: post.profile?.age || undefined,
          relationship_status: post.profile?.relationship_status || "Single",
          city: post.profile?.location?.split(',')[0]?.trim() || "",
          connections: post.profile?.connection_count || 0,
          isGold: post.post_type === "gold",
            isLive: false, // Will be updated by useLivePresence in the component
          postContent: post.content,
          postImage: post.image_url,
          postVideo: post.video_url,
          createdAt: post.created_at,
        };
      });
    }
    // Fallback to basic cache without profiles
    if (globalCache.publicPosts && globalCache.publicPosts.length > 0) {
      return globalCache.publicPosts.filter((post: any) => post.created_at && post.created_at >= cutoffIsoForPublicFeeds()).slice(0, 10).map((post: any) => ({
        id: post.id,
        user_id: post.user_id,
        username: "Loading...",
        city: "",
        connections: 0,
        isGold: post.post_type === "gold",
            isLive: false,
            postContent: post.content,
        postImage: post.image_url,
        postVideo: post.video_url,
        createdAt: post.created_at,
      }));
    }
    return [];
  });

  const [loading, setLoading] = useState(!globalCache.publicPostsWithProfiles || globalCache.publicPostsWithProfiles.length === 0);

  // Track current posters in a ref so the realtime/refetch effect can decide
  // whether to show the foreground "Loading…" state without re-running on
  // every state change.
  const publicPostersRef = useRef<PublicPoster[]>(publicPosters);
  useEffect(() => { publicPostersRef.current = publicPosters; }, [publicPosters]);
  const [countries, setCountries] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [locations, setLocations] = useState<{ country: string; location: string }[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  
  // Fetch active ad for the selected city
  const { activeAd, trackClick } = useActiveAd(selectedCity || "Brisbane", "city_view", userProfile?.suburb || undefined);
  const { deals: cityDeals, recordImpression, redeemDeal, snoozeDeal } = useActiveDeals('city_view', 5);
  const { isUserLive, getStreamForUser } = useLivePresence();

  // Fetch user's city and discovery preferences from their profile on mount
  useEffect(() => {
    const fetchUserCity = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from("customer_profiles")
          .select("location, city, suburb, state, country_code, default_discovery_level")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (profile) {
          setUserProfile(profile);
          // Use structured city field first, fall back to parsing location
          const city = profile.city || profile.location?.split(',')[0]?.trim() || "Brisbane";
          setUserCity(city);
          if (!location.state?.city) {
            setSelectedCity(city);
          }
          // Set default discovery level from user preference
          if (profile.default_discovery_level) {
            setDiscoveryLevel(profile.default_discovery_level as DiscoveryLevel);
          }
        }
      }
    };
    fetchUserCity();
  }, [user]);

  // Get city from navigation state (takes priority)
  useEffect(() => {
    if (location.state?.city) {
      setSelectedCity(location.state.city);
    }
  }, [location.state]);

  // Fetch registered locations on mount
  useEffect(() => {
    const loadLocations = async () => {
      const data = await fetchRegisteredLocations();
      setCountries(data.countries);
      setLocations(data.locations);
      
      if (userCity && data.locations.length > 0) {
        const userLocation = data.locations.find(loc => 
          loc.location.toLowerCase().includes(userCity.toLowerCase())
        );
        if (userLocation) {
          setSelectedCountry(userLocation.country);
          const citiesInCountry = getLocationsByCountry(data.locations, userLocation.country);
          setAvailableCities(citiesInCountry);
        } else {
          const firstCountry = data.countries[0] || "";
          setSelectedCountry(firstCountry);
          const citiesInCountry = getLocationsByCountry(data.locations, firstCountry);
          setAvailableCities(citiesInCountry);
        }
      } else if (data.countries.length > 0) {
        const firstCountry = data.countries[0];
        setSelectedCountry(firstCountry);
        const citiesInCountry = getLocationsByCountry(data.locations, firstCountry);
        setAvailableCities(citiesInCountry);
      }
    };
    loadLocations();
  }, [userCity]);

  useEffect(() => {
    // If we already have cached posters rendered, do NOT show the foreground
    // loading state — refresh in the background to avoid the visible "blink".
    const hasExistingData = publicPostersRef.current.length > 0;

    const fetchPublicPosts = async () => {
      if (!selectedCity) {
        setLoading(false);
        return;
      }

      if (!hasExistingData) setLoading(true);

      const { data: posts, error } = await supabase
        .from("posts")
        .select("id, user_id, content, image_url, video_url, post_type, is_live, created_at")
        .eq("visibility", "public")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        console.error("Error fetching posts:", error);
        setLoading(false);
        return;
      }

      if (!posts || posts.length === 0) {
        // Only clear if we had no cached data to begin with
        if (!hasExistingData) setPublicPosters([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(posts.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from("customer_profiles")
        .select("user_id, display_name, avatar_url, age, relationship_status, location, connection_count")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const posters: PublicPoster[] = posts
        .map((post) => {
          const profile = profileMap.get(post.user_id);
          const posterCity = profile?.location?.split(',')[0]?.trim() || '';
          const displayName = profile?.display_name?.trim();
          const avatarUrl = profile?.avatar_url && profile.avatar_url !== '/placeholder.svg'
            ? profile.avatar_url
            : undefined;

          return {
            id: post.id,
            user_id: post.user_id,
            username: displayName && displayName.length > 0 ? displayName : "Anonymous",
            avatar_url: avatarUrl,
            age: profile?.age || undefined,
            relationship_status: profile?.relationship_status || "Single",
            city: posterCity || selectedCity,
            connections: profile?.connection_count || 0,
            isGold: post.post_type === "gold",
            isLive: isUserLive(post.user_id),
            postContent: post.content,
            postImage: post.image_url,
            postVideo: post.video_url,
            createdAt: post.created_at,
          };
        })
        .filter(poster => {
          if (selectedCity) {
            return poster.city.toLowerCase().includes(selectedCity.toLowerCase());
          }
          return true;
        });

      setPublicPosters(posters);
      setLoading(false);
    };

    fetchPublicPosts();

    // Debounced realtime: at most one refetch every 5s after a 2s settle.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefetch = 0;
    const channel = supabase
      .channel(createRealtimeChannelTopic("public-posts-realtime"))
      .on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: "visibility=eq.public" }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const now = Date.now();
          if (now - lastRefetch < 5000) return;
          lastRefetch = now;
          fetchPublicPosts();
        }, 2000);
      })
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [selectedCity]);

  const filteredCities = searchQuery 
    ? availableCities.filter(city => city.toLowerCase().includes(searchQuery.toLowerCase()))
    : availableCities;

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    const citiesInCountry = getLocationsByCountry(locations, country);
    setAvailableCities(citiesInCountry);
    if (citiesInCountry.length > 0) {
      setSelectedCity(citiesInCountry[0]);
    }
  };

  const handlePosterClick = (poster: PublicPoster) => {
    // If this user is currently live, go to their live stream
    const stream = getStreamForUser(poster.user_id || "");
    if (stream) {
      navigate(`/app/live/watch/${stream.id}`);
      return;
    }
    navigate("/app/public-post", { 
      state: { 
        poster,
        postId: poster.id,
        city: selectedCity,
        allPosters: publicPosters.map(p => ({
          id: p.id,
          user_id: p.user_id,
          username: p.username || "Anonymous",
          avatar_url: p.avatar_url,
          age: p.age,
          relationship_status: p.relationship_status,
          isGold: p.isGold,
          isLive: p.isLive,
          postContent: p.postContent,
          postImage: p.postImage || undefined,
          postVideo: p.postVideo,
          pounds: Math.floor(Math.random() * 50) + 5,
        }))
      }
    });
  };

  const cityBg = cityBackgrounds[selectedCity] || defaultCityBackground;
  const liveBackdrop = activeAd?.media_url || cityBg;

  return (
    <div className="min-h-screen relative">
      {/* Mobile: keep City View content, swap the backdrop when a live ad exists */}
      <div
        className="absolute inset-0 bg-cover bg-center md:hidden"
        style={{ backgroundImage: `url(${liveBackdrop})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/80" />
      </div>
      {/* Desktop: ad media as full backdrop when an ad is live, otherwise city bg */}
      <div
        className="absolute inset-0 bg-cover bg-center hidden md:block"
        style={{ backgroundImage: `url(${liveBackdrop})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/80" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <button 
            onClick={() => navigate("/app/feed")}
            className="p-2 bg-black/40 backdrop-blur-xl rounded-full hover:bg-black/60 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          
          {/* Search Input */}
          <div className="flex-1 max-w-md mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any city or country..."
                className="pl-10 bg-black/40 backdrop-blur-xl border-white/20 text-white placeholder:text-white/50"
              />
            </div>
          </div>
        </div>

        {/* Discovery Level Selector */}
        <div className="px-4 mb-2">
          <DiscoveryLevelSelector value={discoveryLevel} onChange={setDiscoveryLevel} />
        </div>

        <div className="px-4 mb-2 flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-xl rounded-lg border border-white/20 text-white hover:bg-black/60 transition-colors">
                <Globe className="w-4 h-4 text-neon-cyan" />
                <span className="text-sm font-medium">{selectedCountry || "Country"}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-black/90 backdrop-blur-xl border-white/20 max-h-64 overflow-y-auto">
              {countries.length === 0 ? (
                <DropdownMenuItem className="text-white/60">No countries with registered users</DropdownMenuItem>
              ) : (
                countries.map((country) => (
                  <DropdownMenuItem
                    key={country}
                    onClick={() => handleCountryChange(country)}
                    className={`text-white hover:bg-white/10 cursor-pointer ${
                      selectedCountry === country ? "bg-neon-cyan/20 text-neon-cyan" : ""
                    }`}
                  >
                    {country}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {userCity && userCity !== selectedCity && (
            <button
              onClick={() => setSelectedCity(userCity)}
              className="text-xs text-neon-cyan hover:underline"
            >
              Back to {userCity}
            </button>
          )}
        </div>

        {/* City Name */}
        <div className="text-center py-4">
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-wider drop-shadow-2xl" style={{ textShadow: "4px 4px 8px rgba(0,0,0,0.5)" }}>
            {selectedCity?.toUpperCase() || userCity?.toUpperCase() || "YOUR CITY"}
          </h1>
        </div>

        {/* Ad — AdBanner shows desktop horizontal property card and mobile scrolling ticker */}
        {activeAd && (
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
        )}

        {/* Hot Deals */}
        {cityDeals.length > 0 && (
          <div className="px-4 pb-2">
            <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-1.5">
              🔥 Hot Deals in {selectedCity}
            </h3>
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {cityDeals.map(deal => (
                  <div key={deal.id} className="w-[200px] flex-shrink-0">
                    <DealCard
                      deal={deal}
                      variant="compact"
                      onRedeem={redeemDeal}
                      onImpression={() => recordImpression(deal.id, deal.venue_id)}
                      onSnooze={snoozeDeal}
                    />
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="invisible" />
            </ScrollArea>
          </div>
        )}

        {/* City Tabs */}
        <div className="px-4">
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-4">
              {filteredCities.length === 0 ? (
                <p className="text-white/60 text-sm py-2">No cities found with registered users yet</p>
              ) : (
                filteredCities.map((city) => (
                  <button
                    key={city}
                    onClick={() => {
                      setSelectedCity(city);
                      setSearchQuery("");
                    }}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-300 ${
                      selectedCity === city 
                        ? "bg-neon-cyan text-black border-b-2 border-neon-cyan shadow-[0_0_20px_rgba(0,255,255,0.4)]" 
                        : "bg-black/30 text-white/70 hover:bg-black/50 hover:text-white"
                    }`}
                  >
                    {city.slice(0, 6).toUpperCase()}
                  </button>
                ))
              )}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>

        {/* Public Posters Grid */}
        <div className="flex-1 p-4 pb-16 md:pb-4">
          {publicPosters.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/60">
              <Users className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">{t("feed:empty.no_public_posts", { city: selectedCity || t("feed:empty.this_area") })}</p>
              <p className="text-sm">{t("feed:empty.be_first_to_share")}</p>
            </div>
          ) : (
            <ScrollArea className="w-full h-full">
              <div className="flex gap-4 pb-8">
                {publicPosters.map((poster) => (
                  <div
                    key={poster.id}
                    className={`flex-shrink-0 w-36 md:w-44 p-4 rounded-2xl backdrop-blur-xl transition-all duration-300 hover:scale-105 ${
                      poster.isGold 
                        ? "bg-black/60 ring-2 ring-neon-cyan shadow-[0_0_30px_rgba(0,255,255,0.3)]" 
                        : "bg-black/50 ring-1 ring-white/20 hover:ring-neon-cyan/50"
                    }`}
                  >
                    {/* Avatar with Live Indicator (clickable → profile) */}
                    <div
                      className="relative mx-auto mb-3 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (poster.user_id) navigate(`/app/user/${poster.user_id}`);
                      }}
                    >
                      <div className={`p-0.5 rounded-full ${
                        poster.isGold 
                          ? "bg-gradient-to-br from-neon-cyan via-green-400 to-neon-cyan" 
                          : "bg-gradient-to-br from-neon-purple via-neon-pink to-neon-cyan"
                      }`}>
                        <Avatar className="w-16 h-16 md:w-20 md:h-20 ring-2 ring-black">
                          <AvatarImage src={poster.avatar_url} className="object-cover" />
                          <AvatarFallback className="bg-gradient-to-br from-neon-purple to-neon-pink text-white text-xl font-bold">
                            {poster.username[0]}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      
                      {/* Live Indicator */}
                      {poster.isLive && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 flex items-center justify-center z-10">
                          <div className="absolute w-6 h-6 bg-green-500 rounded-full animate-ping opacity-75" />
                          <div className="relative w-5 h-5 bg-green-500 rounded-full border-2 border-black shadow-[0_0_12px_rgba(34,197,94,0.8)] flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>
                        </div>
                      )}
                      
                      {/* Gold Badge */}
                      {poster.isGold && !poster.isLive && (
                        <div className="absolute -top-1 -right-1 text-lg">⭐</div>
                      )}
                    </div>

                    {/* Info — name clickable → profile, rest opens post */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (poster.user_id) navigate(`/app/user/${poster.user_id}`);
                      }}
                      className="block w-full text-left hover:text-neon-cyan transition-colors"
                    >
                      <p className="font-semibold text-white text-sm truncate hover:text-neon-cyan">{poster.username}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePosterClick(poster)}
                      className="block w-full text-left"
                    >
                      <p className="text-xs text-white/60 truncate">
                        {poster.age && `${poster.age}, `}{poster.relationship_status}
                      </p>
                      <p className="text-xs text-neon-cyan truncate">{poster.city}</p>

                      {/* Connections */}
                      <div className="flex items-center justify-center gap-1 mt-2 text-white/70">
                        <Users className="w-3 h-3" />
                        <span className="text-xs font-bold">{poster.connections}</span>
                      </div>
                    </button>

                    {/* Follow Button — fully wired */}
                    {poster.user_id && (
                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        <FollowButton
                          targetUserId={poster.user_id}
                          variant="compact"
                          className="w-full justify-center inline-flex"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="invisible" />
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
};

export default CityView;
