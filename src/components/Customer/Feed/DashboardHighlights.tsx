import { ArrowRight, ArrowUpRight, Bookmark, CalendarDays, MapPin, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import "./DashboardHighlights.css";

export interface DashboardHighlightAction {
  href?: string;
  onClick?: () => void;
}

export interface DashboardFeaturedEvent extends DashboardHighlightAction {
  id: string;
  title: string;
  category: string;
  timeLabel: string;
  date: {
    day: string | number;
    month: string;
  };
  venueName: string;
  imageUrl?: string | null;
  attendeeCount?: number;
  isSaved?: boolean;
  onSave?: (event: DashboardFeaturedEvent) => void;
  viewLabel?: string;
}

export interface DashboardRecommendation extends DashboardHighlightAction {
  id: string;
  title: string;
  dateLabel: string;
  distanceLabel?: string;
  imageUrl?: string | null;
}

export interface DashboardHighlightsProps {
  featuredEvent?: DashboardFeaturedEvent | null;
  recommendations: readonly DashboardRecommendation[];
  kicker?: string;
  heading?: string;
  seeAllLabel?: string;
  seeAllHref?: string;
  onSeeAll?: () => void;
  className?: string;
}

interface ActionProps extends DashboardHighlightAction {
  className: string;
  children: React.ReactNode;
  ariaLabel?: string;
}

function Action({ href, onClick, className, children, ariaLabel }: ActionProps) {
  if (href) {
    return (
      <a className={className} href={href} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <button className={className} type="button" onClick={onClick} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }

  return <span className={className}>{children}</span>;
}

function RecommendationCard({ recommendation }: { recommendation: DashboardRecommendation }) {
  const meta = [recommendation.dateLabel, recommendation.distanceLabel].filter(Boolean).join(" \u00b7 ");
  const content = (
    <>
      <div className="customer-feed-highlights__recommendation-image">
        {recommendation.imageUrl ? (
          <img
            src={recommendation.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <CalendarDays aria-hidden="true" />
        )}
      </div>
      <h3>{recommendation.title}</h3>
      <p>
        <CalendarDays aria-hidden="true" />
        <span>{meta}</span>
      </p>
    </>
  );

  if (recommendation.href) {
    return (
      <a
        className="customer-feed-highlights__recommendation"
        href={recommendation.href}
        onClick={recommendation.onClick}
        aria-label={`Open ${recommendation.title}`}
      >
        {content}
      </a>
    );
  }

  if (recommendation.onClick) {
    return (
      <button
        className="customer-feed-highlights__recommendation"
        type="button"
        onClick={recommendation.onClick}
        aria-label={`Open ${recommendation.title}`}
      >
        {content}
      </button>
    );
  }

  return <article className="customer-feed-highlights__recommendation">{content}</article>;
}

export default function DashboardHighlights({
  featuredEvent,
  recommendations,
  kicker = "THIS WEEK",
  heading = "More to consider",
  seeAllLabel = "See all",
  seeAllHref,
  onSeeAll,
  className,
}: DashboardHighlightsProps) {
  const visibleRecommendations = recommendations.slice(0, 2);

  if (!featuredEvent && visibleRecommendations.length === 0) return null;

  return (
    <section className={cn("customer-feed-highlights", className)} aria-label="Event highlights">
      {featuredEvent && (
        <article className="customer-feed-highlights__featured">
          <div className="customer-feed-highlights__featured-image">
            {featuredEvent.imageUrl ? (
              <img
                src={featuredEvent.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <CalendarDays className="customer-feed-highlights__featured-image-fallback" aria-hidden="true" />
            )}
            <span className="customer-feed-highlights__image-overlay" aria-hidden="true" />
            <span className="customer-feed-highlights__date" aria-label={`${featuredEvent.date.day} ${featuredEvent.date.month}`}>
              <strong>{featuredEvent.date.day}</strong>
              <span>{featuredEvent.date.month}</span>
            </span>
            <button
              className={cn("customer-feed-highlights__save", featuredEvent.isSaved && "is-saved")}
              type="button"
              onClick={() => featuredEvent.onSave?.(featuredEvent)}
              aria-label={featuredEvent.isSaved ? `Unsave ${featuredEvent.title}` : `Save ${featuredEvent.title}`}
              aria-pressed={featuredEvent.isSaved ?? false}
              disabled={!featuredEvent.onSave}
            >
              <Bookmark aria-hidden="true" fill={featuredEvent.isSaved ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="customer-feed-highlights__featured-body">
            <div className="customer-feed-highlights__featured-meta">
              <span>{featuredEvent.category}</span>
              <span>{featuredEvent.timeLabel}</span>
            </div>
            <h2>{featuredEvent.title}</h2>
            <p className="customer-feed-highlights__venue">
              <MapPin aria-hidden="true" />
              <span>{featuredEvent.venueName}</span>
            </p>
            <div className="customer-feed-highlights__featured-footer">
              {featuredEvent.attendeeCount !== undefined && (
                <div className="customer-feed-highlights__attendees">
                  <UsersRound aria-hidden="true" />
                  <strong>{featuredEvent.attendeeCount} attending</strong>
                </div>
              )}
              <Action
                className="customer-feed-highlights__view-event"
                href={featuredEvent.href}
                onClick={featuredEvent.onClick}
                ariaLabel={`View ${featuredEvent.title}`}
              >
                <span>{featuredEvent.viewLabel ?? "View event"}</span>
                <ArrowUpRight aria-hidden="true" />
              </Action>
            </div>
          </div>
        </article>
      )}

      {visibleRecommendations.length > 0 && (
        <section className="customer-feed-highlights__recommendations" aria-labelledby="dashboard-highlights-heading">
          <div className="customer-feed-highlights__section-head">
            <div>
              <p>{kicker}</p>
              <h2 id="dashboard-highlights-heading">{heading}</h2>
            </div>
            <Action
              className="customer-feed-highlights__see-all"
              href={seeAllHref}
              onClick={onSeeAll}
              ariaLabel={seeAllLabel}
            >
              <span>{seeAllLabel}</span>
              <ArrowRight aria-hidden="true" />
            </Action>
          </div>
          <div className="customer-feed-highlights__recommendation-grid">
            {visibleRecommendations.map((recommendation) => (
              <RecommendationCard key={recommendation.id} recommendation={recommendation} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
