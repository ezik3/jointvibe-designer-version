import { useEffect, useRef } from 'react';
import { useUserLanguage } from '@/hooks/useUserLanguage';
import { useAuth } from '@/contexts/AuthContext';
import i18n from '@/lib/i18n';

/**
 * LanguageInitializer - Ensures correct language is set on app startup
 * 
 * This component:
 * 1. Reacts when language becomes available (after auth loads)
 * 2. Updates i18n if useUserLanguage language differs from current i18n
 * 3. Prevents infinite loops with ref tracking
 * 4. No UI - just side effects
 */
export const LanguageInitializer = () => {
  const { language, loading: languageLoading } = useUserLanguage();
  const { loading: authLoading } = useAuth();
  const lastLanguageRef = useRef<string | null>(null);

  console.log(`[LanguageInitializer] Render. authLoading: ${authLoading}, languageLoading: ${languageLoading}, language: ${language}`);
  console.log(`[LanguageInitializer] Current i18n.language: ${i18n.language}`);
  console.log(`[LanguageInitializer] localStorage 'jv_language': ${localStorage.getItem('jv_language')}`);
  console.log(`[LanguageInitializer] lastLanguageRef: ${lastLanguageRef.current}`);

  useEffect(() => {
    console.log(`[LanguageInitializer] useEffect triggered. authLoading: ${authLoading}, languageLoading: ${languageLoading}, language: ${language}`);
    
    // Don't run while auth or language is still loading
    if (authLoading || languageLoading) {
      console.log('[LanguageInitializer] Still loading (auth or language), waiting...');
      return;
    }

    // Don't run if language hasn't changed since last time
    if (language === lastLanguageRef.current) {
      console.log(`[LanguageInitializer] Language hasn't changed (still ${language}), skipping`);
      return;
    }

    // Don't run if language is not available yet
    if (!language) {
      console.log('[LanguageInitializer] Language not available yet, skipping');
      return;
    }

    const updateLanguageIfNeeded = async () => {
      try {
        console.log(`[LanguageInitializer] updateLanguageIfNeeded called. language: ${language}`);
        
        // Get current i18n language
        const currentI18nLanguage = i18n.language;
        console.log(`[LanguageInitializer] Current i18n.language: ${currentI18nLanguage}, target language: ${language}`);
        
        // Update i18n if different from current
        if (language !== currentI18nLanguage) {
          console.log(`[LanguageInitializer] Updating i18n from ${currentI18nLanguage} to ${language}`);
          console.log(`[LanguageInitializer] Source: useUserLanguage hook (after auth loaded)`);
          await i18n.changeLanguage(language);
          console.log(`[LanguageInitializer] Language updated to ${i18n.language}`);
          
          // Update ref to prevent re-running for same language
          lastLanguageRef.current = language;
        } else {
          console.log(`[LanguageInitializer] Language already correct: ${language}`);
          lastLanguageRef.current = language;
        }
      } catch (error) {
        console.error('[LanguageInitializer] Error updating language:', error);
      }
    };

    updateLanguageIfNeeded();
  }, [language, languageLoading, authLoading]);

  // This component has no UI
  return null;
};