/**
 * Translation Quality Control
 * Validates translation accuracy and quality
 */

// Types
export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: ValidationIssue[];
  suggestions: string[];
}

export interface ValidationIssue {
  type: 'length_mismatch' | 'special_chars' | 'urls' | 'mentions' | 'hashtags' | 'formatting' | 'language_mismatch';
  severity: 'low' | 'medium' | 'high';
  message: string;
  position?: number;
}

export interface ValidationOptions {
  minConfidence?: number;
  maxLengthRatio?: number;
  preserveSpecialChars?: boolean;
  preserveUrls?: boolean;
  preserveMentions?: boolean;
  preserveHashtags?: boolean;
  checkLanguage?: boolean;
}

// Default configuration
const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  minConfidence: 0.5,
  maxLengthRatio: 3.0, // Translated text shouldn't be more than 3x longer
  preserveSpecialChars: true,
  preserveUrls: true,
  preserveMentions: true,
  preserveHashtags: true,
  checkLanguage: true
};

/**
 * Validate translation quality
 */
export function validateTranslation(
  originalText: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
  options: ValidationOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];
  
  let confidence = 1.0;
  
  // 1. Check for empty translation
  if (!translatedText || translatedText.trim().length === 0) {
    issues.push({
      type: 'length_mismatch',
      severity: 'high',
      message: 'Translation is empty'
    });
    confidence = 0.0;
  }
  
  // 2. Check length ratio
  const originalLength = originalText.length;
  const translatedLength = translatedText.length;
  const lengthRatio = translatedLength / Math.max(originalLength, 1);
  
  if (lengthRatio > opts.maxLengthRatio) {
    issues.push({
      type: 'length_mismatch',
      severity: 'medium',
      message: `Translation is ${lengthRatio.toFixed(1)}x longer than original`
    });
    confidence *= 0.7;
  } else if (lengthRatio < 0.3 && originalLength > 10) {
    issues.push({
      type: 'length_mismatch',
      severity: 'medium',
      message: `Translation is ${lengthRatio.toFixed(1)}x shorter than original`
    });
    confidence *= 0.7;
  }
  
  // 3. Check for preserved special characters
  if (opts.preserveSpecialChars) {
    const specialChars = ['@', '#', '$', '%', '&', '*', '!', '?'];
    for (const char of specialChars) {
      const originalCount = (originalText.match(new RegExp(`\\${char}`, 'g')) || []).length;
      const translatedCount = (translatedText.match(new RegExp(`\\${char}`, 'g')) || []).length;
      
      if (Math.abs(originalCount - translatedCount) > 2) {
        issues.push({
          type: 'special_chars',
          severity: 'low',
          message: `Special character '${char}' count mismatch`
        });
        confidence *= 0.9;
      }
    }
  }
  
  // 4. Check for preserved URLs
  if (opts.preserveUrls) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const originalUrls = originalText.match(urlRegex) || [];
    const translatedUrls = translatedText.match(urlRegex) || [];
    
    if (originalUrls.length !== translatedUrls.length) {
      issues.push({
        type: 'urls',
        severity: 'medium',
        message: 'URL count mismatch in translation'
      });
      confidence *= 0.8;
    }
    
    // Check if URLs are intact
    for (const url of originalUrls) {
      if (!translatedText.includes(url)) {
        issues.push({
          type: 'urls',
          severity: 'high',
          message: `URL missing in translation: ${url.substring(0, 30)}...`
        });
        confidence *= 0.5;
      }
    }
  }
  
  // 5. Check for preserved mentions
  if (opts.preserveMentions) {
    const mentionRegex = /@(\w+)/g;
    const originalMentions = originalText.match(mentionRegex) || [];
    const translatedMentions = translatedText.match(mentionRegex) || [];
    
    if (originalMentions.length !== translatedMentions.length) {
      issues.push({
        type: 'mentions',
        severity: 'high',
        message: 'User mentions missing in translation'
      });
      confidence *= 0.6;
    }
  }
  
  // 6. Check for preserved hashtags
  if (opts.preserveHashtags) {
    const hashtagRegex = /#(\w+)/g;
    const originalHashtags = originalText.match(hashtagRegex) || [];
    const translatedHashtags = translatedText.match(hashtagRegex) || [];
    
    if (originalHashtags.length !== translatedHashtags.length) {
      issues.push({
        type: 'hashtags',
        severity: 'medium',
        message: 'Hashtag count mismatch in translation'
      });
      confidence *= 0.8;
    }
  }
  
  // 7. Check formatting preservation
  const originalLines = originalText.split('\n').length;
  const translatedLines = translatedText.split('\n').length;
  
  if (Math.abs(originalLines - translatedLines) > 2) {
    issues.push({
      type: 'formatting',
      severity: 'low',
      message: 'Line break formatting significantly changed'
    });
    confidence *= 0.9;
  }
  
  // 8. Language-specific validation
  if (opts.checkLanguage && sourceLanguage !== targetLanguage) {
    // Check for obvious translation failures
    const commonFailures = [
      { pattern: /\[untranslated\]/i, severity: 'high' as const },
      { pattern: /\[translation error\]/i, severity: 'high' as const },
      { pattern: /<.*>/i, severity: 'medium' as const }, // HTML tags
      { pattern: /&[a-z]+;/i, severity: 'medium' as const }, // HTML entities
    ];
    
    for (const failure of commonFailures) {
      if (failure.pattern.test(translatedText)) {
        issues.push({
          type: 'language_mismatch',
          severity: failure.severity,
          message: 'Translation contains error markers'
        });
        confidence *= failure.severity === 'high' ? 0.3 : 0.7;
      }
    }
  }
  
  // Generate suggestions based on issues
  if (issues.length > 0) {
    if (issues.some(i => i.severity === 'high')) {
      suggestions.push('Consider retrying translation with different service');
    }
    
    if (issues.some(i => i.type === 'urls' || i.type === 'mentions')) {
      suggestions.push('Ensure URLs and mentions are preserved in translation');
    }
    
    if (confidence < opts.minConfidence) {
      suggestions.push('Translation quality is low - consider using fallback');
    }
  }
  
  return {
    isValid: confidence >= opts.minConfidence,
    confidence,
    issues,
    suggestions
  };
}

/**
 * Heuristic check for translation quality
 */
export function heuristicQualityCheck(
  originalText: string,
  translatedText: string
): number {
  let score = 1.0;
  
  // 1. Length similarity score
  const lengthRatio = translatedText.length / Math.max(originalText.length, 1);
  if (lengthRatio > 5 || lengthRatio < 0.2) {
    score *= 0.3;
  } else if (lengthRatio > 3 || lengthRatio < 0.33) {
    score *= 0.7;
  } else if (lengthRatio > 2 || lengthRatio < 0.5) {
    score *= 0.9;
  }
  
  // 2. Word count similarity
  const originalWords = originalText.split(/\s+/).length;
  const translatedWords = translatedText.split(/\s+/).length;
  const wordRatio = translatedWords / Math.max(originalWords, 1);
  
  if (wordRatio > 4 || wordRatio < 0.25) {
    score *= 0.4;
  } else if (wordRatio > 2 || wordRatio < 0.5) {
    score *= 0.8;
  }
  
  // 3. Special character preservation
  const specialChars = ['@', '#', '$', '%'];
  for (const char of specialChars) {
    const originalCount = (originalText.match(new RegExp(`\\${char}`, 'g')) || []).length;
    const translatedCount = (translatedText.match(new RegExp(`\\${char}`, 'g')) || []).length;
    
    if (originalCount > 0 && translatedCount === 0) {
      score *= 0.6; // Special characters missing
    }
  }
  
  // 4. URL preservation
  const urlRegex = /https?:\/\/[^\s]+/g;
  const originalUrls = originalText.match(urlRegex) || [];
  const translatedUrls = translatedText.match(urlRegex) || [];
  
  if (originalUrls.length > translatedUrls.length) {
    score *= 0.5; // URLs missing
  }
  
  // 5. Check for error markers
  const errorMarkers = [
    /\[untranslated\]/i,
    /\[translation error\]/i,
    /failed to translate/i,
    /translation failed/i
  ];
  
  for (const marker of errorMarkers) {
    if (marker.test(translatedText)) {
      score *= 0.2; // Clear error marker
    }
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Decide if translation should be retried
 */
export function shouldRetryTranslation(
  validationResult: ValidationResult,
  retryCount: number = 0,
  maxRetries: number = 2
): boolean {
  if (retryCount >= maxRetries) {
    return false;
  }
  
  // Always retry on high severity issues
  if (validationResult.issues.some(issue => issue.severity === 'high')) {
    return true;
  }
  
  // Retry if confidence is too low
  if (validationResult.confidence < 0.3) {
    return true;
  }
  
  // Retry if translation is empty
  if (validationResult.issues.some(issue => 
    issue.type === 'length_mismatch' && issue.message.includes('empty')
  )) {
    return true;
  }
  
  return false;
}

/**
 * Get fallback text based on validation results
 */
export function getFallbackText(
  originalText: string,
  translatedText: string,
  validationResult: ValidationResult,
  fallbackChain: string[] = ['en']
): string {
  // If translation is valid, use it
  if (validationResult.isValid) {
    return translatedText;
  }
  
  // If we have high confidence issues, fallback to original
  if (validationResult.issues.some(issue => issue.severity === 'high')) {
    return originalText;
  }
  
  // For medium issues, we might still use the translation
  // but add a quality indicator
  if (validationResult.confidence >= 0.5) {
    return translatedText;
  }
  
  // Low confidence - use original
  return originalText;
}

/**
 * Log translation quality issues for monitoring
 */
export function logTranslationIssue(
  originalText: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
  validationResult: ValidationResult,
  serviceUsed: string
): void {
  if (validationResult.issues.length === 0) {
    return;
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    sourceLanguage,
    targetLanguage,
    serviceUsed,
    confidence: validationResult.confidence,
    issues: validationResult.issues.map(issue => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message
    })),
    originalLength: originalText.length,
    translatedLength: translatedText.length,
    lengthRatio: translatedText.length / Math.max(originalText.length, 1)
  };
  
  // In production, this would send to monitoring service
  console.warn('Translation quality issue:', logEntry);
}

/**
 * Batch validate multiple translations
 */
export function batchValidateTranslations(
  items: Array<{
    originalText: string;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
  }>,
  options: ValidationOptions = {}
): ValidationResult[] {
  return items.map(item => 
    validateTranslation(
      item.originalText,
      item.translatedText,
      item.sourceLanguage,
      item.targetLanguage,
      options
    )
  );
}