import { useState } from "react";
import { useTranslation } from "react-i18next";
import TranslatedText from "@/components/i18n/TranslatedText";
import type { TranslatableContentType } from "@/hooks/useTranslatedText";

interface ClampedCaptionProps {
  text: string;
  maxLength?: number;
  className?: string;
  /** Optional translation hooks — when provided, the caption auto-translates. */
  contentId?: string;
  contentType?: TranslatableContentType;
  sourceLang?: string | null;
  sourceConfidence?: number | null;
}

/**
 * Caption with line-clamp-2 and "more" expand. Auto-translates when contentId is provided.
 */
const ClampedCaption = ({
  text,
  maxLength = 120,
  className = "",
  contentId,
  contentType = "post",
  sourceLang,
  sourceConfidence,
}: ClampedCaptionProps) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation("feed");

  const renderBody = (resolved: string) => {
    const isLong = resolved.length > maxLength;
    return (
      <>
        <p className={expanded ? "text-sm text-white/90 leading-relaxed whitespace-pre-wrap" : "text-sm text-white/90 leading-relaxed whitespace-pre-wrap line-clamp-2"}>
          {resolved}
        </p>
        {isLong && !expanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="text-xs text-white/50 hover:text-white/70 mt-0.5"
          >
            {t("posts.more")}
          </button>
        )}
      </>
    );
  };

  return (
    <div className={className}>
      {contentId ? (
        <TranslatedText
          text={text}
          contentId={contentId}
          contentType={contentType}
          sourceLang={sourceLang}
          sourceConfidence={sourceConfidence ?? undefined}
        >
          {renderBody}
        </TranslatedText>
      ) : (
        renderBody(text)
      )}
    </div>
  );
};

export default ClampedCaption;
