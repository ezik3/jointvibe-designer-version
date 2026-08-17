import { useState, useCallback, useRef, useEffect } from "react";

interface UseStreamingTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  /** Callback with timing info for debugging */
  onTiming?: (timing: TTSTiming) => void;
}

export interface TTSTiming {
  requestStart: number;
  firstByteReceived: number;
  playbackStart: number;
  totalLatency: number;
}

function normalizeForTTS(text: string): string {
  return text.replace(/(\d+(?:\.\d+)?)\s*km\b/gi, (m, numStr) => {
    const n = Number(numStr);
    const unit = Number.isFinite(n) && Math.abs(n - 1) < 1e-9 ? "kilometre" : "kilometres";
    return `${numStr} ${unit}`;
  });
}

// Extract first N sentences from text for faster voice responses
function extractFirstSentences(text: string, maxSentences = 4): string {
  const cleaned = normalizeForTTS(text.replace(/\[EMO=[^\]]+\]/g, '').trim());
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  
  let result = '';
  let count = 0;
  
  for (const sentence of sentences) {
    if (count >= maxSentences) break;
    if (result.length + sentence.length > 420) break;
    result += (result ? ' ' : '') + sentence;
    count++;
  }
  
  return result || cleaned.slice(0, 250);
}

// Singleton AudioContext for mobile compatibility
let audioContextInstance: AudioContext | null = null;
let audioContextUnlocked = false;

function getAudioContext(): AudioContext {
  if (!audioContextInstance) {
    audioContextInstance = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContextInstance;
}

// Unlock audio context on user gesture (required for mobile)
function unlockAudioContext(): void {
  if (audioContextUnlocked) return;
  
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => {
      audioContextUnlocked = true;
      console.log("[TTS] AudioContext unlocked for mobile playback");
    });
  } else {
    audioContextUnlocked = true;
  }
}

// Add global listener for first user interaction to unlock audio
if (typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'click', 'keydown'];
  const handleUnlock = () => {
    unlockAudioContext();
    unlockEvents.forEach(e => window.removeEventListener(e, handleUnlock, true));
  };
  unlockEvents.forEach(e => window.addEventListener(e, handleUnlock, { once: true, capture: true }));
}

export function useStreamingTTS(options: UseStreamingTTSOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timingRef = useRef<Partial<TTSTiming>>({});
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Ensure audio context is unlocked when hook is used
  useEffect(() => {
    unlockAudioContext();
  }, []);

  const stop = useCallback(() => {
    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop Web Audio source
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    
    // Fallback: stop HTML Audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    
    setIsSpeaking(false);
  }, []);

  /**
   * FIX 3: "Eager TTS" — accepts partial text from SSE stream.
   * Call this as soon as 1-2 sentences are ready instead of waiting for the
   * full AI response. The ElevenLabs streaming endpoint returns audio chunks
   * that we play via MediaSource / HTML Audio as they arrive.
   */
  const speak = useCallback(async (text: string): Promise<void> => {
    if (isMuted || !text.trim()) return;

    stop();

    // Ensure audio context is ready
    unlockAudioContext();

    // Use the first few sentences for voice (balanced speed + completeness)
    const voiceText = extractFirstSentences(text, 4);
    console.log(`[TTS] Speaking (${voiceText.length} chars): "${voiceText.slice(0, 50)}..."`);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Start timing
    timingRef.current = { requestStart: performance.now() };

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts-stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: voiceText }),
          signal: abortController.signal,
        }
      );

      timingRef.current.firstByteReceived = performance.now();

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      // Check if response is JSON (error) or audio stream
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        throw new Error(data.error || "TTS failed");
      }

      // FIX 3: Stream audio via Blob URL as chunks arrive, play immediately
      // Collect chunks into a blob and start playback ASAP using HTML Audio
      // which can play partial MP3 data via a blob URL.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body for TTS stream");

      const chunks: Uint8Array[] = [];
      let firstChunkPlayed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (abortController.signal.aborted) return;
        if (done) break;

        chunks.push(value);

        // Once we have enough data for the decoder to start (~8KB+), begin playback
        if (!firstChunkPlayed) {
          const totalSize = chunks.reduce((s, c) => s + c.length, 0);
          if (totalSize >= 8192) {
            firstChunkPlayed = true;
            // Start playback with what we have so far
            startPlayback(chunks, abortController);
          }
        }
      }

      // If stream was too short to trigger early playback, play now
      if (!firstChunkPlayed && chunks.length > 0) {
        startPlayback(chunks, abortController);
      }

    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      console.error("Streaming TTS error:", error);
      setIsSpeaking(false);
      options.onError?.(error instanceof Error ? error.message : "TTS failed");
    }
  }, [isMuted, stop, options]);

  // Helper: concatenate chunks and play via HTML Audio (works on all browsers incl. mobile)
  const startPlayback = useCallback((chunks: Uint8Array[], abortController: AbortController) => {
    const totalLength = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const audioBlob = new Blob([merged], { type: 'audio/mpeg' });
    const audio = new Audio();
    audioRef.current = audio;
    audio.src = URL.createObjectURL(audioBlob);

    audio.onplay = () => {
      timingRef.current.playbackStart = performance.now();
      timingRef.current.totalLatency =
        timingRef.current.playbackStart! - timingRef.current.requestStart!;
      
      console.log(`[TTS] Playback started - Latency: ${timingRef.current.totalLatency.toFixed(0)}ms`);
      
      if (options.onTiming && timingRef.current.requestStart) {
        options.onTiming(timingRef.current as TTSTiming);
      }
      
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

    if (!abortController.signal.aborted) {
      audio.play().catch(() => {
        setIsSpeaking(false);
        audioRef.current = null;
      });
    }
  }, [options]);

  const toggleMute = useCallback(() => {
    if (!isMuted) {
      stop();
    }
    setIsMuted(prev => !prev);
  }, [isMuted, stop]);

  return {
    speak,
    stop,
    toggleMute,
    isSpeaking,
    isMuted,
  };
}
