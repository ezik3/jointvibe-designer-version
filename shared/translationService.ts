/**
 * Translation Service
 * Handles translation requests with caching and fallback strategies
 */

import { createClient } from '@supabase/supabase-js';
import { 
  detectLanguage, 
  detectLanguageWithConfidence,
  getTargetLanguages, 
  shouldTranslate, 
  generateCacheKey,
  calculateTranslationPriority,
  isValidLanguageCode 
} from './translationUtils';
import { 
  validateTranslation,
  heuristicQualityCheck,
  shouldRetryTranslation,
  logTranslationIssue 
} from './translationValidation';
import {
  makeTranslationDecision,
  generateContentHash,
  findExistingTranslation,
  getCacheKey,
  getCacheTTL,
  STRATEGY_CONFIG
} from './smartTranslationStrategy';

// Types
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

export interface TranslationCacheEntry {
  id: string;
  translatedText: string;
  confidence: number;
  lastAccessed: Date;
  hitCount: number;
}

// Configuration
const CONFIG = {
  // In production, these would be environment variables
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  
  // Translation service configuration
  ENABLE_TRANSLATION: process.env.NEXT_PUBLIC_ENABLE_TRANSLATION === 'true',
  MAX_TEXT_LENGTH: 5000,
  BATCH_SIZE: 10,
  
  // Smart translation strategy
  AUTO_TRANSLATE_LANGUAGES: STRATEGY_CONFIG.autoTranslateLanguages,
  MIN_CONFIDENCE: 0.3,
  MAX_RETRIES: 2,
  
  // Quality control
  VALIDATE_TRANSLATIONS: true,
  MIN_QUALITY_SCORE: 0.5,
  LOG_QUALITY_ISSUES: true,
  
  // Fallback behavior
  FALLBACK_TO_ENGLISH: true,
  FALLBACK_TO_ORIGINAL: true,
  
  // Caching
  CACHE_ENABLED: true,
  MEMORY_CACHE_SIZE: 1000,
  DATABASE_CACHE_TTL: STRATEGY_CONFIG.cacheStrategy.databaseTTL
};

// Initialize Supabase client
const supabase = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY 
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

// Enhanced in-memory cache with LRU and statistics
class EnhancedTranslationCache {
  private cache = new Map<string, TranslationCacheEntry>();
  private accessOrder: string[] = []; // For LRU tracking
  private maxSize: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSize: 0
  };
  
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }
  
  get(key: string): TranslationCacheEntry | null {
    const entry = this.cache.get(key);
    
    if (entry) {
      // Update access order (move to end)
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
      
      // Update entry stats
      entry.lastAccessed = new Date();
      entry.hitCount++;
      this.cache.set(key, entry);
      
      this.stats.hits++;
      return entry;
    }
    
    this.stats.misses++;
    return null;
  }
  
  set(key: string, entry: TranslationCacheEntry): void {
    // Remove oldest entry if cache is full (LRU)
    if (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
    
    // Add new entry
    this.cache.set(key, entry);
    this.accessOrder.push(key);
    
    // Update size stats
    this.stats.totalSize += entry.translatedText.length;
  }
  
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0
    };
  }
  
  size(): number {
    return this.cache.size;
  }
  
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;
    
    return {
      size: this.size(),
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: `${hitRate.toFixed(1)}%`,
      totalSize: this.stats.totalSize,
      averageEntrySize: this.size() > 0 ? Math.round(this.stats.totalSize / this.size()) : 0
    };
  }
  
  // Get multiple entries at once
  batchGet(keys: string[]): Map<string, TranslationCacheEntry> {
    const results = new Map<string, TranslationCacheEntry>();
    
    for (const key of keys) {
      const entry = this.get(key);
      if (entry) {
        results.set(key, entry);
      }
    }
    
    return results;
  }
  
  // Remove expired entries (older than TTL)
  cleanup(ttlMs: number): number {
    const cutoff = Date.now() - ttlMs;
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed.getTime() < cutoff) {
        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        removed++;
      }
    }
    
    return removed;
  }
}

const memoryCache = new EnhancedTranslationCache(CONFIG.MEMORY_CACHE_SIZE);

/**
 * Main translation service
 */
export class TranslationService {
  private static instance: TranslationService;
  
  private constructor() {}
  
  static getInstance(): TranslationService {
    if (!TranslationService.instance) {
      TranslationService.instance = new TranslationService();
    }
    return TranslationService.instance;
  }
  
  /**
   * Translate text with smart strategy, caching, and quality control
   */
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    // Validate input
    if (!request.text || request.text.trim().length === 0) {
      return this.createEmptyResponse(request);
    }
    
    // Truncate text if too long
    const text = request.text.length > CONFIG.MAX_TEXT_LENGTH 
      ? request.text.substring(0, CONFIG.MAX_TEXT_LENGTH) + '...'
      : request.text;
    
    // Detect source language with confidence
    let sourceLanguage: string;
    let detectionConfidence = 1.0;
    
    if (request.sourceLanguage) {
      sourceLanguage = request.sourceLanguage;
    } else {
      const detection = await detectLanguageWithConfidence(text, {
        minConfidence: CONFIG.MIN_CONFIDENCE,
        fallbackLanguage: 'en'
      });
      sourceLanguage = detection.language;
      detectionConfidence = detection.confidence;
    }
    
    // Validate languages
    if (!isValidLanguageCode(sourceLanguage) || !isValidLanguageCode(request.targetLanguage)) {
      return this.createFallbackResponse(text, sourceLanguage, request.targetLanguage, 'Invalid language code');
    }
    
    // Use smart strategy to decide if translation is needed
    const shouldTranslateResult = this.shouldTranslateWithStrategy(
      text,
      sourceLanguage,
      request.targetLanguage,
      request.contentType,
      detectionConfidence
    );
    
    if (!shouldTranslateResult.shouldTranslate) {
      return this.createNoTranslationResponse(text, sourceLanguage, request.targetLanguage);
    }
    
    // Generate cache key using enhanced strategy
    const cacheKey = getCacheKey(text, sourceLanguage, request.targetLanguage);
    
    // Try memory cache first
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return {
        translatedText: cached.translatedText,
        sourceLanguage,
        targetLanguage: request.targetLanguage,
        confidence: cached.confidence,
        fromCache: true,
        cacheKey,
        serviceUsed: 'memory_cache'
      };
    }
    
    // Try database cache with deduplication
    const contentHash = generateContentHash(text, sourceLanguage);
    const existingTranslation = await this.findExistingTranslation(contentHash, request.targetLanguage);
    
    if (existingTranslation) {
      // Cache in memory for faster access
      memoryCache.set(cacheKey, {
        id: contentHash,
        translatedText: existingTranslation,
        confidence: 0.9, // Assume cached translations are good
        lastAccessed: new Date(),
        hitCount: 1
      });
      
      return {
        translatedText: existingTranslation,
        sourceLanguage,
        targetLanguage: request.targetLanguage,
        confidence: 0.9,
        fromCache: true,
        cacheKey,
        serviceUsed: 'database_cache_deduplicated'
      };
    }
    
    // Try database cache (legacy)
    const dbCached = await this.getDatabaseCache(cacheKey);
    if (dbCached) {
      // Also store in memory cache for faster access
      memoryCache.set(cacheKey, {
        id: dbCached.id,
        translatedText: dbCached.translated_text,
        confidence: dbCached.confidence_score,
        lastAccessed: new Date(dbCached.last_accessed_at),
        hitCount: dbCached.hit_count
      });
      
      return {
        translatedText: dbCached.translated_text,
        sourceLanguage,
        targetLanguage: request.targetLanguage,
        confidence: dbCached.confidence_score,
        fromCache: true,
        cacheKey,
        serviceUsed: 'database_cache'
      };
    }
    
    // Perform actual translation with quality control
    let retryCount = 0;
    let bestTranslation: { translatedText: string; confidence: number; serviceUsed: string } | null = null;
    
    while (retryCount <= CONFIG.MAX_RETRIES) {
      try {
        const translation = await this.performTranslationWithQuality(
          text,
          sourceLanguage,
          request.targetLanguage,
          retryCount
        );
        
        // Validate translation quality
        if (CONFIG.VALIDATE_TRANSLATIONS) {
          const validation = validateTranslation(
            text,
            translation.translatedText,
            sourceLanguage,
            request.targetLanguage,
            {
              minConfidence: CONFIG.MIN_QUALITY_SCORE
            }
          );
          
          if (CONFIG.LOG_QUALITY_ISSUES && validation.issues.length > 0) {
            logTranslationIssue(
              text,
              translation.translatedText,
              sourceLanguage,
              request.targetLanguage,
              validation,
              translation.serviceUsed
            );
          }
          
          // Check if we should retry
          if (shouldRetryTranslation(validation, retryCount, CONFIG.MAX_RETRIES)) {
            retryCount++;
            continue;
          }
          
          // Update confidence based on validation
          translation.confidence = Math.min(translation.confidence, validation.confidence);
          
          // Store as best translation if better than previous
          if (!bestTranslation || translation.confidence > bestTranslation.confidence) {
            bestTranslation = translation;
          }
          
          // If confidence is good enough, break
          if (translation.confidence >= CONFIG.MIN_CONFIDENCE) {
            bestTranslation = translation;
            break;
          }
        } else {
          bestTranslation = translation;
          break;
        }
        
      } catch (error) {
        console.error(`Translation attempt ${retryCount + 1} failed:`, error);
        retryCount++;
      }
    }
    
    // If we have a best translation, cache and return it
    if (bestTranslation) {
      // Cache the result with appropriate TTL
      const cacheTTL = getCacheTTL(request.contentType, bestTranslation.confidence);
      
      await this.cacheTranslationWithTTL(
        text,
        sourceLanguage,
        request.targetLanguage,
        bestTranslation.translatedText,
        bestTranslation.confidence,
        bestTranslation.serviceUsed,
        cacheTTL
      );
      
      // Also store in memory cache
      memoryCache.set(cacheKey, {
        id: contentHash,
        translatedText: bestTranslation.translatedText,
        confidence: bestTranslation.confidence,
        lastAccessed: new Date(),
        hitCount: 1
      });
      
      return {
        translatedText: bestTranslation.translatedText,
        sourceLanguage,
        targetLanguage: request.targetLanguage,
        confidence: bestTranslation.confidence,
        fromCache: false,
        cacheKey,
        serviceUsed: bestTranslation.serviceUsed
      };
    }
    
    // All translation attempts failed, use fallback
    return this.createFallbackResponse(
      text,
      sourceLanguage,
      request.targetLanguage,
      `All ${CONFIG.MAX_RETRIES + 1} translation attempts failed`
    );
  }
  
  /**
   * Batch translate multiple texts
   */
  async batchTranslate(requests: TranslationRequest[]): Promise<TranslationResponse[]> {
    const results: TranslationResponse[] = [];
    
    // Process in batches to avoid overwhelming the service
    for (let i = 0; i < requests.length; i += CONFIG.BATCH_SIZE) {
      const batch = requests.slice(i, i + CONFIG.BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(request => this.translate(request))
      );
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + CONFIG.BATCH_SIZE < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
  
  /**
   * Get translations for content with multiple target languages
   */
  async getTranslationsForContent(
    text: string,
    sourceLanguage: string,
    targetLanguages: string[],
    contentType: 'post' | 'message' | 'venue' | 'comment'
  ): Promise<Record<string, string>> {
    const translations: Record<string, string> = {};
    
    // Always include original language
    translations[sourceLanguage] = text;
    
    // Get translations for each target language
    const requests = targetLanguages
      .filter(targetLang => targetLang !== sourceLanguage)
      .map(targetLang => ({
        text,
        sourceLanguage,
        targetLanguage: targetLang,
        contentType
      }));
    
    const results = await this.batchTranslate(requests);
    
    // Build translations object
    results.forEach(result => {
      if (result.translatedText) {
        translations[result.targetLanguage] = result.translatedText;
      }
    });
    
    return translations;
  }
  
  /**
   * Update content translations in database
   */
  async updateContentTranslations(
    contentId: string,
    contentType: 'post' | 'message' | 'venue',
    translations: Record<string, string>,
    sourceLanguage: string
  ): Promise<boolean> {
    if (!supabase) {
      console.warn('Supabase client not initialized');
      return false;
    }
    
    try {
      let updateResult;
      
      switch (contentType) {
        case 'post':
          updateResult = await supabase
            .from('posts')
            .update({
              translations,
              content_language: sourceLanguage,
              translation_updated_at: new Date().toISOString()
            })
            .eq('id', contentId);
          break;
          
        case 'message':
          // For messages, we only cache recent translations
          updateResult = await supabase
            .from('live_chat_messages')
            .update({
              translation_cache: translations,
              content_language: sourceLanguage,
              translation_cached_at: new Date().toISOString()
            })
            .eq('id', contentId);
          break;
          
        case 'venue':
          // Venue translations would go here
          break;
      }
      
      return !updateResult.error;
      
    } catch (error) {
      console.error('Failed to update content translations:', error);
      return false;
    }
  }
  
  /**
   * Get user's preferred language from profile
   */
  async getUserLanguage(userId: string): Promise<string> {
    if (!supabase) {
      return 'en';
    }
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('language')
        .eq('id', userId)
        .single();
      
      if (error || !data) {
        return 'en';
      }
      
      return data.language || 'en';
      
    } catch (error) {
      console.error('Failed to get user language:', error);
      return 'en';
    }
  }
  
  /**
   * Perform actual translation using external service
   * This is a placeholder - in production, integrate with Google Translate, DeepL, etc.
   */
  private async performTranslation(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ translatedText: string; confidence: number; serviceUsed: string }> {
    
    // Check if translation is enabled
    if (!CONFIG.ENABLE_TRANSLATION) {
      return {
        translatedText: text,
        confidence: 1.0,
        serviceUsed: 'disabled_fallback'
      };
    }
    
    // Placeholder translation logic
    // In production, this would call a real translation API
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // For demo purposes, return a simple transformation
    // In production, replace with actual API call
    let translatedText = text;
    
    // Simple demo transformations for common languages
    if (sourceLanguage === 'es' && targetLanguage === 'en') {
      translatedText = text.replace(/hola/gi, 'hello')
                          .replace(/gracias/gi, 'thank you')
                          .replace(/por favor/gi, 'please');
    } else if (sourceLanguage === 'en' && targetLanguage === 'es') {
      translatedText = text.replace(/hello/gi, 'hola')
                          .replace(/thank you/gi, 'gracias')
                          .replace(/please/gi, 'por favor');
    }
    
    return {
      translatedText,
      confidence: 0.9, // Simulated confidence
      serviceUsed: 'demo_service'
    };
  }
  
  /**
   * Get translation from database cache
   */
  private async getDatabaseCache(cacheKey: string): Promise<any> {
    if (!supabase) {
      return null;
    }
    
    try {
      const { data, error } = await supabase
        .from('translation_cache')
        .select('*')
        .eq('source_text_hash', cacheKey)
        .single();
      
      if (error || !data) {
        return null;
      }
      
      // Update last accessed time
      await supabase
        .from('translation_cache')
        .update({ 
          last_accessed_at: new Date().toISOString(),
          hit_count: data.hit_count + 1 
        })
        .eq('id', data.id);
      
      return data;
      
    } catch (error) {
      console.error('Failed to get database cache:', error);
      return null;
    }
  }
  
  /**
   * Cache translation in database
   */
  private async cacheTranslation(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    translatedText: string,
    confidence: number,
    serviceUsed: string
  ): Promise<void> {
    if (!supabase) {
      return;
    }
    
    try {
      // In production, this would use the database function
      // For now, we'll do a direct insert
      const { error } = await supabase
        .from('translation_cache')
        .insert({
          source_text_hash: generateCacheKey(text, sourceLanguage, targetLanguage),
          source_language: sourceLanguage,
          target_language: targetLanguage,
          translated_text: translatedText,
          service_used: serviceUsed,
          confidence_score: confidence
        });
      
      if (error) {
        console.error('Failed to cache translation:', error);
      }
      
    } catch (error) {
      console.error('Failed to cache translation:', error);
    }
  }
  
  /**
   * Create empty response for invalid input
   */
  private createEmptyResponse(request: TranslationRequest): TranslationResponse {
    return {
      translatedText: '',
      sourceLanguage: request.sourceLanguage || 'en',
      targetLanguage: request.targetLanguage,
      confidence: 1.0,
      fromCache: false,
      serviceUsed: 'none'
    };
  }
  
  /**
   * Create response when no translation is needed
   */
  private createNoTranslationResponse(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): TranslationResponse {
    return {
      translatedText: text,
      sourceLanguage,
      targetLanguage,
      confidence: 1.0,
      fromCache: false,
      serviceUsed: 'no_translation_needed'
    };
  }
  
  /**
   * Create fallback response when translation fails
   */
  private createFallbackResponse(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    error: string
  ): TranslationResponse {
    let fallbackText = text;
    
    // Fallback to English if available and different from source
    if (CONFIG.FALLBACK_TO_ENGLISH && targetLanguage !== 'en' && sourceLanguage !== 'en') {
      // Try to get English translation from cache
      // For now, return original text
    }
    
    return {
      translatedText: fallbackText,
      sourceLanguage,
      targetLanguage,
      confidence: 0.1, // Low confidence for fallback
      fromCache: false,
      serviceUsed: `fallback_${error}`
    };
  }
  
  /**
   * Smart translation decision with strategy
   */
  private shouldTranslateWithStrategy(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    contentType: 'post' | 'message' | 'venue' | 'comment',
    detectionConfidence: number
  ): { shouldTranslate: boolean; reason: string } {
    // Basic checks
    if (!text || text.trim().length === 0) {
      return { shouldTranslate: false, reason: 'Empty text' };
    }
    
    if (sourceLanguage === targetLanguage) {
      return { shouldTranslate: false, reason: 'Same language' };
    }
    
    // Check if text is translatable
    if (!shouldTranslate(text, sourceLanguage, targetLanguage)) {
      return { shouldTranslate: false, reason: 'Text not translatable' };
    }
    
    // Low confidence detection - be conservative
    if (detectionConfidence < CONFIG.MIN_CONFIDENCE) {
      return { 
        shouldTranslate: false, 
        reason: `Low detection confidence: ${detectionConfidence.toFixed(2)}` 
      };
    }
    
    // Content type specific rules
    switch (contentType) {
      case 'message':
        // Real-time messages: translate if different languages
        return { shouldTranslate: true, reason: 'Real-time message translation' };
        
      case 'post':
        // Posts: only auto-translate to priority languages
        const shouldAutoTranslate = CONFIG.AUTO_TRANSLATE_LANGUAGES.includes(targetLanguage);
        return {
          shouldTranslate: shouldAutoTranslate,
          reason: shouldAutoTranslate 
            ? `Auto-translate to ${targetLanguage}` 
            : `Not auto-translated (${targetLanguage} not in priority list)`
        };
        
      case 'venue':
        // Venue info: translate based on importance
        return { shouldTranslate: text.length > 20, reason: 'Venue content translation' };
        
      case 'comment':
        // Comments: translate if substantial
        return { shouldTranslate: text.length > 10, reason: 'Comment translation' };
        
      default:
        return { shouldTranslate: true, reason: 'Default translation' };
    }
  }
  
  /**
   * Find existing translation by content hash
   */
  private async findExistingTranslation(
    contentHash: string,
    targetLanguage: string
  ): Promise<string | null> {
    if (!supabase) {
      return null;
    }
    
    try {
      const { data, error } = await supabase
        .from('translation_cache')
        .select('translated_text')
        .eq('source_text_hash', contentHash)
        .eq('target_language', targetLanguage)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (error || !data) {
        return null;
      }
      
      return data.translated_text;
      
    } catch (error) {
      console.error('Failed to find existing translation:', error);
      return null;
    }
  }
  
  /**
   * Perform translation with quality control
   */
  private async performTranslationWithQuality(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    attempt: number = 0
  ): Promise<{ translatedText: string; confidence: number; serviceUsed: string }> {
    
    // Check if translation is enabled
    if (!CONFIG.ENABLE_TRANSLATION) {
      return {
        translatedText: text,
        confidence: 1.0,
        serviceUsed: 'disabled_fallback'
      };
    }
    
    // Select translation service based on attempt
    const service = this.selectTranslationService(sourceLanguage, targetLanguage, attempt);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100 + (attempt * 50)));
    
    // For demo purposes, return a simple transformation
    // In production, replace with actual API call
    let translatedText = text;
    let confidence = 0.9 - (attempt * 0.1); // Lower confidence on retries
    
    // Simple demo transformations for common languages
    if (sourceLanguage === 'es' && targetLanguage === 'en') {
      translatedText = text.replace(/hola/gi, 'hello')
                          .replace(/gracias/gi, 'thank you')
                          .replace(/por favor/gi, 'please');
    } else if (sourceLanguage === 'en' && targetLanguage === 'es') {
      translatedText = text.replace(/hello/gi, 'hola')
                          .replace(/thank you/gi, 'gracias')
                          .replace(/please/gi, 'por favor');
    }
    
    // Add attempt marker for testing
    if (attempt > 0) {
      translatedText = `[Attempt ${attempt + 1}] ${translatedText}`;
      confidence *= 0.8;
    }
    
    return {
      translatedText,
      confidence,
      serviceUsed: service
    };
  }
  
  /**
   * Select appropriate translation service
   */
  private selectTranslationService(
    sourceLanguage: string,
    targetLanguage: string,
    attempt: number
  ): string {
    const services = [
      'google_translate', // Primary
      'deepl',           // Secondary
      'fallback_basic'   // Fallback
    ];
    
    // Use different service on retry
    const serviceIndex = Math.min(attempt, services.length - 1);
    return services[serviceIndex];
  }
  
  /**
   * Cache translation with TTL
   */
  private async cacheTranslationWithTTL(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    translatedText: string,
    confidence: number,
    serviceUsed: string,
    ttlMs: number
  ): Promise<void> {
    if (!supabase || !CONFIG.CACHE_ENABLED) {
      return;
    }
    
    try {
      const cacheKey = getCacheKey(text, sourceLanguage, targetLanguage);
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      
      const { error } = await supabase
        .from('translation_cache')
        .upsert({
          source_text_hash: cacheKey,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          translated_text: translatedText,
          service_used: serviceUsed,
          confidence_score: confidence,
          expires_at: expiresAt,
          last_accessed_at: new Date().toISOString()
        }, { onConflict: 'source_text_hash' });
      
      if (error) {
        console.error('Failed to cache translation with TTL:', error);
      }
      
    } catch (error) {
      console.error('Failed to cache translation with TTL:', error);
    }
  }
  
  /**
   * Clear all caches (for testing/debugging)
   */
  async clearCaches(): Promise<void> {
    memoryCache.clear();
    
    if (supabase) {
      try {
        // In production, you might want to truncate or archive instead of delete
        await supabase
          .from('translation_cache')
          .delete()
          .lt('last_accessed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      } catch (error) {
        console.error('Failed to clear database cache:', error);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    memoryCacheSize: number;
    memoryCacheHits: number;
    databaseCacheHits: number;
  } {
    // Simplified stats - in production, track actual hits/misses
    return {
      memoryCacheSize: memoryCache.size(),
      memoryCacheHits: 0, // Would track in production
      databaseCacheHits: 0  // Would track in production
    };
  }
}

// Export singleton instance
export const translationService = TranslationService.getInstance();