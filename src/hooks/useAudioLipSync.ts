import { useState, useEffect, useCallback, useRef } from 'react';
import { LipSyncEngine, LipSyncState } from '@/avatar/LipSyncEngine';

interface UseAudioLipSyncOptions {
  /** Smoothing factor for mouth movement (0-1, lower = smoother) */
  smoothing?: number;
  /** Enable/disable lip sync */
  enabled?: boolean;
}

interface UseAudioLipSyncReturn {
  /** Current mouth openness (0-1) */
  mouthOpen: number;
  /** Current audio volume (0-1) */
  volume: number;
  /** Whether audio is playing */
  isPlaying: boolean;
  /** Smoothed amplitude for other animations */
  amplitude: number;
  /** Connect an audio element to the lip sync engine */
  connectAudio: (audio: HTMLAudioElement) => void;
  /** Stop lip sync analysis */
  stop: () => void;
}

/**
 * Hook for real-time audio-driven lip sync
 * Analyzes audio amplitude and returns mouth movement values
 */
export function useAudioLipSync(
  options: UseAudioLipSyncOptions = {}
): UseAudioLipSyncReturn {
  const { enabled = true } = options;
  
  const [state, setState] = useState<LipSyncState>({
    mouthOpen: 0,
    volume: 0,
    isPlaying: false,
    smoothedAmplitude: 0,
  });
  
  const engineRef = useRef<LipSyncEngine | null>(null);
  
  // Initialize engine
  useEffect(() => {
    if (!enabled) {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      return;
    }
    
    engineRef.current = new LipSyncEngine();
    engineRef.current.setUpdateCallback(setState);
    
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, [enabled]);
  
  const connectAudio = useCallback((audio: HTMLAudioElement) => {
    if (!engineRef.current || !enabled) return;
    engineRef.current.connectToAudio(audio);
  }, [enabled]);
  
  const stop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
  }, []);
  
  return {
    mouthOpen: state.mouthOpen,
    volume: state.volume,
    isPlaying: state.isPlaying,
    amplitude: state.smoothedAmplitude,
    connectAudio,
    stop,
  };
}
