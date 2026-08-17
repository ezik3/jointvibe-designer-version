import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechRecognitionCtor = new () => any;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as SpeechRecognitionCtor | null;
}

interface UseSpeechRecognitionOptions {
  language?: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
}

/**
 * Browser-native live speech-to-text (Chrome/Edge/Android). Not supported on all browsers.
 *
 * IMPORTANT: Some browsers frequently end recognition sessions (even in continuous mode),
 * so we implement a THROTTLED auto-restart to avoid rapid start/stop thrashing.
 */
export function useSpeechRecognition({
  language,
  onInterim,
  onFinal,
  onError,
}: UseSpeechRecognitionOptions = {}) {
  const ctor = useMemo(() => (typeof window !== "undefined" ? getSpeechRecognitionCtor() : null), []);
  const isSupported = !!ctor;

  const defaultLanguage = useMemo(() => {
    try {
      return (typeof navigator !== "undefined" && navigator.language) ? navigator.language : "en-US";
    } catch {
      return "en-US";
    }
  }, []);

  const effectiveLanguage = language ?? defaultLanguage;

  // Keep latest callbacks in refs so the underlying SpeechRecognition instance
  // never calls stale closures (common cause of "it stopped sending" / UI flapping).
  const onInterimRef = useRef<UseSpeechRecognitionOptions["onInterim"]>(onInterim);
  const onFinalRef = useRef<UseSpeechRecognitionOptions["onFinal"]>(onFinal);
  const onErrorRef = useRef<UseSpeechRecognitionOptions["onError"]>(onError);

  useEffect(() => {
    onInterimRef.current = onInterim;
  }, [onInterim]);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<number | null>(null);
  const startRef = useRef<(() => void) | null>(null);

  const requestedRef = useRef(false);
  const startingRef = useRef(false);
  const listeningRef = useRef(false);

  const lastStartAtRef = useRef<number>(0);
  const fastEndCountRef = useRef<number>(0);
  const restartDelayMsRef = useRef<number>(800);

  const [isListening, setIsListening] = useState(false);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const createRecognitionIfNeeded = useCallback(() => {
    if (!ctor) return null;
    if (recognitionRef.current) return recognitionRef.current;

    const recognition: any = new ctor();
    recognitionRef.current = recognition;

    recognition.lang = effectiveLanguage;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      startingRef.current = false;
      listeningRef.current = true;
      fastEndCountRef.current = 0;
      restartDelayMsRef.current = 800;
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0]?.transcript ?? "";

        if (res.isFinal) {
          const finalText = txt.trim();
          if (finalText) onFinalRef.current?.(finalText);
          onInterimRef.current?.("");
        } else {
          interim += txt;
        }
      }
      if (interim) onInterimRef.current?.(interim.trim());
    };

    recognition.onerror = (e: any) => {
      const msg = e?.error ? String(e.error) : "speech_recognition_error";

      // These are normal lifecycle-ish errors in some browsers; don't spam the user.
      if (msg === "no-speech" || msg === "aborted") return;

      // Permission/blocked errors should stop restarts.
      if (msg === "not-allowed" || msg === "service-not-allowed") {
        requestedRef.current = false;
        clearRestartTimer();
      }

      onErrorRef.current?.(msg);
    };

    recognition.onend = () => {
      listeningRef.current = false;
      startingRef.current = false;
      setIsListening(false);

      if (!requestedRef.current) return;

      // Throttle restarts to prevent UI thrashing.
      const now = Date.now();
      const elapsed = now - (lastStartAtRef.current || now);
      if (elapsed < 700) {
        fastEndCountRef.current += 1;
        // Backoff quickly if we're ending too fast (prevents 10x/sec flashing)
        restartDelayMsRef.current = Math.min(4000, restartDelayMsRef.current + 600);
      } else {
        fastEndCountRef.current = 0;
        restartDelayMsRef.current = 800;
      }

      // If it's *still* ending instantly, recreate the instance occasionally.
      if (fastEndCountRef.current >= 4) {
        recognitionRef.current = null;
      }

      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        if (!requestedRef.current) return;
        // Avoid restarting if a start is already in-flight.
        if (startingRef.current || listeningRef.current) return;
        // Call latest start() without capturing stale closures.
        startRef.current?.();
      }, restartDelayMsRef.current);
    };

    return recognition;
  }, [ctor, effectiveLanguage, clearRestartTimer]);

  // If language changes, update the active instance.
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = effectiveLanguage;
    }
  }, [effectiveLanguage]);

  const stop = useCallback(() => {
    requestedRef.current = false;
    clearRestartTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, [clearRestartTimer]);

  const start = useCallback(() => {
    if (!ctor) {
      onErrorRef.current?.("Speech recognition is not supported in this browser.");
      return;
    }

    requestedRef.current = true;
    clearRestartTimer();

    // If already starting/listening, don't spam start()
    if (startingRef.current || listeningRef.current) return;

    const recognition = createRecognitionIfNeeded();
    if (!recognition) return;

    startingRef.current = true;
    lastStartAtRef.current = Date.now();

    try {
      recognition.start();
    } catch (e) {
      startingRef.current = false;
      // This commonly happens if start is called too quickly; schedule a safe retry.
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        if (requestedRef.current) start();
      }, 800);
    }
  }, [ctor, createRecognitionIfNeeded, clearRestartTimer]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const toggle = useCallback(() => {
    if (requestedRef.current) stop();
    else start();
  }, [start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      requestedRef.current = false;
      clearRestartTimer();
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [clearRestartTimer]);

  return {
    isSupported,
    isListening,
    start,
    stop,
    toggle,
  };
}
