/**
 * Production-Grade Language Detection
 * Uses franc (lightweight) with fallback strategies
 */

// Types
export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  source: 'franc' | 'cld3' | 'keyword' | 'fallback';
  detectedText?: string;
}

export interface DetectionOptions {
  minConfidence?: number;
  fallbackLanguage?: string;
  enableKeywordFallback?: boolean;
  maxTextLength?: number;
}

// Default configuration
const DEFAULT_OPTIONS: Required<DetectionOptions> = {
  minConfidence: 0.3,
  fallbackLanguage: 'en',
  enableKeywordFallback: true,
  maxTextLength: 10000
};

/**
 * Enhanced language detection with confidence scoring
 */
export async function detectLanguageWithConfidence(
  text: string,
  options: DetectionOptions = {}
): Promise<LanguageDetectionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Validate input
  if (!text || text.trim().length === 0) {
    return {
      language: opts.fallbackLanguage,
      confidence: 1.0,
      source: 'fallback'
    };
  }
  
  // Truncate if too long
  const processedText = text.length > opts.maxTextLength 
    ? text.substring(0, opts.maxTextLength)
    : text;
  
  try {
    // Try franc first (lightweight, client-side compatible)
    const francResult = await detectWithFranc(processedText);
    
    if (francResult.confidence >= opts.minConfidence) {
      return francResult;
    }
    
    // Try keyword detection as fallback
    if (opts.enableKeywordFallback) {
      const keywordResult = detectWithKeywords(processedText);
      if (keywordResult.confidence >= opts.minConfidence) {
        return keywordResult;
      }
    }
    
    // Final fallback
    return {
      language: opts.fallbackLanguage,
      confidence: 0.1,
      source: 'fallback',
      detectedText: processedText
    };
    
  } catch (error) {
    console.error('Language detection failed:', error);
    return {
      language: opts.fallbackLanguage,
      confidence: 0.0,
      source: 'fallback',
      detectedText: processedText
    };
  }
}

/**
 * Detect language using franc (lightweight library)
 */
async function detectWithFranc(text: string): Promise<LanguageDetectionResult> {
  // Use keyword-based detection as primary method (franc removed)
  const keywordResult = detectWithKeywords(text);
  if (keywordResult.confidence >= 0.3) {
    return keywordResult;
  }
  throw new Error('Keyword detection insufficient confidence');
}

/**
 * Enhanced keyword detection with confidence scoring
 */
function detectWithKeywords(text: string): LanguageDetectionResult {
  const textLower = text.toLowerCase();
  const textLength = text.length;
  
  // Language patterns with weights
  const patterns: Array<{
    language: string;
    patterns: Array<{ pattern: string | RegExp; weight: number }>;
    baseConfidence: number;
  }> = [
    {
      language: 'es',
      patterns: [
        { pattern: /\b(hola|gracias|por favor|qué|cómo|dónde|buenos|noches|días)\b/i, weight: 2.0 },
        { pattern: /\b(el|la|los|las|un|una|unos|unas)\b/i, weight: 1.0 },
        { pattern: /[áéíóúñ]/i, weight: 3.0 }
      ],
      baseConfidence: 0.6
    },
    {
      language: 'fr',
      patterns: [
        { pattern: /\b(bonjour|merci|s'il vous plaît|comment|où|au revoir)\b/i, weight: 2.0 },
        { pattern: /\b(le|la|les|un|une|des)\b/i, weight: 1.0 },
        { pattern: /[àâçéèêëîïôûùüÿæœ]/i, weight: 3.0 }
      ],
      baseConfidence: 0.6
    },
    {
      language: 'de',
      patterns: [
        { pattern: /\b(hallo|danke|bitte|wie|wo|tschüss)\b/i, weight: 2.0 },
        { pattern: /\b(der|die|das|ein|eine|einen)\b/i, weight: 1.0 },
        { pattern: /[äöüß]/i, weight: 3.0 }
      ],
      baseConfidence: 0.6
    },
    {
      language: 'ja',
      patterns: [
        { pattern: /[\u3040-\u309F]/, weight: 4.0 }, // Hiragana
        { pattern: /[\u30A0-\u30FF]/, weight: 4.0 }, // Katakana
        { pattern: /[\u4E00-\u9FFF]/, weight: 2.0 }, // Kanji
        { pattern: /\b(こんにちは|ありがとう|お願いします|はい|いいえ)\b/, weight: 3.0 }
      ],
      baseConfidence: 0.8
    },
    {
      language: 'ko',
      patterns: [
        { pattern: /[\uAC00-\uD7AF]/, weight: 4.0 }, // Hangul
        { pattern: /\b(안녕하세요|감사합니다|부탁합니다|네|아니요)\b/, weight: 3.0 }
      ],
      baseConfidence: 0.8
    },
    {
      language: 'zh',
      patterns: [
        { pattern: /[\u4E00-\u9FFF]/, weight: 4.0 }, // Chinese characters
        { pattern: /\b(你好|谢谢|请|是的|不是)\b/, weight: 3.0 }
      ],
      baseConfidence: 0.8
    }
  ];
  
  // Calculate scores for each language
  const scores: Record<string, number> = {};
  
  for (const lang of patterns) {
    let score = lang.baseConfidence;
    
    for (const pattern of lang.patterns) {
      const matches = textLower.match(pattern.pattern);
      if (matches) {
        score += (matches.length * pattern.weight) / (textLength / 100);
      }
    }
    
    // Normalize score
    scores[lang.language] = Math.min(score, 1.0);
  }
  
  // Find best match
  let bestLanguage = 'en';
  let bestScore = 0.1; // Default low confidence for English
  
  for (const [language, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLanguage = language;
    }
  }
  
  // Check for mixed language content
  const hasMultipleLanguages = Object.values(scores).filter(s => s > 0.3).length > 1;
  if (hasMultipleLanguages) {
    bestScore *= 0.7; // Reduce confidence for mixed content
  }
  
  // Check for emoji/slang dominance
  const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  const emojiRatio = emojiCount / textLength;
  
  if (emojiRatio > 0.3) {
    // High emoji content - lower confidence
    bestScore *= 0.5;
  }
  
  // Check for very short text
  if (textLength < 10) {
    bestScore *= 0.6;
  }
  
  return {
    language: bestLanguage,
    confidence: Math.min(bestScore, 0.95),
    source: 'keyword',
    detectedText: text
  };
}

/**
 * Detect if text contains mixed languages
 */
export function detectMixedLanguage(text: string): {
  isMixed: boolean;
  primaryLanguage?: string;
  secondaryLanguages: string[];
} {
  const words = text.split(/\s+/);
  const languageCounts: Record<string, number> = {};
  
  // Simple word-level detection (simplified)
  for (const word of words) {
    if (word.length < 2) continue;
    
    // Check for language indicators in each word
    if (word.match(/[áéíóúñ]/i)) languageCounts.es = (languageCounts.es || 0) + 1;
    if (word.match(/[àâçéèêëîïôûùüÿæœ]/i)) languageCounts.fr = (languageCounts.fr || 0) + 1;
    if (word.match(/[äöüß]/i)) languageCounts.de = (languageCounts.de || 0) + 1;
    if (word.match(/[\u3040-\u309F\u30A0-\u30FF]/)) languageCounts.ja = (languageCounts.ja || 0) + 1;
    if (word.match(/[\uAC00-\uD7AF]/)) languageCounts.ko = (languageCounts.ko || 0) + 1;
    if (word.match(/[\u4E00-\u9FFF]/)) languageCounts.zh = (languageCounts.zh || 0) + 1;
  }
  
  const languages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
  
  return {
    isMixed: languages.length > 1,
    primaryLanguage: languages[0],
    secondaryLanguages: languages.slice(1)
  };
}

/**
 * Normalize text for better detection
 */
export function normalizeTextForDetection(text: string): string {
  if (!text) return '';
  
  let normalized = text;
  
  // Remove excessive whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Remove URLs
  normalized = normalized.replace(/https?:\/\/[^\s]+/g, '');
  
  // Remove email addresses
  normalized = normalized.replace(/\S+@\S+\.\S+/g, '');
  
  // Remove excessive punctuation (keep first of repeated punctuation)
  normalized = normalized.replace(/([!?.,])\1+/g, '$1');
  
  // Trim again
  normalized = normalized.trim();
  
  return normalized;
}

/**
 * Get appropriate fallback language based on context
 */
export function getFallbackLanguage(
  detectedLanguage: string,
  confidence: number,
  userLanguage?: string,
  minConfidence: number = 0.3
): string {
  if (confidence >= minConfidence) {
    return detectedLanguage;
  }
  
  // Fallback to user's preferred language
  if (userLanguage) {
    return userLanguage;
  }
  
  // Final fallback to English
  return 'en';
}

/**
 * Batch detect languages for multiple texts
 */
export async function batchDetectLanguages(
  texts: string[],
  options: DetectionOptions = {}
): Promise<LanguageDetectionResult[]> {
  const results: LanguageDetectionResult[] = [];
  
  // Process in batches to avoid overwhelming
  const batchSize = 10;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(text => detectLanguageWithConfidence(text, options))
    );
    results.push(...batchResults);
    
    // Small delay between batches
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  return results;
}