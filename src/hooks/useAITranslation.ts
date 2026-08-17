/**
 * AI Translation Hook
 * Integrates translation with AI assistant
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { detectLanguage, getTargetLanguages } from '../../shared/translationUtils';

// Types
export interface AITranslationContext {
  userLanguage: string;
  conversationLanguage: string;
  translationEnabled: boolean;
  autoDetect: boolean;
}

export interface AIMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  language: string;
  translatedContent?: string;
  translationConfidence?: number;
}

export interface UseAITranslationOptions {
  autoDetectLanguage?: boolean;
  autoTranslateMessages?: boolean;
  preserveOriginal?: boolean;
  contextWindow?: number;
}

/**
 * Hook for AI-assisted translation in conversations
 */
export function useAITranslation(options: UseAITranslationOptions = {}) {
  const {
    autoDetectLanguage = true,
    autoTranslateMessages = true,
    preserveOriginal = true,
    contextWindow = 10
  } = options;
  
  const { user } = useAuth();
  
  const [context, setContext] = useState<AITranslationContext>({
    userLanguage: 'en',
    conversationLanguage: 'en',
    translationEnabled: true,
    autoDetect: true
  });
  
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Get user language from profile
  const fetchUserLanguage = useCallback(async (): Promise<string> => {
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
      console.error('Failed to fetch user language:', error);
      return 'en';
    }
  }, [user?.id]);
  
  // Initialize context
  useEffect(() => {
    const initializeContext = async () => {
      const userLanguage = await fetchUserLanguage();
      
      setContext(prev => ({
        ...prev,
        userLanguage,
        conversationLanguage: userLanguage
      }));
    };
    
    initializeContext();
  }, [fetchUserLanguage]);
  
  // Detect language of incoming message
  const detectMessageLanguage = useCallback(async (
    content: string
  ): Promise<string> => {
    if (!autoDetectLanguage) {
      return context.conversationLanguage;
    }
    
    return detectLanguage(content);
  }, [autoDetectLanguage, context.conversationLanguage]);
  
  // Process user message for AI
  const processUserMessage = useCallback(async (
    content: string
  ): Promise<{
    original: string;
    forAI: string;
    detectedLanguage: string;
    translationConfidence: number;
  }> => {
    setIsProcessing(true);
    
    try {
      const detectedLanguage = await detectMessageLanguage(content);
      
      const newMessage: AIMessage = {
        id: Date.now().toString(),
        content,
        role: 'user',
        language: detectedLanguage,
      };
      
      setMessages(prev => {
        const updated = [...prev, newMessage];
        return updated.slice(-contextWindow);
      });
      
      return {
        original: content,
        forAI: content,
        detectedLanguage,
        translationConfidence: 1.0
      };
      
    } finally {
      setIsProcessing(false);
    }
  }, [detectMessageLanguage, contextWindow]);
  
  // Process AI response for user
  const processAIResponse = useCallback(async (
    aiResponse: string
  ): Promise<{
    original: string;
    forUser: string;
    translationConfidence: number;
  }> => {
    setIsProcessing(true);
    
    try {
      const newMessage: AIMessage = {
        id: Date.now().toString(),
        content: aiResponse,
        role: 'assistant',
        language: 'en',
      };
      
      setMessages(prev => {
        const updated = [...prev, newMessage];
        return updated.slice(-contextWindow);
      });
      
      return {
        original: aiResponse,
        forUser: aiResponse,
        translationConfidence: 1.0
      };
      
    } finally {
      setIsProcessing(false);
    }
  }, [contextWindow]);
  
  // Update conversation language
  const updateConversationLanguage = useCallback((language: string) => {
    setContext(prev => ({
      ...prev,
      conversationLanguage: language
    }));
  }, []);
  
  // Toggle translation
  const toggleTranslation = useCallback(() => {
    setContext(prev => ({
      ...prev,
      translationEnabled: !prev.translationEnabled
    }));
  }, []);
  
  // Get conversation context for AI
  const getConversationContext = useCallback((): string => {
    return messages
      .map(msg => {
        if (msg.role === 'user') {
          return `User (${msg.language}): ${msg.translatedContent || msg.content}`;
        } else {
          return `Assistant: ${msg.content}`;
        }
      })
      .join('\n');
  }, [messages]);
  
  // Get messages in user's language
  const getMessagesForUser = useCallback((): Array<{
    id: string;
    content: string;
    role: 'user' | 'assistant';
    isTranslated: boolean;
    originalLanguage?: string;
  }> => {
    return messages.map(msg => ({
      id: msg.id,
      content: msg.translatedContent || msg.content,
      role: msg.role,
      isTranslated: !!(msg.translatedContent && msg.translatedContent !== msg.content),
      originalLanguage: msg.language !== context.userLanguage ? msg.language : undefined
    }));
  }, [messages, context.userLanguage]);
  
  // Clear conversation
  const clearConversation = useCallback(() => {
    setMessages([]);
  }, []);
  
  // Get translation statistics
  const getTranslationStats = useCallback(() => {
    const totalMessages = messages.length;
    const translatedMessages = messages.filter(msg => 
      msg.translatedContent && msg.translatedContent !== msg.content
    ).length;
    
    const avgConfidence = messages
      .filter(msg => msg.translationConfidence)
      .reduce((sum, msg) => sum + (msg.translationConfidence || 0), 0) /
      (messages.filter(msg => msg.translationConfidence).length || 1);
    
    return {
      totalMessages,
      translatedMessages,
      translationRate: totalMessages > 0 ? (translatedMessages / totalMessages) * 100 : 0,
      averageConfidence: avgConfidence
    };
  }, [messages]);
  
  return {
    context,
    messages: getMessagesForUser(),
    isProcessing,
    processUserMessage,
    processAIResponse,
    updateConversationLanguage,
    toggleTranslation,
    clearConversation,
    getConversationContext,
    getTranslationStats,
    setContext: (updates: Partial<AITranslationContext>) => {
      setContext(prev => ({ ...prev, ...updates }));
    }
  };
}

/**
 * Hook for AI to understand and respond in multiple languages
 */
export function useMultilingualAI(options: UseAITranslationOptions = {}) {
  const aiTranslation = useAITranslation(options);
  
  const getEnhancedPrompt = useCallback((
    userMessage: string,
    additionalContext?: string
  ): string => {
    const { context, getConversationContext } = aiTranslation;
    
    return `You are a multilingual AI assistant. The user prefers to communicate in ${context.userLanguage}.

User's message: "${userMessage}"
User's preferred language: ${context.userLanguage}

Previous conversation:
${getConversationContext()}

${additionalContext ? `Additional context: ${additionalContext}\n\n` : ''}

Instructions:
1. Understand the user's message (it may be in any language)
2. Respond in ${context.userLanguage} unless the user asks for another language
3. Keep responses natural and culturally appropriate

Response:`;
  }, [aiTranslation]);
  
  return {
    ...aiTranslation,
    getEnhancedPrompt
  };
}
