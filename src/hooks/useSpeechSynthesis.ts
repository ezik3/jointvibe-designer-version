import { useState, useCallback, useRef, useEffect } from 'react';

export type SpeechState = 'idle' | 'speaking' | 'paused';

interface UseSpeechSynthesisOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onWord?: (word: string) => void;
  onBoundary?: (charIndex: number) => void;
}

export function useSpeechSynthesis(options: UseSpeechSynthesisOptions = {}) {
  const [state, setState] = useState<SpeechState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textRef = useRef<string>('');

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis?.getVoices() || [];
      setVoices(availableVoices);
      
      // Select a good default voice (prefer natural sounding ones)
      const preferredVoices = availableVoices.filter(v => 
        v.lang.startsWith('en') && 
        (v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Enhanced'))
      );
      
      if (preferredVoices.length > 0) {
        setSelectedVoice(preferredVoices[0]);
      } else {
        const englishVoice = availableVoices.find(v => v.lang.startsWith('en'));
        setSelectedVoice(englishVoice || availableVoices[0] || null);
      }
    };

    loadVoices();
    
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis || isMuted) {
      // If muted, still trigger callbacks for animation
      options.onStart?.();
      setTimeout(() => options.onEnd?.(), text.length * 50);
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    textRef.current = text;
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setState('speaking');
      options.onStart?.();
    };

    utterance.onend = () => {
      setState('idle');
      options.onEnd?.();
    };

    utterance.onerror = () => {
      setState('idle');
      options.onEnd?.();
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        options.onBoundary?.(event.charIndex);
        const word = text.substring(event.charIndex, event.charIndex + (event.charLength || 0));
        options.onWord?.(word);
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [isMuted, selectedVoice, options]);

  const stop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setState('idle');
  }, []);

  const pause = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.pause();
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
      setState('speaking');
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
    if (!isMuted) {
      stop();
    }
  }, [isMuted, stop]);

  return {
    speak,
    stop,
    pause,
    resume,
    state,
    isMuted,
    toggleMute,
    voices,
    selectedVoice,
    setSelectedVoice,
    isSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  };
}
