import React from "react";
import type { VenuePostIntentType } from "@/utils/venueInterestSignals";
import { useTranslation } from 'react-i18next';

interface VenueMentionTextProps {
  content: string;
  venueName?: string | null;
  intent?: VenuePostIntentType | null;
  className?: string;
}

function getIntentClass(intent?: VenuePostIntentType | null): string {
  if (intent === "currently_at") return "text-green-300 font-semibold";
  if (intent === "heading_there") return "text-amber-300 font-semibold";
  if (intent === "maybe_going") return "text-red-300 font-semibold";
  return "text-cyan-300 font-medium";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function VenueMentionText({
  content,
  venueName,
  intent,
  className,
}: VenueMentionTextProps) {
  const { t } = useTranslation('feed');
  if (!venueName) {
    return <span className={className}>{content}</span>;
  }

  const mention = `@${venueName}`;
  const mentionRegex = new RegExp(escapeRegex(mention), "ig");
  const match = mentionRegex.exec(content);

  if (!match || match.index < 0) {
    return <span className={className}>{content}</span>;
  }

  const start = match.index;
  const end = start + match[0].length;

  return (
    <span className={className}>
      {content.slice(0, start)}
      <span className={getIntentClass(intent)}>{content.slice(start, end)}</span>
      {content.slice(end)}
    </span>
  );
}
