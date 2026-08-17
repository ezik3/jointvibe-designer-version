/**
 * Hook for content translation
 * Provides utilities for translating user-generated content
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { detectLanguage } from '../../shared/translationUtils';

// Types
export interface ContentTranslation {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  isLoading: boolean;
  error?: string;
  fromCache: boolean;
}

export interface UseContentTranslationOptions {
  autoDetectLanguage?: boolean;
  autoTranslate?: boolean;
  priorityLanguages?: string[];
  cacheEnabled?: boolean;
  debounceMs?: number;
}

/**
 * Hook for translating single content item
 */
export function useContentTranslation(
  contentId: string,
  originalText: string,
  contentType: 'post' | 'message' | 'venue' | 'comment',
  options: UseContentTranslationOptions = {}
) {
  const {
    autoDetectLanguage = true,
    autoTranslate = true,
    cacheEnabled = true,
    debounceMs = 300
  } = options;
  
  const { user } = useAuth();
  const [translation, setTranslation] = useState<ContentTranslation>({
    id: contentId,
    originalText,
    translatedText: originalText,
    sourceLanguage: 'en',
    targetLanguage: 'en',
    isLoading: false,
    fromCache: false
  });
  
  const debounceTimer = useRef<NodeJS.Timeout>();
  
  // Get user's preferred language
  const getUserLanguage = useCallback(async (): Promise<string> => {
    if (!user?.id) return 'en';
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('language')
        .eq('user_id', user.id)
        .single();
      
      if (error || !data) return 'en';
      return (data as any).language || 'en';
      
    } catch (error) {
      console.error('Failed to get user language:', error);
      return 'en';
    }
  }, [user?.id]);
  
  // Detect source language
  const detectSourceLanguage = useCallback(async (): Promise<string> => {
    if (!autoDetectLanguage) return 'en';
    return detectLanguage(originalText);
  }, [autoDetectLanguage, originalText]);
  
  // Main translation function
  const translate = useCallback(async (targetLanguage?: string) => {
    if (!autoTranslate) return;
    
    setTranslation(prev => ({ ...prev, isLoading: true }));
    
    try {
      const userLanguage = targetLanguage || await getUserLanguage();
      const sourceLanguage = await detectSourceLanguage();
      
      console.log("User language:", userLanguage);
      console.log("Post language:", sourceLanguage);
      
      if (userLanguage === sourceLanguage) {
        console.log("Translated output:", originalText, "(same language, no translation needed)");
        setTranslation({
          id: contentId,
          originalText,
          translatedText: originalText,
          sourceLanguage,
          targetLanguage: userLanguage,
          isLoading: false,
          fromCache: false
        });
        return;
      }
      
      // For now, show original text (translation service integration can be added later)
      console.log("Translated output:", originalText, "(translation service not yet connected)");
      setTranslation({
        id: contentId,
        originalText,
        translatedText: originalText,
        sourceLanguage,
        targetLanguage: userLanguage,
        isLoading: false,
        fromCache: false
      });
      
    } catch (error) {
      console.error('Translation process failed:', error);
      setTranslation(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Translation failed'
      }));
    }
  }, [autoTranslate, contentId, originalText, getUserLanguage, detectSourceLanguage]);
  
  // Debounced translation
  const debouncedTranslate = useCallback((targetLanguage?: string) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      translate(targetLanguage);
    }, debounceMs);
  }, [translate, debounceMs]);
  
  // Auto-translate on mount or when text changes
  useEffect(() => {
    if (autoTranslate && originalText) {
      debouncedTranslate();
    }
    
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [autoTranslate, originalText, debouncedTranslate]);
  
  // Manually trigger translation
  const triggerTranslation = useCallback((targetLanguage?: string) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    translate(targetLanguage);
  }, [translate]);
  
  // Update translation when target language changes
  const updateTargetLanguage = useCallback(async (newLanguage: string) => {
    if (newLanguage === translation.targetLanguage) return;
    translate(newLanguage);
  }, [translation.targetLanguage, translate]);
  
  return {
    translation,
    triggerTranslation,
    updateTargetLanguage,
    isLoading: translation.isLoading,
    error: translation.error,
    fromCache: translation.fromCache
  };
}

/**
 * Hook for batch translating multiple content items
 */
export function useBatchContentTranslation(
  items: Array<{
    id: string;
    text: string;
    type: 'post' | 'message' | 'venue' | 'comment';
  }>,
  options: UseContentTranslationOptions = {}
) {
  const { user } = useAuth();
  const [translations, setTranslations] = useState<Record<string, ContentTranslation>>({});
  const [isLoading, setIsLoading] = useState(false);
  
  const { autoTranslate = true } = options;
  
  // Get user language
  const getUserLanguage = useCallback(async (): Promise<string> => {
    if (!user?.id) return 'en';
    
    try {
      const { data } = await supabase
        .from('profiles')
        .select('language')
        .eq('user_id', user.id)
        .single();
      
      return (data as any)?.language || 'en';
    } catch {
      return 'en';
    }
  }, [user?.id]);
  
  // Batch translate all items
  const translateBatch = useCallback(async (targetLanguage?: string) => {
    if (!autoTranslate || items.length === 0) return;
    
    setIsLoading(true);
    
    try {
      const userLanguage = targetLanguage || await getUserLanguage();
      
      const newTranslations: Record<string, ContentTranslation> = {};
      
      items.forEach((item) => {
        newTranslations[item.id] = {
          id: item.id,
          originalText: item.text,
          translatedText: item.text,
          sourceLanguage: 'en',
          targetLanguage: userLanguage,
          isLoading: false,
          fromCache: false
        };
      });
      
      setTranslations(newTranslations);
      
    } catch (error) {
      console.error('Batch translation failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [autoTranslate, items, getUserLanguage]);
  
  useEffect(() => {
    if (autoTranslate && items.length > 0) {
      translateBatch();
    }
  }, [autoTranslate, items, translateBatch]);
  
  const getTranslation = useCallback((id: string): ContentTranslation | undefined => {
    return translations[id];
  }, [translations]);
  
  return {
    translations,
    isLoading,
    translateBatch,
    getTranslation
  };
}
