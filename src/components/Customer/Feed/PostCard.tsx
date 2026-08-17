import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import MediaFrame from "./MediaFrame";
import ClampedCaption from "./ClampedCaption";
import { TranslatedText } from "@/components/i18n/TranslatedText";
import { MoreHorizontal, Share2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import TaggedUsersDisplay from "./TaggedUsersDisplay";
import FistBumpAnimation from "./FistBumpAnimation";
import FistPoundIcon from "./FistPoundIcon";
import TierBadge from "@/components/Tier/TierBadge";
import { type TierName } from "@/hooks/useUserTier";

interface TaggedUser {
  id: string;
  username: string;
  avatar_url?: string;
  age?: number;
  relationship_status?: string;
  location?: string;
  connection_count?: number;
}

interface PostCardProps {
  id: string;
  authorName: string;
  sourceLanguage?: string | null;
  sourceConfidence?: number | null;
  authorAvatar?: string;
  authorTier?: string;
  isOnline?: boolean;
  isGold?: boolean;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  venueName?: string;
  venueCheckedIn?: boolean;
  taggedUsers?: TaggedUser[];
  poundsCount: number;
  commentsCount: number;
  createdAt: string;
  onPound: () => void;
  onComment: () => void;
  onShare: () => void;
  onVenueClick?: () => void;
}

/**
 * PostCard — Premium Polish Pass
 *
 * Visual refinements (no structural / dependency changes):
 *  - Tighter, more confident spacing rhythm
 *  - Quieter header chrome — content becomes the hero
 *  - Subtle layering via card surface + soft border (not glassy, not flat)
 *  - Tactile, instant-feedback action buttons (Apple Pay / Square feel)
 *  - Media gets its own visual weight with a soft inner separator
 *  - Pure design tokens, no arbitrary values
 */
const PostCard = ({
  id,
  authorName,
  authorAvatar,
  authorTier,
  isOnline = false,
  isGold = false,
  content,
  sourceLanguage,
  sourceConfidence,
  imageUrl,
  videoUrl,
  venueName,
  venueCheckedIn = false,
  taggedUsers = [],
  poundsCount,
  commentsCount,
  createdAt,
  onPound,
  onComment,
  onShare,
  onVenueClick,
}: PostCardProps) => {
  const [isPounding, setIsPounding] = useState(false);
  const [showFistBump, setShowFistBump] = useState(false);
  const { t } = useTranslation("feed");

  const handlePound = () => {
    setIsPounding(true);
    setShowFistBump(true);
    onPound();
    setTimeout(() => setIsPounding(false), 950);
  };

  const handleFistBumpComplete = useCallback(() => {
    setShowFistBump(false);
  }, []);

  const hasMedia = !!(imageUrl || videoUrl);

  return (
    <>
      <FistBumpAnimation show={showFistBump} onComplete={handleFistBumpComplete} />

      <article className="relative mx-3 mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card">
        {/* ── Header — quiet chrome, content is hero ────────────── */}
        <header className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <Avatar className="h-9 w-9 rounded-full ring-1 ring-border/60">
                <AvatarImage src={authorAvatar} alt={authorName} />
                <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">
                  {authorName?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {isOnline && (
                <span
                  aria-label="Online"
                  className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-col leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {authorName}
                </span>
                {isGold && (
                  <span
                    aria-label="Premium"
                    className="h-1.5 w-1.5 rounded-full bg-gold"
                  />
                )}
                {authorTier && authorTier !== "member" && (
                  <TierBadge tier={authorTier as TierName} size="sm" showLabel={false} />
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{formatDistanceToNow(new Date(createdAt), { addSuffix: false })}</span>
                {venueName && (
                  <>
                    <span aria-hidden className="opacity-40">·</span>
                    <button
                      type="button"
                      onClick={onVenueClick}
                      className={[
                        "inline-flex items-center gap-1 truncate rounded-md transition-colors duration-fast",
                        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        venueCheckedIn ? "text-success" : "text-primary",
                      ].join(" ")}
                    >
                      {venueCheckedIn && (
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      )}
                      <span className="truncate">{venueName}</span>
                    </button>
                  </>
                )}
              </div>
              {taggedUsers.length > 0 && (
                <div className="mt-1">
                  <TaggedUsersDisplay users={taggedUsers} maxDisplay={5} size="sm" />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            aria-label="Post options"
            className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </header>

        {/* ── Caption — content first ──────────────────────────── */}
        <div className="px-4 pb-3">
          <TranslatedText
            text={content}
            contentId={id}
            contentType="post"
            sourceLang={sourceLanguage}
            sourceConfidence={sourceConfidence ?? undefined}
          >
            {(resolved) => <ClampedCaption text={resolved} />}
          </TranslatedText>
        </div>

        {/* ── Media — anchored, quietly separated ─────────────── */}
        {hasMedia && (
          <div className="relative overflow-hidden border-y border-border/40 bg-muted">
            <MediaFrame
              imageUrl={imageUrl}
              videoUrl={videoUrl}
              aspectRatio="9/16"
              showPlayButton={!!videoUrl}
              autoPlay={false}
            />
          </div>
        )}

        {/* ── Actions — tactile, instant ───────────────────────── */}
        <div className="flex items-center gap-0.5 px-2 pt-2 pb-1">
          <ActionButton
            ariaLabel="Pound this post"
            onClick={handlePound}
            active={isPounding}
            variant="pound"
          >
            <FistPoundIcon className="h-5 w-5" filled={isPounding} />
          </ActionButton>
          <ActionButton ariaLabel="Comment" onClick={onComment}>
            <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
          </ActionButton>
          <ActionButton ariaLabel="Share" onClick={onShare}>
            <Share2 className="h-5 w-5" strokeWidth={1.75} />
          </ActionButton>
        </div>

        {/* ── Stats — secondary, IG-style ──────────────────────── */}
        <div className="px-4 pb-3.5 text-sm leading-tight">
          <span className="font-semibold tabular-nums text-foreground">
            {poundsCount.toLocaleString()}
          </span>{" "}
          <span className="text-muted-foreground">{t("posts.pounds")}</span>
          <span className="mx-2 text-muted-foreground/60">·</span>
          <span className="font-semibold tabular-nums text-foreground">
            {commentsCount.toLocaleString()}
          </span>{" "}
          <span className="text-muted-foreground">{t("posts.comments")}</span>
        </div>
      </article>
    </>
  );
};

/* ── Local primitives ─────────────────────────────────────────────────── */

interface ActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  active?: boolean;
  variant?: "pound" | "default";
}

const ActionButton = ({
  children,
  onClick,
  ariaLabel,
  active = false,
  variant = "default",
}: ActionButtonProps) => {
  const isPoundActive = active && variant === "pound";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      className={[
        "relative inline-flex items-center justify-center rounded-full p-2.5",
        "transition-colors duration-fast",
        "hover:bg-muted active:bg-muted active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isPoundActive
          ? "text-pink"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {isPoundActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-pink/20 animate-ping"
        />
      )}
      <span className="relative flex items-center justify-center">{children}</span>
    </button>
  );
};

export default PostCard;
