/**
 * TranslatedText
 * Renders user-generated content auto-translated into the viewer's language.
 * - Falls back to original while loading.
 * - Shows a small "Translated from X · See original" toggle below the text.
 */
import { useState, useMemo, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedText, TranslatableContentType } from "@/hooks/useTranslatedText";

interface TranslatedTextProps {
  text: string;
  contentId?: string;
  contentType?: TranslatableContentType;
  sourceLang?: string | null;
  sourceConfidence?: number | null;
  /** Render prop — control the wrapper. Receives the resolved string. */
  children?: (resolved: string) => ReactNode;
  /** Default wrapper className when not using render prop. */
  className?: string;
  /** Hide the "Translated from..." toggle. */
  hideToggle?: boolean;
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ar: "Arabic",
  ru: "Russian",
  hi: "Hindi",
};

const langLabel = (code?: string | null) => {
  if (!code) return "";
  const base = code.split("-")[0];
  return LANG_NAMES[base] ?? base.toUpperCase();
};

export function TranslatedText({
  text,
  contentId,
  contentType = "generic",
  sourceLang,
  sourceConfidence,
  children,
  className,
  hideToggle = false,
}: TranslatedTextProps) {
  const { t, i18n } = useTranslation("common");
  const [showOriginal, setShowOriginal] = useState(false);

  const { translatedText, sourceLang: resolvedSource, targetLang, isLoading, skipped } =
    useTranslatedText({
      text,
      contentId,
      contentType,
      sourceLang,
      sourceConfidence,
      enabled: !showOriginal,
    });

  const isTranslated = useMemo(() => {
    if (skipped || showOriginal) return false;
    if (!resolvedSource) return false;
    if (resolvedSource.split("-")[0] === targetLang) return false;
    return translatedText && translatedText !== text;
  }, [skipped, showOriginal, resolvedSource, targetLang, translatedText, text]);

  const displayed = showOriginal ? text : translatedText;

  const body = children ? children(displayed) : <span className={className}>{displayed}</span>;

  return (
    <>
      {body}
      {!hideToggle && isTranslated && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className="mt-1 block text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showOriginal
            ? t("translation.see_translation", { defaultValue: "See translation" })
            : t("translation.translated_from", {
                language: langLabel(resolvedSource),
                defaultValue: `Translated from ${langLabel(resolvedSource)} · See original`,
              })}
        </button>
      )}
      {!hideToggle && isLoading && !isTranslated && (
        <span className="sr-only">{t("app.loading")}</span>
      )}
    </>
  );
}

export default TranslatedText;
