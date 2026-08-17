import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Lock, Globe, MessageCircle } from "lucide-react";
import { useTranslation } from 'react-i18next';
import {
  useMentionSuggestions,
  getActiveMentionQuery,
  replaceActiveMention,
} from "@/hooks/useMentionSuggestions";
import MentionSuggestionList from "./MentionSuggestionList";

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postAuthorName: string;
  postAuthorAvatar?: string;
  userAvatar?: string;
  userName?: string;
  onSubmitComment: (data: { content: string; isPrivate: boolean; postId: string }) => void;
}

const CommentModal = ({
  isOpen,
  onClose,
  postId,
  postAuthorName,
  postAuthorAvatar,
  userAvatar,
  userName,
  onSubmitComment,
}: CommentModalProps) => {
  const { t } = useTranslation('feed');
  const [comment, setComment] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mentionQuery = getActiveMentionQuery(comment);
  const { suggestions: mentionSuggestions } = useMentionSuggestions(mentionQuery, {
    enabled: isOpen,
  });

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmitComment({
        content: comment.trim(),
        isPrivate,
        postId,
      });
      setComment("");
      setIsPrivate(false);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="customer-dialog-surface p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-[var(--customer-modal-line)]">
          <DialogTitle className="flex items-center gap-3 text-[var(--customer-modal-text)]">
            <MessageCircle className="w-5 h-5 text-[var(--customer-modal-cyan)]" />
            {t("comments.reply_to", { name: postAuthorName })}
          </DialogTitle>
        </DialogHeader>

        {/* Post Author Preview */}
        <div className="p-4 bg-[var(--customer-modal-canvas)] border border-[var(--customer-modal-line)] mx-4 mt-4 rounded-[6px] flex items-center gap-3">
          <Avatar className="w-10 h-10 ring-1 ring-[var(--customer-modal-line)]">
            <AvatarImage src={postAuthorAvatar} alt={postAuthorName} />
            <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] font-bold">
              {postAuthorName?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-[var(--customer-modal-text)] font-medium">{postAuthorName}</p>
            <p className="text-[var(--customer-modal-muted)] text-xs">{t("comments.original_poster")}</p>
          </div>
        </div>

        {/* Comment Input */}
        <div className="p-4 space-y-4">
          {/* User Avatar + Textarea */}
          <div className="flex gap-3">
            <Avatar className="w-10 h-10 ring-1 ring-[var(--customer-modal-cyan)] shrink-0">
              <AvatarImage src={userAvatar} alt={userName} />
              <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] font-bold">
                {userName?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 relative">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={isPrivate ? t("comments.write_private_message") : t("comments.write_comment")}
                className="customer-modal-field w-full min-h-[100px] resize-none"
              />
              {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50">
                  <MentionSuggestionList
                    suggestions={mentionSuggestions}
                    onSelect={(s) => setComment(replaceActiveMention(comment, s.name))}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Privacy Toggle */}
          <div className="flex items-center justify-between bg-[var(--customer-modal-canvas)] border border-[var(--customer-modal-line)] rounded-[6px] p-3">
            <div className="flex items-center gap-2">
              {isPrivate ? (
                <Lock className="w-4 h-4 text-[var(--customer-modal-cyan)]" />
              ) : (
                <Globe className="w-4 h-4 text-[var(--customer-modal-cyan)]" />
              )}
              <span className="text-sm font-medium text-[var(--customer-modal-text)]">
                {isPrivate ? t("comments.private_comment") : t("comments.public_comment")}
              </span>
            </div>
            
            <div className="customer-modal-segmented flex gap-1">
              <button
                onClick={() => setIsPrivate(false)}
                className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-all ${
                  !isPrivate 
                    ? "is-active" 
                    : "text-[var(--customer-modal-muted)] hover:text-[var(--customer-modal-text)]"
                }`}
              >
                <Globe className="w-3.5 h-3.5 inline mr-1" />
                {t("composer.public")}
              </button>
              <button
                onClick={() => setIsPrivate(true)}
                className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-all ${
                  isPrivate 
                    ? "is-active" 
                    : "text-[var(--customer-modal-muted)] hover:text-[var(--customer-modal-text)]"
                }`}
              >
                <Lock className="w-3.5 h-3.5 inline mr-1" />
                {t("composer.private")}
              </button>
            </div>
          </div>

          {/* Private Comment Info */}
          {isPrivate && (
            <div className="bg-[var(--customer-modal-cyan-soft)] border border-[var(--customer-modal-cyan)] rounded-[6px] p-3">
              <p className="text-[var(--customer-modal-cyan)] text-xs">
                {t("comments.private_info", { name: postAuthorName })}
              </p>
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!comment.trim() || isSubmitting}
            className="customer-modal-primary w-full py-3 font-semibold transition-all flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? t("common:app.loading") : isPrivate ? t("comments.send_private_reply") : t("comments.post_comment")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommentModal;
