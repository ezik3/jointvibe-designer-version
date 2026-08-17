import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Play, Pause, Volume2, VolumeX, MessageCircle, Share2, Sparkles, Clock, MapPin, X, ChevronUp, ChevronLeft, ChevronRight, MoreHorizontal, Music2, Bookmark, Trash2, Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import TaggedUsersDisplay from "./TaggedUsersDisplay";
import FistBumpAnimation from "./FistBumpAnimation";
import FistPoundIcon from "./FistPoundIcon";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";
import { useTranslation } from 'react-i18next';
import TranslatedText from "@/components/i18n/TranslatedText";

interface TaggedUser {
  id: string;
  username: string;
  avatar_url?: string;
  age?: number;
  relationship_status?: string;
  location?: string;
  connection_count?: number;
}

interface ImmersivePostCardProps {
  id: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  authorTier?: string;
  isOnline?: boolean;
  isGold?: boolean;
  isAR?: boolean;
  content: string;
  sourceLanguage?: string | null;
  sourceConfidence?: number | null;
  imageUrl?: string;
  videoUrl?: string;
  venueName?: string;
  taggedUsers?: TaggedUser[];
  poundsCount: number;
  commentsCount: number;
  shareCount?: number;
  createdAt: string;
  expiresIn?: number;
  onPound: () => void;
  onComment: () => void;
  onShare: () => void;
  onVenueClick?: () => void;
  onAuthorClick?: () => void;
  isActive?: boolean;
  allPosts?: Array<{ id: string; content: string; videoUrl?: string; imageUrl?: string }>;
  onNavigateToSimilar?: (postId: string) => void;
  currentUserId?: string;
  onSavePost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onReportPost?: (postId: string, reason: string) => void;
}

// Global state for mute preference
let globalMutePreference = true;

// Format large numbers (e.g., 42500 -> "42.5K")
const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return count.toString();
};

const ImmersivePostCard = ({
  id,
  authorId,
  authorName,
  authorAvatar,
  authorTier,
  isOnline = false,
  isGold = false,
  isAR = false,
  content,
  sourceLanguage,
  sourceConfidence,
  imageUrl,
  videoUrl,
  venueName,
  taggedUsers = [],
  poundsCount,
  commentsCount,
  shareCount = 0,
  createdAt,
  expiresIn = 24,
  onPound,
  onComment,
  onShare,
  onVenueClick,
  onAuthorClick,
  isActive = true,
  allPosts = [],
  onNavigateToSimilar,
  currentUserId,
  onSavePost,
  onDeletePost,
  onReportPost,
}: ImmersivePostCardProps) => {
  const { t } = useTranslation('feed');
  const [isPounding, setIsPounding] = useState(false);
  const [showFistBump, setShowFistBump] = useState(false);
  const [isMuted, setIsMuted] = useState(globalMutePreference);
  const [showFullContent, setShowFullContent] = useState(false);
  const [showFullscreenVideo, setShowFullscreenVideo] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [showDoubleTapPulse, setShowDoubleTapPulse] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);
  const doubleTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const MAX_PREVIEW_LENGTH = 80;

  const [poundPressed, setPoundPressed] = useState(false);
  const [poundRipple, setPoundRipple] = useState(false);

  const handlePound = () => {
    // Instant tactile feedback — fires synchronously on tap
    setPoundPressed(true);
    setIsPounding(true);
    setPoundRipple(true);
    setShowFistBump(true);
    onPound();
    // Quick press release (≤100ms) for snappy return
    setTimeout(() => setPoundPressed(false), 90);
    // Ripple fades out
    setTimeout(() => setPoundRipple(false), 520);
    setTimeout(() => setIsPounding(false), 1500);
  };

  // Double-tap to pound detection
  const handleDoubleTapCheck = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta < 300 && delta > 0) {
      // Double tap detected — trigger pound with visual feedback
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      let clientX: number, clientY: number;
      if ('touches' in e) {
        clientX = e.changedTouches?.[0]?.clientX ?? rect.width / 2;
        clientY = e.changedTouches?.[0]?.clientY ?? rect.height / 2;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      doubleTapPosRef.current = { x: clientX - rect.left, y: clientY - rect.top };
      setShowDoubleTapPulse(true);
      handlePound();
      setTimeout(() => setShowDoubleTapPulse(false), 600);
    }
  }, []);

  const handleFistBumpComplete = useCallback(() => {
    setShowFistBump(false);
  }, []);

  // Calculate expiry percentage (0-100)
  const expiryProgress = Math.max(0, Math.min(100, (expiresIn / 24) * 100));
  const isExpiringSoon = expiresIn <= 6;

  // Find similar videos based on content
  const findSimilarVideo = useCallback(() => {
    if (!allPosts || allPosts.length <= 1) return null;
    
    const currentWords = content.toLowerCase().split(/\s+/);
    let bestMatch: { id: string; score: number } | null = null;
    
    for (const post of allPosts) {
      if (post.id === id || !post.videoUrl) continue;
      
      const postWords = post.content.toLowerCase().split(/\s+/);
      const commonWords = currentWords.filter(word => 
        word.length > 3 && postWords.includes(word)
      );
      const score = commonWords.length;
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: post.id, score };
      }
    }
    
    // If no good match, return any video post
    if (!bestMatch || bestMatch.score === 0) {
      const videoPosts = allPosts.filter(p => p.id !== id && p.videoUrl);
      if (videoPosts.length > 0) {
        return videoPosts[Math.floor(Math.random() * videoPosts.length)].id;
      }
    }
    
    return bestMatch?.id || null;
  }, [allPosts, content, id]);

  // Handle video autoplay when active (muted by default)
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      if (isActive) {
        videoRef.current.muted = isMuted;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isActive, videoUrl, isMuted]);

  // Open fullscreen media (video or image) with sound for videos
  const handleMediaClick = useCallback(() => {
    if (videoUrl || imageUrl) {
      setShowFullscreenVideo(true);
      if (videoUrl) {
        // When opening fullscreen video, unmute globally
        globalMutePreference = false;
        setIsMuted(false);
      }
    }
  }, [videoUrl, imageUrl]);

  // Close fullscreen and return to feed with sound enabled
  const handleCloseFullscreen = useCallback(() => {
    setShowFullscreenVideo(false);
    // Sound stays on after exiting fullscreen (swipe left/right)
  }, []);

  // Handle swipe gestures in fullscreen
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const deltaX = e.changedTouches[0].clientX - touchStart.x;
    const deltaY = e.changedTouches[0].clientY - touchStart.y;
    
    // Horizontal swipe - go back to feed
    if (Math.abs(deltaX) > 80 && Math.abs(deltaX) > Math.abs(deltaY)) {
      handleCloseFullscreen();
    }
    // Vertical swipe up - show similar content
    else if (deltaY < -80 && Math.abs(deltaY) > Math.abs(deltaX)) {
      const similarPostId = findSimilarVideo();
      if (similarPostId && onNavigateToSimilar) {
        handleCloseFullscreen();
        onNavigateToSimilar(similarPostId);
      } else {
        handleCloseFullscreen();
      }
    }
    
    setTouchStart(null);
  };

  // Toggle mute
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    globalMutePreference = newMuted;
    setIsMuted(newMuted);
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.muted = newMuted;
    }
  }, [isMuted]);

  // Hide controls after delay
  const startControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  // Toggle play/pause for fullscreen video (including audio)
  const handleTogglePlayPause = useCallback(() => {
    // Show controls on any interaction
    startControlsTimer();
    
    if (fullscreenVideoRef.current) {
      const video = fullscreenVideoRef.current;
      if (video.paused) {
        video.volume = 1;
        video.muted = false;
        video.play().catch(() => {});
        setIsVideoPaused(false);
      } else {
        // STOP the video and audio completely
        video.pause();
        video.currentTime = video.currentTime; // Force stop
        video.muted = true;
        video.volume = 0;
        setIsVideoPaused(true);
        setShowControls(true); // Keep controls visible when paused
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
      }
    }
  }, [startControlsTimer]);

  // Handle fullscreen click for images - show controls
  const handleFullscreenImageClick = useCallback(() => {
    startControlsTimer();
  }, [startControlsTimer]);

  // Also pause background video when fullscreen opens
  useEffect(() => {
    if (showFullscreenVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.muted = true;
    }
  }, [showFullscreenVideo]);

  // Play fullscreen video when opened and start controls timer
  useEffect(() => {
    if (showFullscreenVideo) {
      startControlsTimer();
      if (fullscreenVideoRef.current && videoUrl) {
        const video = fullscreenVideoRef.current;
        video.volume = 1;
        video.muted = false;
        video.play().catch(() => {});
        setIsVideoPaused(false);
      }
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showFullscreenVideo, videoUrl, startControlsTimer]);

  return (
    <>
      {/* Fist Bump Animation Overlay */}
      <FistBumpAnimation show={showFistBump} onComplete={handleFistBumpComplete} />

      {/* Fullscreen Media Modal - rendered via portal to cover EVERYTHING */}
      {showFullscreenVideo && (videoUrl || imageUrl) && createPortal(
        <div 
          className="fixed inset-0 bg-black"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', zIndex: 999999 }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={videoUrl ? handleTogglePlayPause : handleFullscreenImageClick}
        >
          {/* Fullscreen Media - fills entire screen */}
          {videoUrl ? (
            <video
              ref={fullscreenVideoRef}
              src={videoUrl}
              autoPlay
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePlayPause();
              }}
            />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Post"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              onClick={(e) => {
                e.stopPropagation();
                handleFullscreenImageClick();
              }}
            />
          ) : null}
          
          {/* Play/Pause indicator for videos */}
          {videoUrl && isVideoPaused && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1000000 }}>
              <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-lg flex items-center justify-center">
                <Play className="w-10 h-10 text-white ml-1" />
              </div>
            </div>
          )}
          
          {/* Close button - positioned at top with fade */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCloseFullscreen();
            }}
            className={`absolute top-6 right-6 w-12 h-12 rounded-full bg-black/70 backdrop-blur-lg flex items-center justify-center transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ zIndex: 1000000 }}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          
          {/* Mute button in fullscreen - for videos only with fade */}
          {videoUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                startControlsTimer();
                toggleMute();
              }}
              className={`absolute bottom-24 right-6 w-12 h-12 rounded-full bg-black/50 backdrop-blur-lg flex items-center justify-center transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              style={{ zIndex: 1000000 }}
            >
              {isMuted ? <VolumeX className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
            </button>
          )}
          
          {/* Author Info + Caption at bottom */}
          <div 
            className="absolute bottom-6 left-4 right-20 flex items-end gap-3"
            style={{ zIndex: 1000000 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar className={`w-10 h-10 ring-2 flex-shrink-0 ${isGold ? 'ring-gold' : 'ring-cyan'}`}>
              <AvatarImage src={authorAvatar} alt={authorName} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-purple to-pink text-white font-bold text-sm">
                {authorName?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <span className={`font-bold text-sm ${isGold ? 'text-gold' : 'text-white'}`}>
                @{authorName}
              </span>
              {content && (
                <p className="text-white/90 text-sm mt-0.5 line-clamp-2">
                  {content}
                </p>
              )}
            </div>
          </div>
          
          {/* Swipe indicators with fade */}
          <div 
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 text-white/50 text-xs transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}
            style={{ zIndex: 1000000 }}
          >
            <div className="flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" />
              <ChevronRight className="w-3 h-3" />
              <span>{t("posts.swipe_to_exit")}</span>
            </div>
            {videoUrl && (
              <div className="flex items-center gap-1">
                <ChevronUp className="w-3 h-3" />
                <span>{t("posts.swipe_up_similar")}</span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Full Content Overlay removed — caption now expands inline (see below) */}

      <article className="relative w-full h-full flex flex-col immersive-post" onClick={handleDoubleTapCheck}>
      {/* Double-tap pulse feedback */}
      {showDoubleTapPulse && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{ left: doubleTapPosRef.current.x - 40, top: doubleTapPosRef.current.y - 40 }}
        >
          <div className="w-20 h-20 rounded-full bg-primary/30 animate-ping" />
        </div>
      )}
      {/* Background Media - Full Screen */}
      <div className="absolute inset-0">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={imageUrl}
            loop
            muted={isMuted}
            playsInline
            onClick={handleMediaClick}
            className="w-full h-full object-cover cursor-pointer"
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Post"
            loading="lazy"
            className="w-full h-full object-cover cursor-pointer"
            onClick={handleMediaClick}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple via-pink to-cyan opacity-30" />
        )}
        
        {/* Cinematic gradient overlays — minimal vignette, content remains hero */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
        
        {/* Web3 Grid Pattern Overlay */}
        <div className="absolute inset-0 web3-grid opacity-20 pointer-events-none" />
        
        {/* Particle Effect for AR posts */}
        {isAR && <div className="absolute inset-0 particles opacity-40 pointer-events-none" />}
        
        {/* Play indicator for videos - tap to open fullscreen */}
        {videoUrl && !showFullscreenVideo && (
          <button 
            onClick={handleMediaClick}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center hover:scale-110 transition-all z-10"
          >
            <Play className="w-10 h-10 text-white ml-1" />
          </button>
        )}
      </div>

      {/* Expiry Timer Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
        <div 
          className={`h-full transition-all duration-1000 ${isExpiringSoon ? 'bg-destructive' : 'bg-gradient-to-r from-cyan to-purple'}`}
          style={{ width: `${expiryProgress}%` }}
        />
      </div>

      {/* Top Indicators — minimal chrome */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-3">
        {/* AR Indicator */}
        {isAR ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan/15 backdrop-blur-md rounded-full border border-cyan/40">
            <Sparkles className="w-3.5 h-3.5 text-cyan" />
            <span className="text-[11px] font-medium text-cyan">{t("posts.ar_ready")}</span>
          </div>
        ) : <span />}

        {/* Expiry Timer */}
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-md ${
          isExpiringSoon
            ? 'bg-destructive/20 border border-destructive/40'
            : 'bg-black/30 border border-white/10'
        }`}>
          <Clock className={`w-3 h-3 ${isExpiringSoon ? 'text-destructive' : 'text-white/70'}`} />
          <span className={`text-[11px] ${isExpiringSoon ? 'text-destructive font-medium' : 'text-white/70'}`}>
            {t("posts.hours_left", { count: expiresIn })}
          </span>
        </div>
      </div>

      {/* Right Side Actions — TikTok-style floating overlay (no chrome) */}
      <div className="absolute right-2 sm:right-3 bottom-32 sm:bottom-28 flex flex-col items-center gap-5 z-20 [&_button]:drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
        {/* Pound */}
        <button
          onClick={handlePound}
          aria-label={t("posts.pound_this_post")}
          className={`relative flex flex-col items-center gap-1 select-none transition-transform duration-fast ease-out-expo will-change-transform active:scale-90 ${poundPressed ? 'scale-90' : 'scale-100'}`}
        >
          {/* Soft ripple — instant satisfying feedback */}
          {poundRipple && (
            <span
              aria-hidden
              className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-pink/40 animate-ping pointer-events-none"
              style={{ animationDuration: '500ms' }}
            />
          )}
          <FistPoundIcon
            className={`w-8 h-8 transition-colors duration-fast ${isPounding ? 'text-pink' : 'text-white'}`}
            filled={isPounding}
          />
          <span className={`text-[11px] font-semibold transition-colors duration-fast ${isPounding ? 'text-pink' : 'text-white'}`}>
            {formatCount(poundsCount)}
          </span>
        </button>

        {/* Comment */}
        <button
          onClick={onComment}
          aria-label={t("posts.open_comments")}
          className="flex flex-col items-center gap-1 select-none transition-transform duration-fast ease-out-expo will-change-transform active:scale-95 active:opacity-80"
        >
          <MessageCircle className="w-8 h-8 text-white" strokeWidth={1.75} />
          <span className="text-[11px] font-semibold text-white">
            {formatCount(commentsCount)}
          </span>
        </button>

        {/* Share */}
        <button
          onClick={onShare}
          aria-label={t("posts.share_post")}
          className="flex flex-col items-center gap-1 select-none transition-transform duration-fast ease-out-expo will-change-transform active:scale-95 active:opacity-80"
        >
          <Share2 className="w-8 h-8 text-white" strokeWidth={1.75} />
          <span className="text-[11px] font-semibold text-white">
            {shareCount > 0 ? formatCount(shareCount) : t("common:actions.share")}
          </span>
        </button>

        {/* Mute (videos only) */}
        {videoUrl && (
          <button
            onClick={toggleMute}
            aria-label={isMuted ? t("posts.unmute") : t("posts.mute")}
            className="flex items-center justify-center select-none transition-transform duration-fast ease-out-expo will-change-transform active:scale-95 active:opacity-80"
          >
            {isMuted ? (
              <VolumeX className="w-7 h-7 text-white" strokeWidth={1.75} />
            ) : (
              <Volume2 className="w-7 h-7 text-white" strokeWidth={1.75} />
            )}
          </button>
        )}

        {/* More */}
        <div className="relative">
          <button
            aria-label={t("posts.more_options")}
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="flex items-center justify-center select-none transition-transform duration-fast ease-out-expo will-change-transform active:scale-95 active:opacity-80"
          >
            <MoreHorizontal className="w-7 h-7 text-white" />
          </button>

          {/* Post Options Menu */}
          {showMoreMenu && (
            <div className="absolute bottom-14 right-0 w-48 bg-black/90 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl z-50">
              {currentUserId === authorId ? (
                <>
                  <button
                    onClick={() => {
                      onSavePost?.(id);
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors text-sm"
                  >
                    <Bookmark className="w-4 h-4" />
                    {t("posts.save_post")}
                  </button>
                  <button
                    onClick={() => {
                      onDeletePost?.(id);
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-destructive hover:bg-white/10 transition-colors text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("posts.delete_post")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      onSavePost?.(id);
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors text-sm"
                  >
                    <Bookmark className="w-4 h-4" />
                    {t("posts.save_post")}
                  </button>
                  <button
                    onClick={() => {
                      setShowReportModal(true);
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-destructive hover:bg-white/10 transition-colors text-sm"
                  >
                    <Flag className="w-4 h-4" />
                    {t("posts.report_post")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && createPortal(
        <div 
          className="customer-modal-overlay fixed inset-0 flex items-center justify-center z-[100000] p-4"
          onClick={() => setShowReportModal(false)}
        >
          <div 
            className="customer-modal-panel p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[var(--customer-modal-text)] font-bold text-lg mb-4">{t("posts.report_post")}</h3>
            <p className="text-[var(--customer-modal-muted)] text-sm mb-4">{t("posts.report_reason_prompt")}</p>
            <div className="space-y-2">
              {[t("posts.report_spam"), t("posts.report_harassment"), t("posts.report_inappropriate"), t("posts.report_misinfo"), t("posts.report_other")].map((reason) => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={`w-full text-left px-4 py-2.5 rounded-[6px] text-sm transition-colors ${
                    reportReason === reason 
                      ? "bg-destructive/20 border border-destructive/50 text-destructive" 
                      : "bg-[var(--customer-modal-canvas)] border border-[var(--customer-modal-line)] text-[var(--customer-modal-text)] hover:bg-[var(--customer-modal-raised)]"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => { setShowReportModal(false); setReportReason(""); }}
                className="customer-modal-secondary flex-1 py-2.5 text-sm font-medium transition-colors"
              >
                {t("common:app.cancel")}
              </button>
              <button 
                onClick={() => {
                  if (reportReason) {
                    onReportPost?.(id, reportReason);
                    setShowReportModal(false);
                    setReportReason("");
                  }
                }}
                disabled={!reportReason}
                className="flex-1 py-2.5 rounded-[6px] bg-destructive text-white text-sm font-medium hover:bg-destructive/80 transition-colors disabled:opacity-40"
              >
                {t("common:actions.submit")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bottom-Left Author Block — minimal, content-first */}
      <div className={`absolute left-3 sm:left-4 bottom-20 sm:bottom-24 z-10 ${showFullContent ? 'max-w-[88%] sm:max-w-[60%] md:max-w-[50%]' : 'max-w-[72%] sm:max-w-[60%] md:max-w-[50%]'}`}>
        {/* Author Info Row — compact */}
        <div className="flex items-center gap-2 mb-1.5">
          <Avatar
            className={`w-8 h-8 ring-1 ${isGold ? 'ring-gold' : 'ring-white/30'} cursor-pointer transition-transform duration-fast active:scale-95`}
            onClick={(e) => {
              e.stopPropagation();
              onAuthorClick?.();
            }}
          >
            <AvatarImage src={authorAvatar} alt={authorName} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-purple to-pink text-white font-bold text-xs">
              {authorName?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-semibold text-sm truncate cursor-pointer ${isGold ? 'text-gold' : 'text-white'} drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]`}
              onClick={(e) => {
                e.stopPropagation();
                onAuthorClick?.();
              }}
            >
              @{authorName}
            </span>
            {authorTier && authorTier !== "member" && (
              <TierBadge tier={authorTier as TierName} size="sm" showLabel={false} />
            )}
            {isOnline && (
              <span aria-label="Online" className="w-2 h-2 bg-success rounded-full" />
            )}
          </div>
        </div>

        {/* Location Badge */}
        {venueName && (
          <button
            onClick={onVenueClick}
            className="flex items-center gap-1 mb-1.5 text-white/85 hover:text-white transition-colors duration-fast"
          >
            <MapPin className="w-3 h-3" />
            <span className="text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">{venueName}</span>
          </button>
        )}

        {/* Post Content */}
        <div
          className={`mb-2 ${showFullContent ? 'bg-black/60 backdrop-blur-md rounded-[14px] p-3 ring-1 ring-inset ring-white/[0.08] shadow-2xl' : ''}`}
          onClick={(e) => { if (showFullContent) e.stopPropagation(); }}
        >
          <TranslatedText
            text={content}
            contentId={id}
            contentType="post"
            sourceLang={sourceLanguage}
            sourceConfidence={sourceConfidence ?? undefined}
          >
            {(resolved) => {
              const isLong = resolved.length > MAX_PREVIEW_LENGTH;
              if (isLong && !showFullContent) {
                return (
                  <p className="text-white/95 text-sm sm:text-base leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {resolved.slice(0, MAX_PREVIEW_LENGTH)}...
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowFullContent(true); }}
                      className="ml-1 text-white/60 hover:text-white transition-colors"
                    >
                      {t("posts.more")}
                    </button>
                  </p>
                );
              }
              return (
                <div className={showFullContent && isLong ? 'max-h-[55vh] overflow-y-auto pr-1' : ''}>
                  <p className="text-white/95 text-sm sm:text-base leading-snug whitespace-pre-wrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {resolved}
                  </p>
                  {showFullContent && isLong && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowFullContent(false); }}
                      className="mt-2 text-white/60 hover:text-white transition-colors text-sm"
                    >
                      {t("posts.less", { defaultValue: "less" })}
                    </button>
                  )}
                </div>
              );
            }}
          </TranslatedText>
        </div>

        {/* Tagged Users */}
        {taggedUsers.length > 0 && (
          <div className="mb-2">
            <TaggedUsersDisplay users={taggedUsers} maxDisplay={3} size="sm" showLabel={false} />
          </div>
        )}

        {/* Original Audio Indicator */}
        <div className="flex items-center gap-2 text-white/70">
          <Music2 className="w-3.5 h-3.5" />
          <span className="text-xs">{t("posts.original_audio", { name: authorName })}</span>
        </div>

        {/* Time ago */}
        <span className="text-xs text-white/50 mt-1 block">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </span>

        {/* Holographic Token Indicator for Gold Posts */}
        {isGold && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full holographic">
            <span className="text-xs font-medium text-white">{t("posts.premium_content")}</span>
          </div>
        )}
      </div>
      </article>
    </>
  );
};

export default ImmersivePostCard;
