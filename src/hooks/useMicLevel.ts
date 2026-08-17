import { useCallback, useEffect, useRef, useState } from "react";

interface UseMicLevelOptions {
  /** Minimum volume level to consider as speech (0-1, default 0.008) */
  voiceThreshold?: number;
  /** Callback for volume updates (0-1) */
  onVolumeChange?: (volume: number) => void;
}

/**
 * Lightweight mic RMS meter for UI (orb scaling) without recording.
 */
export function useMicLevel({ voiceThreshold = 0.008, onVolumeChange }: UseMicLevelOptions = {}) {
  const [isActive, setIsActive] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [volume, setVolume] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsActive(false);
    setVolume(0);
    onVolumeChange?.(0);
  }, [onVolumeChange]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setHasPermission(true);
      return true;
    } catch {
      setHasPermission(false);
      return false;
    }
  }, []);

  const start = useCallback(async () => {
    if (isActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setHasPermission(true);
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalized = Math.min(1, rms / 128);

        // Minor noise floor clamp
        const cleaned = normalized < voiceThreshold * 0.5 ? 0 : normalized;
        setVolume(cleaned);
        onVolumeChange?.(cleaned);

        rafRef.current = requestAnimationFrame(tick);
      };

      setIsActive(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setHasPermission(false);
      cleanup();
    }
  }, [cleanup, isActive, onVolumeChange, voiceThreshold]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    isActive,
    hasPermission,
    volume,
    requestPermission,
    start,
    stop,
  };
}
