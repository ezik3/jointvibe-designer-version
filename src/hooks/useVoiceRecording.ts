import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UseVoiceRecordingOptions {
  /** Auto-send transcript immediately (Voice Mode) or put in input (Text Mode) */
  autoSend?: boolean;
  /** Callback when transcript is ready */
  onTranscript?: (text: string) => void;
  /** Callback for volume level updates (0-1) */
  onVolumeChange?: (volume: number) => void;
  /** Silence duration in ms before auto-stop (default 1200ms) */
  silenceThreshold?: number;
  /** Minimum volume level to consider as speech (0-1, default 0.02) */
  voiceThreshold?: number;
}

export function useVoiceRecording({
  autoSend = false,
  onTranscript,
  onVolumeChange,
  silenceThreshold = 1200,
  // Default tuned lower so speech is detected reliably on laptop/phone mics
  voiceThreshold = 0.008,
}: UseVoiceRecordingOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const volumeAnimationRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  
  const { toast } = useToast();

  // Cleanup function
  const cleanup = useCallback(() => {
    if (volumeAnimationRef.current) {
      cancelAnimationFrame(volumeAnimationRef.current);
      volumeAnimationRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Transcribe audio blob
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64Audio }
      });

      if (error) throw error;
      
      if (data?.text && data.text.trim()) {
        onTranscript?.(data.text.trim());
      } else {
        toast({
          title: "No speech detected",
          description: "Please try speaking louder or closer to the microphone.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Voice input failed",
        description: "Could not process your voice. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [onTranscript, toast]);

  // Monitor volume and detect silence
  const startVolumeMonitor = useCallback(() => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const normalizedVolume = Math.min(1, rms / 128); // Normalize to 0-1
      
      setCurrentVolume(normalizedVolume);
      onVolumeChange?.(normalizedVolume);

      // Detect speech/silence
      if (normalizedVolume > voiceThreshold) {
        // User is speaking
        hasSpokenRef.current = true;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else if (hasSpokenRef.current && !silenceTimerRef.current) {
        // User stopped speaking, start silence timer
        silenceTimerRef.current = setTimeout(() => {
          // Auto-stop recording after silence
          stopRecording();
        }, silenceThreshold);
      }

      // Continue monitoring
      if (isRecording || streamRef.current) {
        volumeAnimationRef.current = requestAnimationFrame(checkVolume);
      }
    };

    volumeAnimationRef.current = requestAnimationFrame(checkVolume);
  }, [voiceThreshold, silenceThreshold, onVolumeChange, isRecording]);

  // Request microphone permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setHasPermission(false);
      toast({
        title: "Microphone access denied",
        description: "Please enable microphone access in your browser settings to use voice features.",
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      setHasPermission(true);
      streamRef.current = stream;
      hasSpokenRef.current = false;

      // Setup audio analysis for volume monitoring
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        cleanup();
        setIsRecording(false);
        
        // Only transcribe if we have audio
        if (audioBlob.size > 0) {
          transcribeAudio(audioBlob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Start volume monitoring for VAD
      startVolumeMonitor();
    } catch (error) {
      console.error('Microphone access error:', error);
      setHasPermission(false);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice input.",
        variant: "destructive"
      });
    }
  }, [cleanup, transcribeAudio, startVolumeMonitor, toast]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    currentVolume,
    hasPermission,
    startRecording,
    stopRecording,
    toggleRecording,
    requestPermission,
  };
}
