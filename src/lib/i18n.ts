import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

// Supported languages with display names and flags
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸', locale: 'en-US' },
  { code: 'es', name: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', locale: 'it-IT' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱', locale: 'nl-NL' },
  { code: 'pt', name: 'Português', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', locale: 'ru-RU' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', locale: 'ja-JP' },
  { code: 'ko', name: '한국어', flag: '🇰🇷', locale: 'ko-KR' },
  { code: 'zh', name: '中文 (简体)', flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'zh-TW', name: '中文 (繁體)', flag: '🇹🇼', locale: 'zh-TW' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭', locale: 'th-TH' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', locale: 'vi-VN' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', locale: 'id-ID' },
  { code: 'tl', name: 'Filipino', flag: '🇵🇭', locale: 'tl-PH' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳', locale: 'hi-IN' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', locale: 'ar-SA' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', locale: 'tr-TR' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪', locale: 'sv-SE' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

// Default namespace
const DEFAULT_NAMESPACE = 'common';

// Initialize i18n
console.log('[i18n] Starting initialization...');
i18n
  .use(Backend) // Load translations via HTTP (lazy loading)
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    // Default language (fallback)
    fallbackLng: 'en',
    
    // Supported languages
    supportedLngs: SUPPORTED_LANGUAGES.map(lang => lang.code),
    
    // Default namespace
    defaultNS: DEFAULT_NAMESPACE,
    
    // Namespaces to load by default
    ns: [DEFAULT_NAMESPACE, 'auth', 'wallet', 'feed', 'venue', 'ai', 'pos', 'admin'],
    
    // Debug mode (disable in production)
    debug: process.env.NODE_ENV === 'development',
    
    // Detection options
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      
      // Keys to store language preference
      lookupLocalStorage: 'jv_language',
      lookupFromPathIndex: 0,
      lookupFromSubdomainIndex: 0,
      
      // Cache user language
      caches: ['localStorage'],
      
      // Don't cache for these languages
      excludeCacheFor: ['cimode'],
    },
    
    // Backend configuration (lazy loading)
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    // React i18next options
    react: {
      useSuspense: true, // Use React Suspense for loading
      bindI18n: 'languageChanged loaded', // Bind to language changes
      bindI18nStore: 'added removed', // Bind to store changes
    },
    
    // Interpolation options
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    // Return empty string instead of key if translation missing
    returnEmptyString: false,
    
    // Return objects for missing keys
    returnObjects: true,
    
    // Save missing translations
    saveMissing: process.env.NODE_ENV === 'development',
    missingKeyHandler: (lng, ns, key) => {
      console.warn(`[i18n] Missing translation: ${lng}.${ns}.${key}`);
    },
  })
  .then(() => {
    console.log(`[i18n] Initialization complete. Language: ${i18n.language}, Resolved: ${i18n.resolvedLanguage}`);
    console.log(`[i18n] localStorage 'jv_language': ${localStorage.getItem('jv_language')}`);
    console.log(`[i18n] navigator.language: ${navigator.language}`);
  })
  .catch((error) => {
    console.error('[i18n] Initialization error:', error);
  });

// Helper function to get user's language from profile
export const getUserLanguage = async (): Promise<LanguageCode> => {
  try {
    // Check localStorage first (for performance)
    const savedLanguage = localStorage.getItem('jv_language');
    if (savedLanguage && SUPPORTED_LANGUAGES.some(lang => lang.code === savedLanguage)) {
      return savedLanguage as LanguageCode;
    }
    
    // Check browser language
    const browserLanguage = navigator.language.split('-')[0];
    if (SUPPORTED_LANGUAGES.some(lang => lang.code === browserLanguage)) {
      return browserLanguage as LanguageCode;
    }
    
    // Default to English
    return 'en';
  } catch (error) {
    console.error('Error getting user language:', error);
    return 'en';
  }
};

// Helper function to get user's language WITHOUT changing i18n
export const getUserLanguageWithoutChange = (): LanguageCode => {
  try {
    // Check localStorage first (for performance)
    const savedLanguage = localStorage.getItem('jv_language');
    if (savedLanguage && SUPPORTED_LANGUAGES.some(lang => lang.code === savedLanguage)) {
      return savedLanguage as LanguageCode;
    }
    
    // Check current i18n language (already detected by LanguageDetector)
    const currentLanguage = i18n.language;
    if (currentLanguage && SUPPORTED_LANGUAGES.some(lang => lang.code === currentLanguage)) {
      return currentLanguage as LanguageCode;
    }
    
    // Default to English
    return 'en';
  } catch (error) {
    console.error('Error getting user language:', error);
    return 'en';
  }
};

// Helper function to set user language
export const setUserLanguage = async (language: LanguageCode): Promise<void> => {
  try {
    console.log(`[setUserLanguage] Called with language: ${language}`);
    console.log(`[setUserLanguage] Current i18n.language: ${i18n.language}`);
    console.log(`[setUserLanguage] Current localStorage 'jv_language': ${localStorage.getItem('jv_language')}`);
    
    // Check if language is already set
    if (i18n.language === language) {
      console.log(`[setUserLanguage] Language already set to ${language}, updating localStorage only`);
      // Language already set, just update localStorage
      localStorage.setItem('jv_language', language);
      return;
    }
    
    console.log(`[setUserLanguage] Changing language from ${i18n.language} to ${language}`);
    // Update i18n
    await i18n.changeLanguage(language);
    
    // Save to localStorage
    localStorage.setItem('jv_language', language);
    console.log(`[setUserLanguage] Language changed successfully to ${language}`);
    
    // Note: Database update is handled by useUserLanguage hook
    // when user is logged in
  } catch (error) {
    console.error('[setUserLanguage] Error setting user language:', error);
  }
};

// Helper to get locale for formatting (dates, numbers, currency)
export const getLocaleForLanguage = (languageCode: LanguageCode): string => {
  const language = SUPPORTED_LANGUAGES.find(lang => lang.code === languageCode);
  return language?.locale || 'en-US';
};

// Export i18n instance
export default i18n;