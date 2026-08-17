import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Volume2, VolumeX, Send, Mic, Square, MessageSquare, PhoneCall, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import SwipeableChatPanel from "./SwipeableChatPanel";
import { useStreamingTTS } from "@/hooks/useStreamingTTS";
import { useAIChat, FILLER_PHRASE_SET } from "@/hooks/useAIChat";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useMicLevel } from "@/hooks/useMicLevel";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useWakeLock } from "@/hooks/useWakeLock";
import AIUsageIndicator from "./AvatarAssistant/AIUsageIndicator";
import { useTranslation } from 'react-i18next';
import "./floating-ai-button.css";

// ---------------------------------------------------------------------------
// Echo / feedback loop suppression
// Returns true when a transcript looks like it was picked up from the speaker
// (i.e. the AI's own TTS output). Compares word overlap between transcript and
// the last TTS string — if >60% of significant words match, it's likely echo.
// ---------------------------------------------------------------------------
function looksLikeEcho(transcript: string, ttsText: string): boolean {
  if (!transcript || !ttsText) return false;
  const t = transcript.toLowerCase().trim();
  const s = ttsText.toLowerCase();
  if (t.length < 4) return false;
  const words = t.split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return false;
  const matches = words.filter(w => s.includes(w));
  return matches.length / words.length > 0.6;
}

interface FloatingAIButtonProps {
  mode?: 'customer' | 'venue';
  venueId?: string;
  defaultOpen?: boolean;
  onClose?: () => void;
  visible?: boolean;
}

export const OPEN_CUSTOMER_AI_EVENT = "joint-vibe:open-customer-ai";

export default function FloatingAIButton({ mode: propMode, venueId: propVenueId, defaultOpen = false, onClose, visible = true }: FloatingAIButtonProps = {}) {
  const { t } = useTranslation('common');
  // Get user's current location
  const { latitude, longitude } = useGeolocation({ enableHighAccuracy: true });
  const [showChat, setShowChat] = useState(defaultOpen);
  const [inputValue, setInputValue] = useState("");
  // Default to voice mode ON
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [sttPausedForTTS, setSttPausedForTTS] = useState(false);
  const [showTopUpDialog, setShowTopUpDialog] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const { toast } = useToast();

  // Prevent double-speaking the same assistant message
  const lastSpokenAssistantRef = useRef<string>("");
  // Tracks whether eager TTS already fired for the current AI response.
  // Prevents the isLoading=false effect from speaking the same content again.
  const eagerTTSFiredRef = useRef(false);

  // Guard against duplicate auto-start attempts (React StrictMode / rapid renders)
  const autoStartInFlightRef = useRef(false);

  // Full-duplex support refs
  // When TTS starts: record timestamp so we can ignore microphone feedback for 300ms.
  const ttsStartedAtRef = useRef<number>(0);
  // Last text sent to TTS — used for echo/feedback suppression in STT callbacks.
  const lastTTSTextRef = useRef<string>("");
  // Tracks how long the user has been continuously above the barge-in volume threshold.
  // Reset on volume drop, TTS end, or successful interrupt.
  const bargeInSustainedSinceRef = useRef<number | null>(null);
  // Ref mirror of sttPausedForTTS state — lets STT callbacks read the latest value
  // synchronously without waiting for a React re-render to propagate the ref update.
  const sttPausedForTTSRef = useRef(false);

  // Refs for speech/mic to avoid circular dependency with TTS callbacks
  const speechRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const micLevelRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  
  // Wake lock to keep screen on during voice sessions
  const wakeLock = useWakeLock();

  // Use streaming TTS for faster response
  const { speak, stop: stopTTS, toggleMute, isMuted, isSpeaking: ttsSpeaking } = useStreamingTTS({
    onStart: () => {
      ttsStartedAtRef.current = Date.now();
      console.log("[TTS] Started speaking");
    },
    onEnd: () => {
      console.log("[TTS] Finished speaking");
    },
    onError: (err) => {
      console.error("[TTS] Error:", err);
    }
  });

  const handleEmotion = useCallback(() => {}, []);

  // Eager TTS: fires as soon as the first sentence streams in — no waiting for full response.
  const handleFirstSentenceReady = useCallback((text: string) => {
    if (isMuted) return;
    if (!text.trim()) return;
    eagerTTSFiredRef.current = true;
    lastSpokenAssistantRef.current = text;
    lastTTSTextRef.current = text;

    // Full-duplex: keep STT running — mic stays live for barge-in detection.
    // Just suppress transcript display so the AI's own words don't appear as user bubbles.
    if (isVoiceMode && voiceSessionActive) {
      sttPausedForTTSRef.current = true;
      setSttPausedForTTS(true);
      setLiveTranscript("");
      bargeInSustainedSinceRef.current = null;
    }
    void speak(text);
  }, [isMuted, isVoiceMode, speak, voiceSessionActive]);

  const handleQuotaExceeded = useCallback(() => {
    // Show toast with action button
    toast({
      title: "AI Credits Exhausted",
      description: "Tap 'Top Up' to continue chatting.",
      action: (
        <Button 
          size="sm" 
          onClick={() => setShowTopUpDialog(true)}
          className="bg-primary hover:bg-primary/90"
        >
          Top Up
        </Button>
      ),
    });
  }, [toast]);

  // Memoize location to avoid unnecessary re-renders
  const userLocation = useMemo(() => 
    latitude && longitude ? { latitude, longitude } : null, 
    [latitude, longitude]
  );

  const { messages, isLoading, sendMessage, cancelRequest } = useAIChat({
    mode: propMode || 'customer',
    venueId: propVenueId,
    userLocation,
    onEmotion: handleEmotion,
    onSpeakingChange: () => {},
    onQuotaExceeded: handleQuotaExceeded,
    onFirstSentenceReady: handleFirstSentenceReady,
  });

  // Unified interrupt: stops audio AND cancels the in-flight AI request atomically.
  // cancelRequest synchronously removes the filler/placeholder, so no ghost TTS trigger.
  // Safe to call even when nothing is active (all ops are no-ops when idle).
  const interruptCurrentResponse = useCallback(() => {
    stopTTS();
    cancelRequest();
  }, [cancelRequest, stopTTS]);

  // Voice-mode: commit + dedupe for live STT (prevents missing sends + duplicate sends).
  const lastCommittedUserRef = useRef<string>("");
  const silenceTimerRef = useRef<number | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const commitVoiceUtterance = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      if (!isVoiceMode || !voiceSessionActive) return;
      if (text === lastCommittedUserRef.current) return;

      console.log("[Voice] Commit utterance:", text);
      lastCommittedUserRef.current = text;
      clearSilenceTimer();

      // Remove draft transcript (it will now exist as a real chat bubble)
      setLiveTranscript("");
      setShowChat(true);

      // Unified interrupt: stop TTS + cancel any in-flight AI request.
      // sendMessage's cancel-and-replace also runs, but cancelRequest already
      // cleared the ref so it's a safe no-op double-call.
      interruptCurrentResponse();

      sendMessage(text);
    },
    [clearSilenceTimer, interruptCurrentResponse, isVoiceMode, sendMessage, voiceSessionActive]
  );

  const speech = useSpeechRecognition({
    language: (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : "en-US",
    onInterim: (t) => {
      // Full-duplex: during TTS, use transcript only for interrupt detection.
      // The STT engine keeps running — we just decide whether to act on its output.
      if (sttPausedForTTSRef.current) {
        // Echo suppression window: ignore first 300ms after TTS starts (speaker bleed).
        if (Date.now() - ttsStartedAtRef.current < 300) return;
        // Echo suppression: transcript word-matches the AI's own TTS output → skip.
        if (looksLikeEcho(t, lastTTSTextRef.current)) return;
        // Real user speech forming → transcript-based barge-in (lower latency than volume).
        if (t.trim().length >= 4) {
          console.log("[Interrupt] Real transcript forming during TTS — barge-in:", t.slice(0, 40));
          sttPausedForTTSRef.current = false; // sync immediately (before React re-render)
          setSttPausedForTTS(false);
          bargeInSustainedSinceRef.current = null;
          interruptCurrentResponse();
          setLiveTranscript(t);
          setShowChat(true);
        }
        return;
      }
      console.log("[Speech] Interim:", t);
      setLiveTranscript(t);
      setShowChat(true);
      clearSilenceTimer();
    },
    onFinal: (t) => {
      // Full-duplex: final result during TTS → interrupt + commit the utterance.
      if (sttPausedForTTSRef.current) {
        if (Date.now() - ttsStartedAtRef.current < 300) return;
        const final = t.trim();
        if (looksLikeEcho(final, lastTTSTextRef.current)) return;
        if (final.length >= 3) {
          console.log("[Interrupt+Commit] Final transcript during TTS:", final.slice(0, 40));
          sttPausedForTTSRef.current = false;
          setSttPausedForTTS(false);
          bargeInSustainedSinceRef.current = null;
          // commitVoiceUtterance calls interruptCurrentResponse internally
          commitVoiceUtterance(final);
        }
        return;
      }
      const final = t.trim();
      console.log("[Speech] Final:", final);
      commitVoiceUtterance(final);
    },
    onError: (err) => {
      console.error("[Speech] Error:", err);
      // If permission denied, keep voice mode on but fall back to tap-to-talk recording UX
      toast({
        title: "Voice recognition error",
        description: err,
        variant: "destructive",
      });
    },
  });

  const useLiveStt = isVoiceMode && speech.isSupported;

  // Speak the assistant response once it finishes streaming.
  // Skipped if eager TTS already fired (onFirstSentenceReady handled it).
  useEffect(() => {
    if (isMuted) return;
    if (isLoading) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = (last.content || "").trim();
    if (!text) return;
    // Never TTS a filler phrase — they're transient placeholders, not real responses.
    if (FILLER_PHRASE_SET.has(text)) return;

    // If eager TTS already spoke this generation, skip — reset flag for next turn.
    if (eagerTTSFiredRef.current) {
      eagerTTSFiredRef.current = false;
      lastSpokenAssistantRef.current = text;
      return;
    }

    if (text === lastSpokenAssistantRef.current) return;

    console.log("[TTS] Speaking response (full):", text.slice(0, 50) + "...");
    lastSpokenAssistantRef.current = text;
    lastTTSTextRef.current = text;

    // Full-duplex: keep STT running — mic stays live for barge-in detection.
    // Suppress transcript display only so the AI's own words don't show as user input.
    if (isVoiceMode && voiceSessionActive && useLiveStt) {
      sttPausedForTTSRef.current = true;
      setSttPausedForTTS(true);
      setLiveTranscript("");
      clearSilenceTimer();
      bargeInSustainedSinceRef.current = null;
    }

    void speak(text);
  }, [clearSilenceTimer, isLoading, isMuted, isVoiceMode, messages, speak, useLiveStt, voiceSessionActive]);

  const micLevel = useMicLevel({
    onVolumeChange: setVoiceVolume,
  });

  // Keep refs in sync
  useEffect(() => {
    speechRef.current = speech;
  }, [speech]);

  useEffect(() => {
    micLevelRef.current = micLevel;
  }, [micLevel]);

  // Mirror sttPausedForTTS into a ref so STT callbacks can read the latest value
  // synchronously (SpeechRecognition events fire before React re-renders).
  useEffect(() => {
    sttPausedForTTSRef.current = sttPausedForTTS;
  }, [sttPausedForTTS]);

  // Handle voice transcript
  const handleVoiceTranscript = useCallback((text: string) => {
    if (isVoiceMode) {
      // Voice Mode: auto-send
      setShowChat(true);
      sendMessage(text);
    } else {
      // Text Mode: put in input for review
      setInputValue(text);
      toast({
        title: "Voice transcribed",
        description: "Review your message and tap Send.",
      });
    }
  }, [isVoiceMode, sendMessage, toast]);

  // Voice recording hook with VAD
  const { 
    isRecording, 
    isTranscribing, 
    toggleRecording,
    requestPermission,
  } = useVoiceRecording({
    autoSend: isVoiceMode,
    onTranscript: handleVoiceTranscript,
    onVolumeChange: setVoiceVolume,
    silenceThreshold: 1200, // 1.2s of silence to auto-stop
  });

  // Full-duplex: when TTS starts, suppress transcript output but keep STT engine running.
  // When TTS ends, restore normal transcript processing after a brief settling delay.
  useEffect(() => {
    if (!useLiveStt || !isVoiceMode || !voiceSessionActive) return;

    if (ttsSpeaking) {
      if (!sttPausedForTTS) {
        sttPausedForTTSRef.current = true;
        setSttPausedForTTS(true);
        setLiveTranscript("");
        clearSilenceTimer();
        bargeInSustainedSinceRef.current = null;
        // Full-duplex: STT engine intentionally NOT stopped here — mic stays live.
      }
      return;
    }

    // TTS ended: restore normal transcript flow after 250ms settling.
    // (Prevents the trailing audio tail from being committed as a user message.)
    if (!ttsSpeaking && sttPausedForTTS) {
      const t = window.setTimeout(() => {
        if (!voiceSessionActive) return;
        sttPausedForTTSRef.current = false;
        setSttPausedForTTS(false);
        bargeInSustainedSinceRef.current = null;
        // Full-duplex: recognition kept running throughout — no restart needed.
      }, 250);
      return () => window.clearTimeout(t);
    }
  }, [clearSilenceTimer, isVoiceMode, sttPausedForTTS, ttsSpeaking, useLiveStt, voiceSessionActive]);

  // Live STT: show interim transcript as a real chat bubble (draft) like in your screenshot.
  const displayedMessages = useMemo(() => {
    const draft = useLiveStt && voiceSessionActive ? liveTranscript.trim() : "";
    if (!draft) return messages;
    return [...messages, { role: "user" as const, content: draft }];
  }, [liveTranscript, messages, useLiveStt, voiceSessionActive]);

  // Live STT: voice activity detection — auto-commit on silence + volume-based barge-in.
  useEffect(() => {
    if (!useLiveStt || !isVoiceMode || !voiceSessionActive) return;

    // ── Volume-based barge-in (debounced) ─────────────────────────────────────
    // Require volume > threshold sustained for 200ms to reject transient noise.
    // Only triggers while TTS is actively playing (not during the 250ms settling
    // window after TTS ends, where ttsSpeaking=false but sttPausedForTTS=true).
    // Transcript-based barge-in (onInterim) may fire earlier for quieter speech.
    if (ttsSpeaking) {
      if (voiceVolume > 0.05) {
        if (bargeInSustainedSinceRef.current === null) {
          bargeInSustainedSinceRef.current = Date.now();
        } else if (Date.now() - bargeInSustainedSinceRef.current >= 200) {
          // Echo suppression: don't trigger within 300ms of TTS starting.
          if (Date.now() - ttsStartedAtRef.current < 300) {
            bargeInSustainedSinceRef.current = null; // reset and wait
          } else {
            console.log("[Interrupt] Sustained user speech during TTS — volume barge-in triggered");
            bargeInSustainedSinceRef.current = null;
            interruptCurrentResponse();
          }
        }
      } else {
        // Volume dropped below threshold — reset the sustain window.
        bargeInSustainedSinceRef.current = null;
      }
      return; // skip normal VAD while TTS is playing
    }

    // Reset sustain timer when TTS stops (settling period or no TTS).
    if (sttPausedForTTS) {
      bargeInSustainedSinceRef.current = null;
      return; // still in settling window after TTS ended
    }

    // ── Normal VAD: silence detection → auto-commit ───────────────────────────
    const text = liveTranscript.trim();

    if (isLoading) {
      clearSilenceTimer();
      return;
    }

    if (!text) {
      clearSilenceTimer();
      return;
    }

    // Tuned for the orb/mic RMS values (0..1).
    const SILENCE_THRESHOLD = 0.03;
    const SILENCE_MS = 1200;

    // User is still talking: clear any pending commit timer.
    if (voiceVolume > SILENCE_THRESHOLD) {
      clearSilenceTimer();
      return;
    }

    // Silence detected with pending transcript: commit after debounce.
    if (silenceTimerRef.current != null) return;
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      commitVoiceUtterance(text);
    }, SILENCE_MS);
  }, [
    clearSilenceTimer,
    commitVoiceUtterance,
    interruptCurrentResponse,
    isLoading,
    isVoiceMode,
    liveTranscript,
    sttPausedForTTS,
    ttsSpeaking,
    useLiveStt,
    voiceSessionActive,
    voiceVolume,
  ]);

  // Safety net: ensure speech recognition stays active during a voice session.
  // In full-duplex mode the engine is never stopped during TTS, so this only fires
  // on initial session start or when the browser kills recognition (Chrome auto-stops
  // after ~60s of silence). sttPausedForTTS guard prevents a spurious restart while
  // TTS is playing (recognition is still running — we just don't want to poke it).
  useEffect(() => {
    if (!useLiveStt) return;
    if (!isVoiceMode || !voiceSessionActive) return;
    if (sttPausedForTTS) return;
    if (speech.isListening) return;

    console.log("[Effect] Restarting speech recognition (browser may have auto-stopped it)");
    micLevel.start();
    speech.start();
  }, [isVoiceMode, micLevel, speech, sttPausedForTTS, useLiveStt, voiceSessionActive]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    setShowChat(true);
    sendMessage(inputValue.trim());
    setInputValue("");
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleVoiceModeToggle = useCallback(async (checked: boolean) => {
    if (checked) {
      // Pre-request mic permission when enabling voice mode
      const granted = await requestPermission();
      if (granted) {
        setIsVoiceMode(true);
        if (!speech.isSupported) {
          toast({
            title: "Live transcription not supported",
            description: "Your browser doesn't support real-time transcription. We'll use tap-to-talk with auto-stop on silence.",
          });
        }
        toast({
          title: "Voice Mode enabled",
          description: "Tap the orb to speak. Messages will auto-send after you stop talking.",
        });
      }
    } else {
      setIsVoiceMode(false);
      setVoiceSessionActive(false);
      setLiveTranscript("");
      speech.stop();
      micLevel.stop();
    }
  }, [micLevel, requestPermission, speech, toast]);

  // If voice mode is disabled by any means, ensure live session is stopped
  useEffect(() => {
    if (isVoiceMode) return;
    setVoiceSessionActive(false);
    setLiveTranscript("");
    speech.stop();
    micLevel.stop();
  }, [isVoiceMode, micLevel, speech]);

  const handleVoiceControlTap = useCallback(async () => {
    if (!isVoiceMode) return;

    // Live STT path (real-time)
    if (useLiveStt) {
      if (voiceSessionActive) {
        // End voice session
        console.log("[Voice] Ending voice session");
        setVoiceSessionActive(false);
        setLiveTranscript("");
        speech.stop();
        micLevel.stop();
        stopTTS();
        wakeLock.release();
        return;
      }

      // Start hands-free session
      console.log("[Voice] Starting voice session");
      const granted = await requestPermission();
      if (!granted) {
        toast({
          title: "Microphone access required",
          description: "Enable microphone access to use Voice Mode.",
          variant: "destructive",
        });
        return;
      }

      // Keep screen awake during voice session
      wakeLock.request();

      setVoiceSessionActive(true);
      setShowChat(true);
      micLevel.start();
      speech.start();
      return;
    }

    // Fallback path (recording -> Whisper) with VAD auto-stop
    setShowChat(true);
    toggleRecording();
  }, [
    isVoiceMode,
    micLevel,
    requestPermission,
    speech,
    toast,
    toggleRecording,
    useLiveStt,
    voiceSessionActive,
    stopTTS,
    wakeLock,
  ]);

  // Auto-start voice session when chat is opened in voice mode
  const startVoiceSessionAuto = useCallback(async () => {
    if (!isVoiceMode || !useLiveStt || voiceSessionActive) return;
    if (autoStartInFlightRef.current) return;
    autoStartInFlightRef.current = true;
    
    console.log("[AutoStart] Starting voice session automatically");
    try {
      const granted = await requestPermission();
      if (!granted) {
        toast({
          title: "Microphone access required",
          description: "Enable microphone access to use Voice Mode.",
          variant: "destructive",
        });
        return;
      }

      wakeLock.request();
      setVoiceSessionActive(true);
      micLevel.start();
      speech.start();
    } finally {
      autoStartInFlightRef.current = false;
    }
  }, [isVoiceMode, micLevel, requestPermission, speech, toast, useLiveStt, voiceSessionActive, wakeLock]);

  useEffect(() => {
    if (propMode) return;

    const openAssistant = () => {
      setShowChat(true);
      void startVoiceSessionAuto();
    };

    window.addEventListener(OPEN_CUSTOMER_AI_EVENT, openAssistant);
    return () => window.removeEventListener(OPEN_CUSTOMER_AI_EVENT, openAssistant);
  }, [propMode, startVoiceSessionAuto]);

  // When showChat becomes true in voice mode, auto-start listening
  useEffect(() => {
    if (showChat && isVoiceMode && useLiveStt && !voiceSessionActive) {
      startVoiceSessionAuto();
    }
  }, [showChat, isVoiceMode, useLiveStt, voiceSessionActive, startVoiceSessionAuto]);

  // Stop TTS on page refresh / tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopTTS();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Component unmount — stop everything
      stopTTS();
    };
  }, [stopTTS]);

  // Stop TTS on route change
  const location = useLocation();
  useEffect(() => {
    stopTTS();
  }, [location.pathname, stopTTS]);

  // 3D Avatar expression mapping preserved for future use:
  // const getExpression = (emotion: Emotion): VRMAvatarExpression => {
  //   const expressionMap: Record<Emotion, VRMAvatarExpression> = {
  //     neutral: 'idle',
  //     happy: 'happy',
  //     excited: 'happy',
  //     apologetic: 'sad',
  //     serious: 'idle',
  //     thinking: 'thinking',
  //     greeting: 'happy',
  //     concerned: 'sad',
  //   };
  //   return expressionMap[emotion] || 'idle';
  // };

  const closeAssistant = useCallback(() => {
    setShowChat(false);
    setVoiceSessionActive(false);
    setLiveTranscript("");
    speech.stop();
    micLevel.stop();
    stopTTS();
    wakeLock.release();
    onClose?.();
  }, [micLevel, onClose, speech, stopTTS, wakeLock]);

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    if (isLoading) return;
    setShowChat(true);
    sendMessage(prompt);
    setInputValue("");
  }, [isLoading, sendMessage]);

  const assistantOpen = showChat || voiceSessionActive;
  const voiceStatus = isLoading
    ? "Thinking..."
    : ttsSpeaking
      ? "Speaking..."
      : voiceSessionActive || isRecording
        ? "Listening..."
        : "Start voice mode";

  return (
    <>
      <AnimatePresence>
        {assistantOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="floating-ai-overlay"
          >
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="floating-ai-popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby="floating-ai-title"
            >
              <header className="floating-ai-popup__header">
                <span className="floating-ai-popup__icon" aria-hidden="true"><Sparkles /></span>
                <div>
                  <h2 id="floating-ai-title">Ask JointVibe AI</h2>
                  <p>Plan something worth going out for</p>
                </div>
                <button type="button" className="floating-ai-popup__close" onClick={closeAssistant} aria-label="Close Ask AI" title="Close Ask AI"><X /></button>
              </header>
              <div className="floating-ai-popup__body">

      <div className="floating-ai-popup__messages">
        {displayedMessages.length > 0 ? (
          <SwipeableChatPanel messages={displayedMessages} isLoading={isLoading} />
        ) : (
          <p className="floating-ai-popup__empty">Ask for local plans, venue ideas, or what is happening tonight.</p>
        )}
      </div>

      {!isLoading && displayedMessages.length === 0 && (
        <div className="floating-ai-popup__suggestions" aria-label="Suggested questions">
          <button type="button" onClick={() => handleSuggestedPrompt("Find live music near me")}>Live music nearby</button>
          <button type="button" onClick={() => handleSuggestedPrompt("Suggest a date night plan")}>Date night plan</button>
          <button type="button" onClick={() => handleSuggestedPrompt("What is popular tonight?")}>What's popular?</button>
        </div>
      )}

      <div className="floating-ai-popup__controls">
        <div className="floating-ai-popup__control-group">
          <Button
            size="icon"
            variant="ghost"
            className="floating-ai-popup__icon-button"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute assistant" : "Mute assistant"}
            title={isMuted ? "Unmute assistant" : "Mute assistant"}
          >
            {isMuted ? <VolumeX /> : <Volume2 />}
          </Button>
          <span className="floating-ai-popup__usage"><AIUsageIndicator compact /></span>
        </div>

        <div className="floating-ai-popup__mode-control">
          <MessageSquare className={!isVoiceMode ? "is-active" : ""} aria-hidden="true" />
          <Switch
            checked={isVoiceMode}
            onCheckedChange={handleVoiceModeToggle}
            className="data-[state=checked]:bg-primary"
            aria-label="Toggle voice mode"
          />
          <PhoneCall className={isVoiceMode ? "is-active" : ""} aria-hidden="true" />
        </div>

        {isLoading && (
          <Button size="sm" variant="outline" onClick={cancelRequest} className="floating-ai-popup__stop-button">
            <Square />
            <span>Stop</span>
          </Button>
        )}
      </div>

      {isVoiceMode && (
        <button
          type="button"
          className={`floating-ai-popup__voice-control ${voiceSessionActive ? "is-active" : ""}`}
          onClick={handleVoiceControlTap}
          disabled={useLiveStt ? false : (isLoading || isTranscribing)}
        >
          <Mic />
          <span>{voiceStatus}</span>
        </button>
      )}

      <div className="floating-ai-popup__question">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isTranscribing ? "Transcribing..." : "Find a rooftop dinner near me tonight"}
          disabled={isLoading || isTranscribing}
          className="floating-ai-popup__input"
        />
        <Button
          size="icon"
          variant="ghost"
          className={`floating-ai-popup__input-button ${isRecording ? "is-recording" : ""}`}
          onClick={toggleRecording}
          disabled={isLoading || isTranscribing}
          aria-label={isRecording ? "Stop recording" : "Record question"}
          title={isRecording ? "Stop recording" : "Record question"}
        >
          <Mic />
        </Button>
        <Button
          size="icon"
          onClick={handleSend}
          disabled={isLoading || !inputValue.trim()}
          className="floating-ai-popup__send-button"
          aria-label="Ask AI"
          title="Ask AI"
        >
          <Send />
        </Button>
      </div>

      {isRecording && <p className="floating-ai-popup__recording">Listening. Recording stops automatically after silence.</p>}

              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {!assistantOpen && (
        <div
          className="floating-ai-trigger-wrap"
          style={{
            transform: visible
              ? 'translateY(0)'
              : 'translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 7rem))',
          }}
        >
          <Button
            size="icon"
            variant="ghost"
            className="floating-ai-trigger"
            onClick={() => {
              setShowChat(true);
              void startVoiceSessionAuto();
            }}
            aria-label={t('actions.ask_ai')}
            title={t('actions.ask_ai')}
          >
            <Sparkles />
          </Button>
        </div>
      )}

      {/* Top Up Dialog - triggered when showTopUpDialog is true */}
      {showTopUpDialog && (
        <div className="floating-ai-topup-overlay">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="floating-ai-topup-dialog"
          >
            <AIUsageIndicator />
            <Button
              variant="outline"
              className="floating-ai-topup-dialog__close"
              onClick={() => setShowTopUpDialog(false)}
            >
              Close
            </Button>
          </motion.div>
        </div>
      )}
    </>
  );
}
