/**
 * Smart Translation Strategy
 * Optimizes translation for cost, performance, and user experience
 */

import { createHash } from 'crypto';

// Types
export interface TranslationStrategy {
  autoTranslateLanguages: string[];
  onDemandLanguages: string[];
  priorityWeights: {
    popularity: number;
    proximity: number;
    engagement: number;
  };
  cacheStrategy: {
    memoryTTL: number;
    databaseTTL: number;
    contentTTL: number;
  };
}

export interface ContentMetadata {
  id: string;
  type: 'post' | 'message' | 'venue' | 'comment';
  popularity?: number; // Views, likes, etc.
  proximity?: number; // Distance from user (0-1)
  engagement?: number; // Comments, shares, etc.
  createdAt: Date;
  authorId?: string;
}

export interface TranslationDecision {
  shouldTranslate: boolean;
  priority: number;
  targetLanguages: string[];
  reason: string;
  estimatedCost: number;
}

// Configuration
export const STRATEGY_CONFIG: TranslationStrategy = {
  // Only auto-translate these languages on content creation
  autoTranslateLanguages: ['en', 'es'],
  
  // Translate these languages on-demand based on viewer
  onDemandLanguages: ['fr', 'de', 'it', 'pt', 'ru', 'sv', 'nl', 'ja', 'ko', 'zh', 'ar', 'hi'],
  
  // Priority scoring weights (sum to 1.0)
  priorityWeights: {
    popularity: 0.4,
    proximity: 0.3,
    engagement: 0.3
  },
  
  // Cache TTL in milliseconds
  cacheStrategy: {
    memoryTTL: 5 * 60 * 1000, // 5 minutes
    databaseTTL: 24 * 60 * 60 * 1000, // 24 hours
    contentTTL: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

/**
 * Decide if and how to translate content
 */
export function makeTranslationDecision(
  content: {
    text: string;
    sourceLanguage: string;
    metadata: ContentMetadata;
  },
  viewerLanguage?: string,
  viewerCountry?: string
): TranslationDecision {
  const { text, sourceLanguage, metadata } = content;
  
  // 1. Check if translation is needed
  if (!shouldTranslateText(text, sourceLanguage)) {
    return {
      shouldTranslate: false,
      priority: 0,
      targetLanguages: [],
      reason: 'Text does not require translation',
      estimatedCost: 0
    };
  }
  
  // 2. Determine target languages
  const targetLanguages = determineTargetLanguages(
    sourceLanguage,
    viewerLanguage,
    viewerCountry,
    metadata.type
  );
  
  if (targetLanguages.length === 0) {
    return {
      shouldTranslate: false,
      priority: 0,
      targetLanguages: [],
      reason: 'No target languages needed',
      estimatedCost: 0
    };
  }
  
  // 3. Calculate translation priority
  const priority = calculateTranslationPriority(metadata);
  
  // 4. Estimate cost (simplified - characters * languages)
  const estimatedCost = estimateTranslationCost(text, targetLanguages.length);
  
  // 5. Make final decision
  const shouldTranslate = priority > 0.3 || targetLanguages.includes('en');
  
  return {
    shouldTranslate,
    priority,
    targetLanguages,
    reason: shouldTranslate 
      ? `Translate to ${targetLanguages.join(', ')} (priority: ${priority.toFixed(2)})`
      : 'Priority too low for translation',
    estimatedCost
  };
}

/**
 * Determine which languages to translate to
 */
function determineTargetLanguages(
  sourceLanguage: string,
  viewerLanguage?: string,
  viewerCountry?: string,
  contentType?: string
): string[] {
  const targets = new Set<string>();
  
  // Always include English as global fallback (if not source)
  if (sourceLanguage !== 'en') {
    targets.add('en');
  }
  
  // Add viewer's language if different from source
  if (viewerLanguage && viewerLanguage !== sourceLanguage) {
    targets.add(viewerLanguage);
  }
  
  // For posts, auto-translate Spanish (major market)
  if (contentType === 'post' && sourceLanguage !== 'es') {
    targets.add('es');
  }
  
  // Add regional language based on viewer country
  if (viewerCountry) {
    const regionalLang = getRegionalLanguage(viewerCountry);
    if (regionalLang && regionalLang !== sourceLanguage) {
      targets.add(regionalLang);
    }
  }
  
  // Limit to reasonable number of translations
  const maxTranslations = contentType === 'post' ? 3 : 2;
  const targetArray = Array.from(targets);
  
  return targetArray.slice(0, maxTranslations);
}

/**
 * Get regional language based on country code
 */
function getRegionalLanguage(countryCode: string): string | null {
  const regionalMap: Record<string, string> = {
    // Americas
    'us': 'en',
    'ca': 'en',
    'mx': 'es',
    'br': 'pt',
    'ar': 'es',
    'co': 'es',
    'pe': 'es',
    'cl': 'es',
    
    // Europe
    'gb': 'en',
    'fr': 'fr',
    'de': 'de',
    'it': 'it',
    'es': 'es',
    'pt': 'pt',
    'ru': 'ru',
    'nl': 'nl',
    
    // Asia
    'jp': 'ja',
    'kr': 'ko',
    'cn': 'zh',
    'in': 'hi',
    'id': 'id',
    'th': 'th',
    'vn': 'vi',
    
    // Middle East
    'sa': 'ar',
    'ae': 'ar',
    'eg': 'ar',
    
    // Oceania
    'au': 'en',
    'nz': 'en'
  };
  
  return regionalMap[countryCode.toLowerCase()] || null;
}

/**
 * Calculate translation priority based on content metadata
 */
function calculateTranslationPriority(metadata: ContentMetadata): number {
  let score = 0;
  
  // Popularity score (views, likes)
  if (metadata.popularity !== undefined) {
    const popularityScore = Math.min(metadata.popularity / 1000, 1);
    score += popularityScore * STRATEGY_CONFIG.priorityWeights.popularity;
  }
  
  // Proximity score (closer = higher priority)
  if (metadata.proximity !== undefined) {
    score += metadata.proximity * STRATEGY_CONFIG.priorityWeights.proximity;
  }
  
  // Engagement score (comments, shares)
  if (metadata.engagement !== undefined) {
    const engagementScore = Math.min(metadata.engagement / 100, 1);
    score += engagementScore * STRATEGY_CONFIG.priorityWeights.engagement;
  }
  
  // Boost for new content (first 24 hours)
  const ageHours = (Date.now() - metadata.createdAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < 24) {
    const recencyBoost = 1 - (ageHours / 24);
    score += recencyBoost * 0.2;
  }
  
  // Content type modifier
  const typeModifier = {
    'post': 1.0,
    'message': 0.8,
    'comment': 0.7,
    'venue': 0.5
  }[metadata.type] || 0.5;
  
  return Math.min(score * typeModifier, 1.0);
}

/**
 * Check if text should be translated
 */
function shouldTranslateText(text: string, sourceLanguage: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }
  
  // Don't translate very short text
  if (text.trim().length < 3) {
    return false;
  }
  
  // Don't translate URLs only
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) || [];
  if (urls.length > 0 && text.trim().replace(urlRegex, '').trim().length === 0) {
    return false;
  }
  
  // Don't translate emoji-only content
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
  const emojis = text.match(emojiRegex) || [];
  if (emojis.length > 0 && text.replace(emojiRegex, '').trim().length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Estimate translation cost (simplified)
 */
function estimateTranslationCost(text: string, languageCount: number): number {
  // Simplified cost model: characters * languages * cost per character
  const characterCount = text.length;
  const costPerCharacter = 0.00002; // Example: $0.00002 per character
  
  return characterCount * languageCount * costPerCharacter;
}

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(text: string, sourceLanguage: string): string {
  const normalizedText = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  
  const hashInput = `${sourceLanguage}:${normalizedText}`;
  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Check if identical content already translated
 */
export function findExistingTranslation(
  contentHash: string,
  targetLanguage: string
): string | null {
  // In production, this would query the translation cache table
  // For now, return null (implementation would be in database layer)
  return null;
}

/**
 * Get cache key for translation
 */
export function getCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): string {
  const normalizedText = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  
  return `${sourceLanguage}:${targetLanguage}:${normalizedText}`;
}

/**
 * Decide cache TTL based on content type and priority
 */
export function getCacheTTL(
  contentType: 'post' | 'message' | 'venue' | 'comment',
  priority: number
): number {
  const baseTTL = STRATEGY_CONFIG.cacheStrategy.contentTTL;
  
  // Adjust TTL based on content type
  const typeMultiplier = {
    'post': 1.0,
    'message': 0.2, // Shorter TTL for messages
    'comment': 0.5,
    'venue': 2.0 // Longer TTL for venue info
  }[contentType] || 1.0;
  
  // Adjust based on priority (higher priority = longer cache)
  const priorityMultiplier = 0.5 + (priority * 0.5);
  
  return baseTTL * typeMultiplier * priorityMultiplier;
}

/**
 * Batch translation decisions for multiple content items
 */
export function batchMakeDecisions(
  items: Array<{
    text: string;
    sourceLanguage: string;
    metadata: ContentMetadata;
  }>,
  viewerLanguage?: string,
  viewerCountry?: string
): TranslationDecision[] {
  return items.map(item => 
    makeTranslationDecision(item, viewerLanguage, viewerCountry)
  );
}

/**
 * Optimize translation batch based on priority and cost
 */
export function optimizeTranslationBatch(
  decisions: TranslationDecision[],
  maxCost: number = 1.0, // Maximum cost in currency units
  maxItems: number = 50
): TranslationDecision[] {
  // Sort by priority (descending)
  const sorted = [...decisions].sort((a, b) => b.priority - a.priority);
  
  let totalCost = 0;
  const optimized: TranslationDecision[] = [];
  
  for (const decision of sorted) {
    if (optimized.length >= maxItems) {
      break;
    }
    
    if (totalCost + decision.estimatedCost <= maxCost) {
      optimized.push(decision);
      totalCost += decision.estimatedCost;
    } else if (decision.priority > 0.7) {
      // High priority items get through even if over budget
      optimized.push(decision);
      totalCost += decision.estimatedCost;
    }
  }
  
  return optimized;
}