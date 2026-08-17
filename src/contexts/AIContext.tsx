import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Emotion } from '@/avatar/EmotionEngine';
import { useTranslation } from 'react-i18next';

export type AIMode = 'customer' | 'venue' | 'owner';

interface AIContextValue {
  // Current AI state
  mode: AIMode;
  venueId: string | null;
  isOpen: boolean;
  isSpeaking: boolean;
  currentEmotion: Emotion;
  
  // Actions
  setMode: (mode: AIMode) => void;
  setVenueId: (venueId: string | null) => void;
  openAI: () => void;
  closeAI: () => void;
  toggleAI: () => void;
  setIsSpeaking: (speaking: boolean) => void;
  setEmotion: (emotion: Emotion) => void;
}

const AIContext = createContext<AIContextValue | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  const [mode, setMode] = useState<AIMode>('customer');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>('neutral');

  const openAI = useCallback(() => setIsOpen(true), []);
  const closeAI = useCallback(() => setIsOpen(false), []);
  const toggleAI = useCallback(() => setIsOpen(prev => !prev), []);
  
  const setEmotion = useCallback((emotion: Emotion) => {
    setCurrentEmotion(emotion);
  }, []);

  return (
    <AIContext.Provider value={{
      mode,
      venueId,
      isOpen,
      isSpeaking,
      currentEmotion,
      setMode,
      setVenueId,
      openAI,
      closeAI,
      toggleAI,
      setIsSpeaking,
      setEmotion,
    }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
}
