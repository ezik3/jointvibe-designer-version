/**
 * useTranslatedText
 * Fetches a translated version of given text via the translate-content edge function.
 * Caches results in React Query so repeated calls (same text + target lang) are free.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

export type TranslatableContentType =
  | "post"
  | "comment"
  | "message"
  | "venue"
  | "order_message"
  | "live_chat_message"
  | "notification_title"
  | "notification_message"
  | "generic";

interface UseTranslatedTextArgs {
  text: string;
  contentId?: string;
  contentType?: TranslatableContentType;
  sourceLang?: string | null;
  sourceConfidence?: number | null;
  /** Override target language. Defaults to current i18n language. */
  targetLang?: string;
  /** Disable network call (e.g. user toggled "show original"). */
  enabled?: boolean;
}

export interface TranslatedTextResult {
  translatedText: string;
  sourceLang: string | null;
  targetLang: string;
  cached: boolean;
  skipped: boolean;
  isLoading: boolean;
  isError: boolean;
}

const MIN_TRANSLATABLE_LENGTH = 3;
const LS_PREFIX = "jv_tx_v1:";
const LS_MAX_BYTES = 8000;

type CachedTranslation = {
  translated_text: string;
  source_lang: string;
  target_lang: string;
  cached?: boolean;
  skipped?: boolean;
};

const lsKey = (
  contentType: string,
  contentId: string | undefined,
  text: string,
  target: string,
) => `${LS_PREFIX}${contentType}:${contentId ?? text.slice(0, 80)}:${target}`;

const readLS = (key: string): CachedTranslation | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CachedTranslation) : null;
  } catch {
    return null;
  }
};

const writeLS = (key: string, value: CachedTranslation) => {
  try {
    const payload = JSON.stringify(value);
    if (payload.length > LS_MAX_BYTES) return;
    localStorage.setItem(key, payload);
  } catch {
    // quota exceeded — ignore
  }
};

export function useTranslatedText({
  text,
  contentId,
  contentType = "generic",
  sourceLang,
  targetLang,
  enabled = true,
}: UseTranslatedTextArgs): TranslatedTextResult {
  const { i18n } = useTranslation();
  const target = (targetLang || i18n.language || "en").split("-")[0];
  const source = sourceLang ? sourceLang.split("-")[0] : null;

  const trimmed = (text || "").trim();
  const tooShort = trimmed.length < MIN_TRANSLATABLE_LENGTH;
  const sameLang = !!source && source === target;
  const shouldFetch = enabled && !tooShort && !sameLang && !!trimmed;

  const cacheKey = lsKey(contentType, contentId, trimmed, target);

  const query = useQuery({
    queryKey: ["content-translation", contentType, contentId ?? trimmed, target],
    enabled: shouldFetch,
    staleTime: 1000 * 60 * 60 * 6, // 6h in-memory
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    initialData: () => {
      const ls = readLS(cacheKey);
      return ls ? { ...ls, cached: true } : undefined;
    },
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("translate-content", {
        body: {
          content_id: contentId,
          content_type: contentType,
          source_lang: source,
          target_lang: target,
          original_text: trimmed,
        },
      });
      if (error) throw error;
      const result = data as CachedTranslation;
      if (result?.translated_text && !result.skipped) {
        writeLS(cacheKey, result);
      }
      return result;
    },
  });

  if (!shouldFetch) {
    return {
      translatedText: text,
      sourceLang: source,
      targetLang: target,
      cached: false,
      skipped: true,
      isLoading: false,
      isError: false,
    };
  }

  return {
    translatedText: query.data?.translated_text ?? text,
    sourceLang: query.data?.source_lang ?? source,
    targetLang: target,
    cached: !!query.data?.cached,
    skipped: !!query.data?.skipped,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
