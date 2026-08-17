/**
 * Translation-related TypeScript types
 */

// Translation request/response types
export interface TranslationRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  contentType: 'post' | 'message' | 'venue' | 'comment';
  userId?: string;
  contentId?: string;
  metadata?: Record<string, any>;
}

export interface TranslationResponse {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
  fromCache: boolean;
  cacheKey?: string;
  serviceUsed?: string;
}

// Batch translation types
export interface BatchTranslationRequest {
  requests: TranslationRequest[];
  priority?: number;
}

export interface BatchTranslationResponse {
  results: TranslationResponse[];
  totalProcessed: number;
  fromCacheCount: number;
  averageConfidence: number;
}

// User translation preferences
export interface UserTranslationPreferences {
  autoTranslate: boolean;
  preferredLanguages: string[];
  alwaysShowOriginal: boolean;
  translationQuality: 'fast' | 'balanced' | 'high_quality';
  cacheEnabled: boolean;
}

// Content translation status
export interface ContentTranslationStatus {
  contentId: string;
  contentType: string;
  sourceLanguage: string;
  translatedLanguages: string[];
  lastUpdated: Date | null;
  needsUpdate: boolean;
  confidence: number;
}

// AI translation context
export interface AITranslationContext {
  userLanguage: string;
  conversationLanguage: string;
  translationEnabled: boolean;
  autoDetect: boolean;
  preserveOriginal: boolean;
}

// Helper types for UI components
export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  locale: string;
  supported: boolean;
}

export interface TranslationProgress {
  total: number;
  completed: number;
  failed: number;
  estimatedTimeRemaining: number;
}
