import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORTED_LANGUAGES, setUserLanguage, LanguageCode } from '@/lib/i18n';
import i18n from '@/lib/i18n';

const getInitialLanguage = (): LanguageCode => {
  const detected = i18n.resolvedLanguage || i18n.language;
  if (detected && SUPPORTED_LANGUAGES.some(lang => lang.code === detected)) {
    return detected as LanguageCode;
  }
  return 'en';
};

export const useUserLanguage = () => {
  const { user, loading: authLoading } = useAuth();
  const [language, setLanguage] = useState<LanguageCode>(getInitialLanguage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-user identity guard: if the active user id changes, we MUST refetch
  // and never reuse another user's language state. This prevents the bug
  // where switching accounts in the same browser bleeds language across
  // accounts. We track the last user id we applied a language for.
  const currentUserId = user?.id ?? null;

  // Load user's language from database
  const loadUserLanguage = useCallback(async () => {
    // Wait for auth to finish loading
    if (authLoading) {
      setLoading(true);
      console.log('[useUserLanguage] Auth still loading, waiting...');
      return;
    }

    try {
      console.log('[useUserLanguage] loadUserLanguage called');
      console.log(`[useUserLanguage] Auth loading: ${authLoading}, User: ${user ? 'logged in' : 'not logged in'}`);

      setLoading(true);
      setError(null);

      // Get current i18n language (already detected by LanguageDetector)
      const currentI18nLanguage = i18n.language as LanguageCode;
      console.log(`[useUserLanguage] Current i18n.language: ${currentI18nLanguage}`);
      console.log(`[useUserLanguage] localStorage 'jv_language': ${localStorage.getItem('jv_language')}`);
      
      if (!user) {
        // No user logged in, use i18n detected language
        // Don't call setUserLanguage to avoid unnecessary changeLanguage calls
        console.log(`[useUserLanguage] No user, using i18n detected language: ${currentI18nLanguage}`);
        setLanguage(currentI18nLanguage);
        return;
      }

      console.log(`[useUserLanguage] Fetching language for user: ${user.id}`);
      // Fetch user's profile with language
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('language')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        console.error('[useUserLanguage] Error fetching user language:', profileError);
        
        // Check if language column exists
        if (profileError.message.includes('column')) {
          console.warn('[useUserLanguage] Language column may not exist in database yet');
        }
        
        // Fallback to i18n detected language
        console.log(`[useUserLanguage] Database error, falling back to: ${currentI18nLanguage}`);
        setLanguage(currentI18nLanguage);
        return;
      }

      // Validate user's saved language
      const userLanguage = profile?.language as LanguageCode;
      console.log(`[useUserLanguage] Database language: ${userLanguage || '(empty/null)'}`);
      
      if (userLanguage && SUPPORTED_LANGUAGES.some(lang => lang.code === userLanguage)) {
        // User has a saved language
        console.log(`[useUserLanguage] User has saved language: ${userLanguage}`);
        setLanguage(userLanguage);
        
        // Only update i18n if it's different from current
        if (userLanguage !== currentI18nLanguage) {
          console.log(`[useUserLanguage] Database language (${userLanguage}) differs from i18n (${currentI18nLanguage}), updating...`);
          await setUserLanguage(userLanguage);
        } else {
          console.log(`[useUserLanguage] Database language matches i18n: ${userLanguage}`);
        }
      } else {
        // Invalid or missing language, use i18n detected language temporarily
        // without persisting browser-detected language back to the database.
        console.log(`[useUserLanguage] Invalid/missing database language, using i18n temporarily: ${currentI18nLanguage}`);
        setLanguage(currentI18nLanguage);
      }
    } catch (err) {
      console.error('[useUserLanguage] Error in loadUserLanguage:', err);
      setError('Failed to load language preference');
      
      // Fallback to i18n detected language
      const currentI18nLanguage = i18n.language as LanguageCode;
      console.log(`[useUserLanguage] Catch block, falling back to: ${currentI18nLanguage}`);
      setLanguage(currentI18nLanguage);
    } finally {
      console.log('[useUserLanguage] loadUserLanguage complete');
      setLoading(false);
    }
  }, [currentUserId, authLoading]);

  // Update user's language in database
  const updateUserLanguage = useCallback(async (newLanguage: LanguageCode) => {
    try {
      setError(null);

      if (!user) {
        // Not logged in, just update localStorage
        await setUserLanguage(newLanguage);
        setLanguage(newLanguage);
        return { success: true };
      }

      // Update in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ language: newLanguage })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating user language:', updateError);
        setError('Failed to save language preference');
        return { success: false, error: updateError.message };
      }

      // Update i18n and state
      await setUserLanguage(newLanguage);
      setLanguage(newLanguage);

      return { success: true };
    } catch (err) {
      console.error('Error in updateUserLanguage:', err);
      setError('Failed to update language');
      return { success: false, error: String(err) };
    }
  }, [user, currentUserId]);

  // Save language during signup
  const saveLanguageOnSignup = useCallback(async (userId: string, languageCode: LanguageCode) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ language: languageCode })
        .eq('user_id', userId);

      if (error) {
        console.error('Error saving language on signup:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error in saveLanguageOnSignup:', err);
      return false;
    }
  }, []);

  // Load language on mount and when user changes
  useEffect(() => {
    loadUserLanguage();
  }, [loadUserLanguage]);

  // Get current language info
  const getCurrentLanguageInfo = useCallback(() => {
    return SUPPORTED_LANGUAGES.find(lang => lang.code === language) || 
           SUPPORTED_LANGUAGES.find(lang => lang.code === 'en')!;
  }, [language]);

  // Check if language is supported
  const isLanguageSupported = useCallback((languageCode: string) => {
    return SUPPORTED_LANGUAGES.some(lang => lang.code === languageCode);
  }, []);

  return {
    language,
    loading,
    error,
    updateUserLanguage,
    saveLanguageOnSignup,
    getCurrentLanguageInfo,
    isLanguageSupported,
    reloadLanguage: loadUserLanguage,
  };
};
