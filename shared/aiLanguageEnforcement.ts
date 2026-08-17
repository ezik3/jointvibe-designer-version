/**
 * AI Language Consistency Enforcement
 * Ensures AI always responds in user's preferred language
 */

import { detectLanguageWithConfidence } from './languageDetection';

// Types
export interface AIResponse {
  content: string;
  language: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface AIEnforcementConfig {
  minConfidence: number;
  maxRetries: number;
  fallbackLanguage: string;
  enableReprocessing: boolean;
  logMismatches: boolean;
}

export interface EnforcementResult {
  response: string;
  language: string;
  confidence: number;
  wasCorrected: boolean;
  correctionReason?: string;
  retryCount: number;
}

// Default configuration
const DEFAULT_CONFIG: Required<AIEnforcementConfig> = {
  minConfidence: 0.7,
  maxRetries: 2,
  fallbackLanguage: 'en',
  enableReprocessing: true,
  logMismatches: true
};

/**
 * Enforce AI response language consistency
 */
export async function enforceAILanguage(
  aiResponse: string,
  targetLanguage: string,
  config: Partial<AIEnforcementConfig> = {}
): Promise<EnforcementResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  let retryCount = 0;
  let currentResponse = aiResponse;
  
  while (retryCount <= opts.maxRetries) {
    // Detect language of current response
    const detection = await detectLanguageWithConfidence(currentResponse, {
      minConfidence: opts.minConfidence,
      fallbackLanguage: targetLanguage
    });
    
    // Check if language matches target
    const languageMatches = detection.language === targetLanguage;
    const confidenceHigh = detection.confidence >= opts.minConfidence;
    
    if (languageMatches && confidenceHigh) {
      // Language is correct and confidence is high
      return {
        response: currentResponse,
        language: detection.language,
        confidence: detection.confidence,
        wasCorrected: retryCount > 0,
        correctionReason: retryCount > 0 ? 'Reprocessed to match target language' : undefined,
        retryCount
      };
    }
    
    // Language mismatch or low confidence
    if (opts.logMismatches) {
      logLanguageMismatch({
        targetLanguage,
        detectedLanguage: detection.language,
        confidence: detection.confidence,
        response: currentResponse,
        retryCount
      });
    }
    
    // If we've reached max retries, apply fallback
    if (retryCount >= opts.maxRetries) {
      return applyLanguageFallback(currentResponse, targetLanguage, detection, retryCount);
    }
    
    // Try to reprocess if enabled
    if (opts.enableReprocessing) {
      currentResponse = await reprocessAIResponse(currentResponse, targetLanguage, retryCount);
      retryCount++;
    } else {
      // Reprocessing disabled, use fallback
      return applyLanguageFallback(currentResponse, targetLanguage, detection, retryCount);
    }
  }
  
  // Should never reach here, but just in case
  return {
    response: aiResponse,
    language: targetLanguage,
    confidence: 0.1,
    wasCorrected: false,
    retryCount
  };
}

/**
 * Apply language fallback strategies
 */
async function applyLanguageFallback(
  response: string,
  targetLanguage: string,
  detection: { language: string; confidence: number },
  retryCount: number
): Promise<EnforcementResult> {
  // Strategy 1: If confidence is decent, use as-is with warning
  if (detection.confidence >= 0.5) {
    return {
      response,
      language: detection.language,
      confidence: detection.confidence,
      wasCorrected: false,
      correctionReason: 'Using detected language (fallback)',
      retryCount
    };
  }
  
  // Strategy 2: Try to translate to target language
  try {
    const translated = await translateToLanguage(response, detection.language, targetLanguage);
    
    return {
      response: translated,
      language: targetLanguage,
      confidence: 0.8, // Assume translation is good
      wasCorrected: true,
      correctionReason: 'Translated to target language',
      retryCount
    };
  } catch (error) {
    // Strategy 3: Return original with low confidence
    return {
      response,
      language: detection.language,
      confidence: 0.2,
      wasCorrected: false,
      correctionReason: 'Translation failed, using original',
      retryCount
    };
  }
}

/**
 * Reprocess AI response to match target language
 */
async function reprocessAIResponse(
  response: string,
  targetLanguage: string,
  attempt: number
): Promise<string> {
  // Different strategies based on attempt number
  switch (attempt) {
    case 0:
      // First retry: Simple instruction prepend
      return `Please respond in ${targetLanguage} only: ${response}`;
      
    case 1:
      // Second retry: More explicit instruction
      return `IMPORTANT: The following text must be in ${targetLanguage} language. Rewrite it in ${targetLanguage}: "${response}"`;
      
    default:
      // Subsequent retries: Return original (will be handled by fallback)
      return response;
  }
}

/**
 * Translate text to target language
 */
async function translateToLanguage(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  // This would integrate with the translation service
  // For now, return a placeholder
  return `[Translated to ${targetLanguage}] ${text}`;
}

/**
 * Log language mismatches for monitoring
 */
function logLanguageMismatch(data: {
  targetLanguage: string;
  detectedLanguage: string;
  confidence: number;
  response: string;
  retryCount: number;
}): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: 'ai_language_mismatch',
    severity: data.confidence < 0.3 ? 'high' : data.confidence < 0.7 ? 'medium' : 'low',
    data: {
      targetLanguage: data.targetLanguage,
      detectedLanguage: data.detectedLanguage,
      confidence: data.confidence,
      responseLength: data.response.length,
      retryCount: data.retryCount,
      sample: data.response.substring(0, 100)
    }
  };
  
  // In production, send to monitoring service
  console.warn('AI language mismatch:', logEntry);
}

/**
 * Validate AI input language and prepare for processing
 */
export async function validateAIInput(
  userInput: string,
  userLanguage: string
): Promise<{
  processedInput: string;
  detectedLanguage: string;
  confidence: number;
  requiresTranslation: boolean;
}> {
  // Detect input language
  const detection = await detectLanguageWithConfidence(userInput, {
    minConfidence: 0.3,
    fallbackLanguage: userLanguage
  });
  
  // Check if translation is needed
  const requiresTranslation = detection.language !== 'en' && userLanguage !== 'en';
  
  // Prepare input for AI
  let processedInput = userInput;
  
  if (requiresTranslation) {
    // Add language context for AI
    processedInput = `[User message in ${detection.language}, please understand and respond in ${userLanguage}]: ${userInput}`;
  } else if (detection.language !== userLanguage) {
    // Different languages but one is English
    processedInput = `[User message in ${detection.language}]: ${userInput}`;
  }
  
  return {
    processedInput,
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    requiresTranslation
  };
}

/**
 * Batch enforce language consistency for multiple AI responses
 */
export async function batchEnforceAILanguage(
  responses: Array<{ content: string; targetLanguage: string }>,
  config: Partial<AIEnforcementConfig> = {}
): Promise<EnforcementResult[]> {
  const results: EnforcementResult[] = [];
  
  // Process in batches to avoid overwhelming
  const batchSize = 5;
  for (let i = 0; i < responses.length; i += batchSize) {
    const batch = responses.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(response => enforceAILanguage(response.content, response.targetLanguage, config))
    );
    results.push(...batchResults);
    
    // Small delay between batches
    if (i + batchSize < responses.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Monitor AI language consistency over time
 */
export class AILanguageMonitor {
  private stats = {
    totalResponses: 0,
    correctLanguage: 0,
    correctedResponses: 0,
    failedCorrections: 0,
    averageConfidence: 0,
    languageDistribution: {} as Record<string, number>
  };
  
  /**
   * Update statistics with new enforcement result
   */
  updateStats(result: EnforcementResult): void {
    this.stats.totalResponses++;
    
    if (!result.wasCorrected && result.confidence >= DEFAULT_CONFIG.minConfidence) {
      this.stats.correctLanguage++;
    } else if (result.wasCorrected) {
      this.stats.correctedResponses++;
    } else {
      this.stats.failedCorrections++;
    }
    
    // Update average confidence
    this.stats.averageConfidence = 
      (this.stats.averageConfidence * (this.stats.totalResponses - 1) + result.confidence) / 
      this.stats.totalResponses;
    
    // Update language distribution
    this.stats.languageDistribution[result.language] = 
      (this.stats.languageDistribution[result.language] || 0) + 1;
  }
  
  /**
   * Get current statistics
   */
  getStats() {
    const accuracy = this.stats.totalResponses > 0 
      ? (this.stats.correctLanguage / this.stats.totalResponses) * 100 
      : 0;
    
    const correctionRate = this.stats.totalResponses > 0
      ? (this.stats.correctedResponses / this.stats.totalResponses) * 100
      : 0;
    
    return {
      ...this.stats,
      accuracy: `${accuracy.toFixed(1)}%`,
      correctionRate: `${correctionRate.toFixed(1)}%`,
      languageDistribution: Object.entries(this.stats.languageDistribution)
        .sort((a, b) => b[1] - a[1])
        .reduce((acc, [lang, count]) => ({
          ...acc,
          [lang]: count
        }), {})
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalResponses: 0,
      correctLanguage: 0,
      correctedResponses: 0,
      failedCorrections: 0,
      averageConfidence: 0,
      languageDistribution: {}
    };
  }
}

/**
 * Create AI prompt with language enforcement
 */
export function createLanguageEnforcedPrompt(
  userMessage: string,
  targetLanguage: string,
  conversationHistory?: string[]
): string {
  const basePrompt = `You are a multilingual AI assistant. The user prefers to communicate in ${targetLanguage}.

User's message: "${userMessage}"

${conversationHistory ? `Previous conversation:\n${conversationHistory.join('\n')}\n\n` : ''}

CRITICAL INSTRUCTIONS:
1. You MUST respond in ${targetLanguage} language ONLY
2. Do NOT include any other languages in your response
3. If the user's message is in a different language, understand it but respond in ${targetLanguage}
4. Maintain natural, conversational tone in ${targetLanguage}

Response:`;
  
  return basePrompt;
}