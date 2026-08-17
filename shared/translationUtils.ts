/**
 * Universal Content Translation System
 * Shared utilities for language detection and translation
 */

// Supported languages for translation (priority order)
export const PRIORITY_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja', 'ko', 'zh'] as const;

// Language detection confidence thresholds
export const LANGUAGE_CONFIDENCE = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3
} as const;

// Translation cache TTL (in milliseconds)
export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000, // 5 minutes for messages
  MEDIUM: 30 * 60 * 1000, // 30 minutes for posts
  LONG: 24 * 60 * 60 * 1000 // 24 hours for venues
} as const;

/**
 * Language detector using enhanced detection with confidence scoring
 */
export async function detectLanguage(text: string): Promise<string> {
  const { detectLanguageWithConfidence } = await import('./languageDetection');
  
  const result = await detectLanguageWithConfidence(text, {
    minConfidence: 0.3,
    fallbackLanguage: 'en'
  });
  
  return result.language;
}

/**
 * Detect language with confidence scoring
 */
export async function detectLanguageWithConfidence(
  text: string,
  options?: { minConfidence?: number; fallbackLanguage?: string }
): Promise<{ language: string; confidence: number }> {
  const { detectLanguageWithConfidence: detect } = await import('./languageDetection');
  
  const result = await detect(text, options);
  
  return {
    language: result.language,
    confidence: result.confidence
  };
}

/**
 * Get target languages for content based on user preferences
 */
export function getTargetLanguages(
  sourceLanguage: string,
  userLanguage?: string
): string[] {
  const targets = new Set<string>();
  
  // Always include English as fallback
  if (sourceLanguage !== 'en') {
    targets.add('en');
  }
  
  // Add user's preferred language if different from source
  if (userLanguage && userLanguage !== sourceLanguage) {
    targets.add(userLanguage);
  }
  
  // Add Spanish if not already included (major global language)
  if (sourceLanguage !== 'es' && userLanguage !== 'es') {
    targets.add('es');
  }
  
  return Array.from(targets);
}

/**
 * Check if translation should be attempted
 */
export function shouldTranslate(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): boolean {
  // Don't translate empty text
  if (!text || text.trim().length === 0) {
    return false;
  }
  
  // Don't translate to same language
  if (sourceLanguage === targetLanguage) {
    return false;
  }
  
  // Don't translate very short text (likely not meaningful)
  if (text.trim().length < 3) {
    return false;
  }
  
  // Don't translate URLs, emails, etc.
  const urlPattern = /https?:\/\/[^\s]+/;
  const emailPattern = /\S+@\S+\.\S+/;
  
  if (urlPattern.test(text) || emailPattern.test(text)) {
    return false;
  }
  
  return true;
}

/**
 * Generate cache key for translation
 */
export function generateCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): string {
  const normalizedText = text.trim().toLowerCase();
  return `${sourceLanguage}:${targetLanguage}:${normalizedText}`;
}

/**
 * Extract text that needs translation (exclude mentions, hashtags, URLs)
 */
export function extractTranslatableText(text: string): {
  translatable: string;
  metadata: Array<{ type: 'mention' | 'hashtag' | 'url'; value: string; position: number }>;
} {
  const mentions: Array<{ type: 'mention'; value: string; position: number }> = [];
  const hashtags: Array<{ type: 'hashtag'; value: string; position: number }> = [];
  const urls: Array<{ type: 'url'; value: string; position: number }> = [];
  
  // Extract mentions (@username)
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      type: 'mention',
      value: match[0],
      position: match.index
    });
  }
  
  // Extract hashtags (#tag)
  const hashtagRegex = /#(\w+)/g;
  while ((match = hashtagRegex.exec(text)) !== null) {
    hashtags.push({
      type: 'hashtag',
      value: match[0],
      position: match.index
    });
  }
  
  // Extract URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push({
      type: 'url',
      value: match[0],
      position: match.index
    });
  }
  
  // Sort metadata by position
  const metadata = [...mentions, ...hashtags, ...urls].sort((a, b) => a.position - b.position);
  
  return {
    translatable: text,
    metadata
  };
}

/**
 * Reconstruct text with metadata after translation
 */
export function reconstructText(
  translatedText: string,
  metadata: Array<{ type: 'mention' | 'hashtag' | 'url'; value: string; position: number }>
): string {
  // For now, return translated text as-is
  // In production, this would reinsert mentions, hashtags, URLs at appropriate positions
  return translatedText;
}

/**
 * Calculate translation priority based on content type and user engagement
 */
export function calculateTranslationPriority(
  contentType: 'post' | 'message' | 'venue' | 'comment',
  engagementScore: number = 0
): number {
  const basePriority = {
    'message': 90, // High priority for real-time communication
    'comment': 80, // High priority for discussions
    'post': 70,    // Medium priority for feed content
    'venue': 60    // Lower priority for static content
  }[contentType];
  
  // Boost priority based on engagement
  const engagementBoost = Math.min(engagementScore * 10, 20);
  
  return basePriority + engagementBoost;
}

/**
 * Validate language code
 */
export function isValidLanguageCode(code: string): boolean {
  const validCodes = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'sv', 'nl', 'ja', 'ko', 'zh', 'zh-TW', 'ar', 'hi', 'th', 'vi', 'id', 'tl', 'tr'];
  return validCodes.includes(code);
}

/**
 * Get language name from code
 */
export function getLanguageName(code: string): string {
  const languageNames: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'sv': 'Swedish',
    'nl': 'Dutch',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'zh-TW': 'Chinese (Traditional)',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'id': 'Indonesian',
    'tl': 'Filipino',
    'tr': 'Turkish',
  };
  
  return languageNames[code] || 'Unknown';
}