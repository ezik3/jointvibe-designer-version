/**
 * Translated Content Component
 * Wraps content with automatic translation
 */

import React, { useState, useEffect } from 'react';
import { useContentTranslation } from '../../hooks/useContentTranslation';
import { useTranslation } from 'react-i18next';

// Types
export interface TranslatedContentProps {
  // Content information
  contentId: string;
  originalText: string;
  contentType: 'post' | 'message' | 'venue' | 'comment';
  
  // Display options
  showOriginal?: boolean;
  showLanguageBadge?: boolean;
  maxLength?: number;
  truncate?: boolean;
  
  // Translation options
  autoTranslate?: boolean;
  targetLanguage?: string;
  
  // Styling
  className?: string;
  textClassName?: string;
  
  // Children (for custom rendering)
  children?: (props: {
    translatedText: string;
    originalText: string;
    sourceLanguage: string;
    targetLanguage: string;
    isLoading: boolean;
    error?: string;
    fromCache: boolean;
  }) => React.ReactNode;
}

/**
 * Component that automatically translates content based on user's language
 */
export const TranslatedContent: React.FC<TranslatedContentProps> = ({
  contentId,
  originalText,
  contentType,
  showOriginal = false,
  showLanguageBadge = true,
  maxLength = 500,
  truncate = false,
  autoTranslate = true,
  targetLanguage,
  className = '',
  textClassName = '',
  children
}) => {
  const { t } = useTranslation('common');
  const [showTranslation, setShowTranslation] = useState(true);
  
  // Use translation hook
  const {
    translation,
    isLoading,
    error,
    fromCache,
    updateTargetLanguage
  } = useContentTranslation(
    contentId,
    originalText,
    contentType,
    {
      autoTranslate,
      autoDetectLanguage: true,
      cacheEnabled: true
    }
  );
  
  // Update target language if prop changes
  useEffect(() => {
    if (targetLanguage && targetLanguage !== translation.targetLanguage) {
      updateTargetLanguage(targetLanguage);
    }
  }, [targetLanguage, translation.targetLanguage, updateTargetLanguage]);
  
  // Handle text truncation
  const truncateText = (text: string): string => {
    if (!truncate || text.length <= maxLength) {
      return text;
    }
    
    // Truncate at last space before maxLength
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  };
  
  // Get display text
  const displayText = showTranslation 
    ? translation.translatedText 
    : originalText;
  
  const truncatedDisplayText = truncateText(displayText);
  const truncatedOriginalText = truncateText(originalText);
  
  // Get language badge color
  const getLanguageBadgeColor = (language: string): string => {
    const colors: Record<string, string> = {
      'en': 'bg-blue-100 text-blue-800',
      'es': 'bg-green-100 text-green-800',
      'fr': 'bg-purple-100 text-purple-800',
      'de': 'bg-yellow-100 text-yellow-800',
      'ja': 'bg-red-100 text-red-800',
      'ko': 'bg-pink-100 text-pink-800',
      'zh': 'bg-orange-100 text-orange-800'
    };
    
    return colors[language] || 'bg-gray-100 text-gray-800';
  };
  
  // Get language name
  const getLanguageName = (code: string): string => {
    const names: Record<string, string> = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi'
    };
    
    return names[code] || code.toUpperCase();
  };
  
  // If children prop is provided, use render prop pattern
  if (children) {
    return (
      <>
        {children({
          translatedText: translation.translatedText,
          originalText,
          sourceLanguage: translation.sourceLanguage,
          targetLanguage: translation.targetLanguage,
          isLoading,
          error,
          fromCache
        })}
      </>
    );
  }
  
  return (
    <div className={`translated-content ${className}`}>
      {/* Language badge */}
      {showLanguageBadge && !isLoading && (
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-1 rounded-full ${getLanguageBadgeColor(translation.targetLanguage)}`}>
            {getLanguageName(translation.targetLanguage)}
            {fromCache && ' (Cached)'}
          </span>
          
          {translation.sourceLanguage !== translation.targetLanguage && (
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              {showTranslation ? 'Show Original' : 'Show Translation'}
            </button>
          )}
        </div>
      )}
      
      {/* Loading state */}
      {isLoading && (
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      )}
      
      {/* Error state */}
      {error && !isLoading && (
        <div className="text-sm text-red-600 mb-2">
          Translation unavailable. Showing original text.
        </div>
      )}
      
      {/* Content */}
      {!isLoading && (
        <>
          {/* Translated text */}
          <div className={`content-text ${textClassName}`}>
            {truncatedDisplayText}
          </div>
          
          {/* Show original if requested */}
          {showOriginal && translation.sourceLanguage !== translation.targetLanguage && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-500 mb-1">
                Original ({getLanguageName(translation.sourceLanguage)}):
              </div>
              <div className="text-sm text-gray-600 italic">
                {truncatedOriginalText}
              </div>
            </div>
          )}
          
          {/* Translation status */}
          <div className="mt-2 text-xs text-gray-400">
            {isLoading ? 'Translating...' : 
             error ? 'Translation failed' :
             fromCache ? 'Translated (cached)' :
             translation.sourceLanguage === translation.targetLanguage ? 'No translation needed' :
             'Translated'}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Simplified component for post content
 */
export const TranslatedPost: React.FC<{
  postId: string;
  content: string;
  maxLength?: number;
  truncate?: boolean;
}> = ({ postId, content, maxLength = 500, truncate = false }) => {
  return (
    <TranslatedContent
      contentId={postId}
      originalText={content}
      contentType="post"
      maxLength={maxLength}
      truncate={truncate}
      showLanguageBadge={true}
      autoTranslate={true}
    />
  );
};

/**
 * Simplified component for chat messages
 */
export const TranslatedMessage: React.FC<{
  messageId: string;
  content: string;
  showOriginal?: boolean;
}> = ({ messageId, content, showOriginal = false }) => {
  return (
    <TranslatedContent
      contentId={messageId}
      originalText={content}
      contentType="message"
      showOriginal={showOriginal}
      showLanguageBadge={false}
      autoTranslate={true}
    />
  );
};

/**
 * Component for displaying content with translation toggle
 */
export const TranslationToggle: React.FC<{
  contentId: string;
  originalText: string;
  contentType: 'post' | 'message' | 'venue' | 'comment';
  defaultLanguage?: string;
}> = ({ contentId, originalText, contentType, defaultLanguage = 'en' }) => {
  const [targetLanguage, setTargetLanguage] = useState(defaultLanguage);
  
  const { translation, isLoading } = useContentTranslation(
    contentId,
    originalText,
    contentType,
    { autoTranslate: false }
  );
  
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' }
  ];
  
  return (
    <div className="translation-toggle">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-gray-600">Translate to:</span>
        <select
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          className="text-sm border rounded px-2 py-1"
          disabled={isLoading}
        >
          {languages.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
      
      <TranslatedContent
        contentId={contentId}
        originalText={originalText}
        contentType={contentType}
        targetLanguage={targetLanguage}
        autoTranslate={false}
      />
    </div>
  );
};

export default TranslatedContent;