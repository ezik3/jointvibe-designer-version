import { useEffect, useCallback, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Heart, MessageCircle, Share2, Bookmark, Trash2, Flag } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import MediaFrame from "@/components/Customer/Feed/MediaFrame";
import FollowButton from "@/components/Customer/FollowButton";
import { formatDistanceToNow } from "date-fns";
import { useVideoPreload } from "@/hooks/useVideoPreload";
import { useWatchTimeTracker } from "@/hooks/useWatchTimeTracker";
import { useTranslation } from 'react-i18next';

interface Post {
  id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  pounds_count: number;
  comments_count: number;
  created_at: string;
  user_id: string;
  author_name?: string;
  author_avatar?: string;
  author_tier?: string;
  customer_profiles?: {
    display_name?: string;
    avatar_url?: string;
  } | null;
  venues?: { name: string } | null;
}

interface DesktopPostViewerProps {
  posts: Post[];
  initialIndex: number;
  onClose: () => void;
  onPound: (postId: string) => void;
  onComment: (post: Post) => void;
  onShare: (post: Post) => void;
  onSave: (postId: string) => void;
  onDelete: (postId: string) => void;
  onReport: (postId: string, reason: string) => void;
  currentUserId?: string;
}

const WINDOW_BUFFER = 5; // render ±5 posts around current

const DesktopPostViewer = ({
  posts,
  initialIndex,
  onClose,
  onPound,
  onComment,
  onShare,
  onSave,
  onDelete,
  onReport,
  currentUserId,
}: DesktopPostViewerProps) => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hasScrolledToInitial = useRef(false);

  // Watch-time tracking
  const activePost = posts[currentIndex];
  useWatchTimeTracker(activePost?.id, currentUserId);

  // Entrance animation
  useEffect(() => {
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => setVisible(true));
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ESC to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Scroll to initial post using ref (not calculated height)
  useEffect(() => {
    if (hasScrolledToInitial.current) return;
    const el = postRefs.current[initialIndex];
    if (el) {
      el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
      hasScrolledToInitial.current = true;
    }
  }, [initialIndex, posts.length]);

  // Track current index on scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    // Find which post is most visible
    let bestIndex = currentIndex;
    let bestOverlap = 0;
    for (let i = Math.max(0, currentIndex - 3); i < Math.min(posts.length, currentIndex + 4); i++) {
      const el = postRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const top = Math.max(rect.top, containerRect.top);
      const bottom = Math.min(rect.bottom, containerRect.bottom);
      const overlap = Math.max(0, bottom - top);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = i;
      }
    }
    if (bestIndex !== currentIndex) {
      setCurrentIndex(bestIndex);
    }
  }, [currentIndex, posts.length]);

  // Video preloading — preload current + next 2
  useVideoPreload(
    posts.map(p => ({ id: p.id, video_url: p.video_url })),
    currentIndex
  );

  // Windowed rendering
  const windowStart = Math.max(0, currentIndex - WINDOW_BUFFER);
  const windowEnd = Math.min(posts.length, currentIndex + WINDOW_BUFFER + 1);

  return (
    <div
      className={`customer-modal-overlay fixed inset-0 z-[100] transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="customer-modal-secondary fixed top-4 right-4 z-[110] w-10 h-10 p-0 flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Scrollable container — clicks outside the post card close the viewer */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onClick={onClose}
        className={`h-full overflow-y-auto scrollbar-hide transition-all duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        {posts.map((post, index) => {
          // Only render posts within the window (lightweight windowing)
          const inWindow = index >= windowStart && index < windowEnd;
          const authorName = post.customer_profiles?.display_name || post.author_name || "Anonymous";
          const authorAvatar = post.customer_profiles?.avatar_url || post.author_avatar;
          const isOwner = currentUserId === post.user_id;

          return (
            <div
              key={post.id}
              ref={(el) => { postRefs.current[index] = el; }}
              className="min-h-[75vh] flex items-center justify-center py-6"
            >
              {inWindow ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="customer-modal-panel flex w-full max-w-[1000px] h-[75vh] max-md:h-[calc(100dvh-32px)] max-md:flex-col overflow-hidden"
                >
                  {/* LEFT — Media Panel */}
                  <div className="w-[40%] max-w-[400px] max-md:w-full max-md:max-w-none max-md:h-[46%] shrink-0 bg-[var(--customer-modal-canvas)] flex items-center justify-center">
                    <MediaFrame
                      imageUrl={post.image_url}
                      videoUrl={post.video_url}
                      aspectRatio="9/16"
                      className="w-full h-full"
                      autoPlay={index === currentIndex}
                    />
                  </div>

                  {/* RIGHT — Sidebar */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--customer-modal-line)]">
                      <div
                        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => post.user_id && navigate(`/app/user/${post.user_id}`)}
                      >
                        <Avatar className="w-10 h-10 ring-2 ring-[var(--customer-modal-line)]">
                          <AvatarImage src={authorAvatar} />
                          <AvatarFallback className="bg-[var(--customer-modal-raised)] text-[var(--customer-modal-text)] text-sm">
                            {authorName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-[var(--customer-modal-text)] font-semibold text-sm hover:text-[var(--customer-modal-cyan)] transition-colors">{authorName}</p>
                          {post.author_tier && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)]">
                              {post.author_tier}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isOwner && post.user_id && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <FollowButton targetUserId={post.user_id} variant="compact" />
                        </div>
                      )}
                    </div>

                    {/* Caption */}
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      {post.content && (
                        <p className="text-[var(--customer-modal-text)] text-sm leading-relaxed whitespace-pre-wrap">
                          {post.content}
                        </p>
                      )}
                      {post.venues?.name && (
                        <p className="text-[var(--customer-modal-muted)] text-xs mt-2">📍 {post.venues.name}</p>
                      )}
                      <p className="text-[var(--customer-modal-faint)] text-xs mt-3">
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Engagement bar */}
                    <div className="border-t border-[var(--customer-modal-line)] px-5 py-3">
                      <div className="flex items-center gap-1 mb-3">
                        <span className="text-[var(--customer-modal-muted)] text-xs">
                          {post.pounds_count || 0} pounds · {post.comments_count || 0} comments
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onPound(post.id)}
                          className="customer-modal-secondary flex items-center gap-1.5 px-3 py-2 transition-colors"
                        >
                          <Heart className="w-4 h-4" />
                          <span className="text-xs">Pound</span>
                        </button>
                        <button
                          onClick={() => onComment(post)}
                          className="customer-modal-secondary flex items-center gap-1.5 px-3 py-2 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span className="text-xs">{t("feed:posts.comment")}</span>
                        </button>
                        <button
                          onClick={() => onShare(post)}
                          className="customer-modal-secondary flex items-center gap-1.5 px-3 py-2 transition-colors"
                        >
                          <Share2 className="w-4 h-4" />
                          <span className="text-xs">{t("common:actions.share")}</span>
                        </button>
                        <button
                          onClick={() => onSave(post.id)}
                          className="customer-modal-secondary flex items-center gap-1.5 px-3 py-2 transition-colors"
                        >
                          <Bookmark className="w-4 h-4" />
                          <span className="text-xs">{t("common:app.save")}</span>
                        </button>
                        {isOwner ? (
                          <button
                            onClick={() => onDelete(post.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-[6px] border border-destructive/50 bg-destructive/10 hover:bg-destructive/20 transition-colors text-destructive ml-auto"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="text-xs">{t("common:app.delete")}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onReport(post.id, "Inappropriate content")}
                            className="customer-modal-secondary flex items-center gap-1.5 px-3 py-2 transition-colors ml-auto"
                          >
                            <Flag className="w-4 h-4" />
                            <span className="text-xs">Report</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Placeholder for out-of-window posts (keeps scroll position correct)
                <div className="w-full max-w-[1000px] h-[75vh]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DesktopPostViewer;
