import { useState, useCallback, useRef } from "react";

interface UseElevenLabsTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  /** Callback with audio element for lip sync integration */
  onAudioReady?: (audio: HTMLAudioElement) => void;
}

export function useElevenLabsTTS(options: UseElevenLabsTTSOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string): Promise<HTMLAudioElement | null> => {
    if (isMuted || !text.trim()) return null;

    stop();
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Expose audio element for lip sync before playing
      options.onAudioReady?.(audio);

      audio.onplay = () => {
        setIsSpeaking(true);
        options.onStart?.();
      };

      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        options.onEnd?.();
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        options.onError?.("Audio playback failed");
      };

      setIsLoading(false);
      await audio.play();
      
      return audio;
    } catch (error) {
      console.error("ElevenLabs TTS error:", error);
      setIsLoading(false);
      setIsSpeaking(false);
      options.onError?.(error instanceof Error ? error.message : "TTS failed");
      return null;
    }
  }, [isMuted, stop, options]);

  const toggleMute = useCallback(() => {
    if (!isMuted) {
      stop();
    }
    setIsMuted(prev => !prev);
  }, [isMuted, stop]);

  /** Get the current audio element (for external analysis) */
  const getAudioElement = useCallback(() => audioRef.current, []);

  return {
    speak,
    stop,
    toggleMute,
    isLoading,
    isSpeaking,
    isMuted,
    getAudioElement,
  };
}
