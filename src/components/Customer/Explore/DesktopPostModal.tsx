import { useEffect, useCallback, useState } from "react";
import { X, Heart, MessageCircle, Share2, Bookmark, Trash2, Flag } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import MediaFrame from "@/components/Customer/Feed/MediaFrame";
import { formatDistanceToNow } from "date-fns";
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

interface DesktopPostModalProps {
  post: Post;
  onClose: () => void;
  onPound: (postId: string) => void;
  onComment: (post: Post) => void;
  onShare: () => void;
  onSave: (postId: string) => void;
  onDelete: (postId: string) => void;
  onReport: (postId: string, reason: string) => void;
  currentUserId?: string;
}

const DesktopPostModal = ({
  post,
  onClose,
  onPound,
  onComment,
  onShare,
  onSave,
  onDelete,
  onReport,
  currentUserId,
}: DesktopPostModalProps) => {
  const { t } = useTranslation('common');
  const authorName = post.customer_profiles?.display_name || post.author_name || "Anonymous";
  const authorAvatar = post.customer_profiles?.avatar_url || post.author_avatar;
  const isOwner = currentUserId === post.user_id;
  const [visible, setVisible] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    // Trigger entrance animation on next frame
    requestAnimationFrame(() => setVisible(true));
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div
      className={`customer-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={onClose}
    >
      <div
        className={`customer-modal-panel flex w-full max-w-[1200px] h-[90vh] max-md:h-[calc(100dvh-32px)] max-md:flex-col overflow-hidden transition-all duration-200 ${visible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT — Media Panel */}
        <div className="w-[40%] max-w-[480px] max-md:w-full max-md:max-w-none max-md:h-[48%] shrink-0 bg-[var(--customer-modal-canvas)] flex items-center justify-center">
          <MediaFrame
            imageUrl={post.image_url}
            videoUrl={post.video_url}
            aspectRatio="9/16"
            className="w-full h-full"
            autoPlay
          />
        </div>

        {/* RIGHT — Sidebar */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--customer-modal-line)]">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 ring-2 ring-[var(--customer-modal-line)]">
                <AvatarImage src={authorAvatar} />
                <AvatarFallback className="bg-[var(--customer-modal-raised)] text-[var(--customer-modal-text)] text-sm">
                  {authorName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-[var(--customer-modal-text)] font-semibold text-sm">{authorName}</p>
                {post.author_tier && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)]">
                    {post.author_tier}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="customer-modal-secondary w-8 h-8 p-0 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
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
                onClick={onShare}
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
    </div>
  );
};

export default DesktopPostModal;
