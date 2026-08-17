import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { detectEmotion, type Emotion } from '@/avatar/EmotionEngine';

export type AIMode = 'customer' | 'venue' | 'owner';

// ---------------------------------------------------------------------------
// Contextual filler phrases — shown instantly on send before AI responds.
// Exported so components can guard against accidentally TTS-speaking them.
// ---------------------------------------------------------------------------
const FILLERS_SHORT    = ["Got it!", "Sure!", "Okay!"];
const FILLERS_QUESTION = ["Good question...", "Hmm, let me think...", "Let me see..."];
const FILLERS_MENU     = ["Let me pull up the menu...", "Checking the menu...", "Looking at that for you..."];
const FILLERS_VENUE    = ["Let me check what's nearby...", "Looking for venues...", "Searching around you..."];
const FILLERS_DEAL     = ["Checking tonight's deals...", "Let me find the best deals..."];
const FILLERS_DEFAULT  = ["Let me check that...", "Alright, one sec...", "On it...", "Let me look into that..."];

export const FILLER_PHRASE_SET = new Set([
  ...FILLERS_SHORT,
  ...FILLERS_QUESTION,
  ...FILLERS_MENU,
  ...FILLERS_VENUE,
  ...FILLERS_DEAL,
  ...FILLERS_DEFAULT,
]);

function getFillerPhrase(message: string): string {
  const lower = message.toLowerCase();
  if (message.trim().length < 25)
    return FILLERS_SHORT[Math.floor(Math.random() * FILLERS_SHORT.length)];
  if (/\b(menu|food|drink|eat|dish|order)\b/.test(lower))
    return FILLERS_MENU[Math.floor(Math.random() * FILLERS_MENU.length)];
  if (/\b(venue|club|bar|nearby|near me|around|nightlife|lounge)\b/.test(lower))
    return FILLERS_VENUE[Math.floor(Math.random() * FILLERS_VENUE.length)];
  if (/\b(deal|offer|promo|discount|special|tonight)\b/.test(lower))
    return FILLERS_DEAL[Math.floor(Math.random() * FILLERS_DEAL.length)];
  if (message.includes('?'))
    return FILLERS_QUESTION[Math.floor(Math.random() * FILLERS_QUESTION.length)];
  return FILLERS_DEFAULT[Math.floor(Math.random() * FILLERS_DEFAULT.length)];
}

export interface AITimingInfo {
  ttftMs: number;   // Time to first token from gateway
  dbMs: number;     // DB query time (from server header)
  totalMs: number;  // End-to-end from send to first token on screen
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  emotion?: Emotion;
  timing?: AITimingInfo;
}

interface UseAIChatOptions {
  mode: AIMode;
  venueId?: string;
  userLocation?: { latitude: number; longitude: number } | null;
  onEmotion?: (emotion: Emotion) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onQuotaExceeded?: () => void;
  /** Fires as soon as the first complete sentence (or ~120 chars) streams in.
   *  Use this to start TTS early instead of waiting for the full response. */
  onFirstSentenceReady?: (text: string) => void;
}

export function useAIChat({ mode, venueId, userLocation, onEmotion, onSpeakingChange, onQuotaExceeded, onFirstSentenceReady }: UseAIChatOptions) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesRef = useRef<AIMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  // Monotonically increasing counter. Each sendMessage call gets a unique generation.
  // applyMessageUpdate checks this to discard updates from superseded requests.
  const generationRef = useRef(0);
  const { toast } = useToast();

  // Keep a ref to the latest messages to avoid stale-closure races when
  // multiple sends happen quickly (e.g., voice commits back-to-back).
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // FIX 4: Pre-warm the ai-gateway edge function on hook mount
  useEffect(() => {
    const warmUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-gateway`;
    fetch(warmUrl, { method: 'GET' }).catch(() => {});
  }, []);

  const extractEmotionFromText = (text: string): { cleanText: string; emotion: Emotion } => {
    // Look for emotion tags like [EMO=happy]
    const emotionMatch = text.match(/\[EMO=(\w+)\]/);
    let emotion: Emotion = 'neutral';
    let cleanText = text;

    if (emotionMatch) {
      const emotionTag = emotionMatch[1].toLowerCase();
      cleanText = text.replace(/\[EMO=\w+\]/g, '').trim();
      
      // Map emotion tags to our emotion types
      const emotionMap: Record<string, Emotion> = {
        happy: 'happy',
        excited: 'excited',
        thinking: 'thinking',
        sorry: 'apologetic',
        apologetic: 'apologetic',
        serious: 'serious',
        greeting: 'greeting',
        concerned: 'concerned',
        neutral: 'neutral',
      };
      
      emotion = emotionMap[emotionTag] || detectEmotion(cleanText);
    } else {
      emotion = detectEmotion(text);
    }

    return { cleanText, emotion };
  };

  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim()) return;

    // Validate mode requirements
    if ((mode === 'venue' || mode === 'owner') && !venueId) {
      toast({
        title: "Error",
        description: "Venue context is required for this mode.",
        variant: "destructive"
      });
      return;
    }

    // Increment generation — any in-flight stream from a previous request will
    // see a mismatched generation and discard its state updates safely.
    generationRef.current += 1;
    const thisGeneration = generationRef.current;

    // Cancel any pending request (cancel-and-replace behavior).
    // We update messagesRef DIRECTLY (synchronously) so that the baseMessages read
    // below sees the cleaned state immediately, not a stale value from a queued setState.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      streamingRef.current = false;

      const prevMsgs = messagesRef.current;
      const lastPrev = prevMsgs[prevMsgs.length - 1];
      if (lastPrev?.role === 'assistant') {
        const cleaned = prevMsgs.slice(0, -1);
        messagesRef.current = cleaned;       // sync update — must happen before baseMessages read
        setMessages(cleaned);               // also update React state for UI
      }
    }

    const newUserMessage: AIMessage = { role: 'user', content: userMessage };
    const baseMessages = messagesRef.current;                          // now always clean
    const updatedMessages = [...baseMessages, newUserMessage];

    // Insert contextual filler phrase — gives instant visual feedback while backend processes.
    const filler = getFillerPhrase(userMessage);
    const withPlaceholder: AIMessage[] = [...updatedMessages, { role: 'assistant', content: filler }];
    setMessages(withPlaceholder);
    messagesRef.current = withPlaceholder;

    setIsLoading(true);
    onSpeakingChange?.(false);

    abortControllerRef.current = new AbortController();
    const sendTimestamp = performance.now();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-gateway`;
      
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ 
          // FIX 5: Only send last 10 messages to reduce payload size
          messages: updatedMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          mode,
          venue_id: venueId,
          session_id: sessionId,
          user_lat: userLocation?.latitude ?? null,
          user_lng: userLocation?.longitude ?? null,
        }),
        signal: abortControllerRef.current.signal,
      });

      // Capture session ID from response headers
      const responseSessionId = resp.headers.get('X-Session-Id');
      if (responseSessionId && !sessionId) {
        setSessionId(responseSessionId);
      }

      if (!resp.ok) {
        if (resp.status === 429) {
          // Try to parse response body to check for quota_exceeded
          try {
            const errorData = await resp.json();
            if (errorData.error === 'quota_exceeded') {
              toast({
                title: "AI Credits Exhausted",
                description: errorData.message || "Top up your credits to continue chatting.",
                variant: "destructive"
              });
              onQuotaExceeded?.();
              throw new Error('quota_exceeded');
            }
          } catch {
            // Fallback for non-JSON response
          }
          toast({
            title: "Rate Limited",
            description: "Too many requests. Please wait a moment.",
            variant: "destructive"
          });
        } else if (resp.status === 402) {
          toast({
            title: "Service Unavailable",
            description: "AI service requires payment. Please contact support.",
            variant: "destructive"
          });
        }
        throw new Error(`Failed to start stream: ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      // Capture server timing header
      const serverDbMs = parseInt(resp.headers.get('X-DB-Time-Ms') || '0', 10);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantMessage = "";
      let currentEmotion: Emotion = 'neutral';
      let firstTokenRecorded = false;
      let firstSentenceFired = false;
      let timingInfo: AITimingInfo | undefined;

      // Batched UI update: flush at most every 40ms to avoid excessive re-renders
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const applyMessageUpdate = () => {
        // Drop updates from a superseded request (user sent a new message mid-stream).
        if (generationRef.current !== thisGeneration) return;

        const { cleanText, emotion } = extractEmotionFromText(assistantMessage);
        if (emotion !== currentEmotion) {
          currentEmotion = emotion;
          onEmotion?.(emotion);
        }
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: cleanText, emotion: currentEmotion, timing: timingInfo } : m
            );
          }
          return [...prev, { role: "assistant", content: cleanText, emotion: currentEmotion, timing: timingInfo }];
        });
      };

      onSpeakingChange?.(true);
      streamingRef.current = true;

      const updateAssistantMessage = (chunk: string) => {
        // Record TTFT on the very first content chunk
        if (!firstTokenRecorded) {
          firstTokenRecorded = true;
          const now = performance.now();
          timingInfo = {
            ttftMs: Math.round(now - sendTimestamp),
            dbMs: serverDbMs,
            totalMs: Math.round(now - sendTimestamp),
          };
        }
        assistantMessage += chunk;

        // Eager TTS: fire as soon as we have a complete sentence (≥50 chars) or 120+ chars
        if (!firstSentenceFired && onFirstSentenceReady) {
          const hasSentenceEnd = /[.!?]/.test(assistantMessage);
          if (assistantMessage.length >= 120 || (hasSentenceEnd && assistantMessage.length >= 50)) {
            firstSentenceFired = true;
            const { cleanText: earlyText } = extractEmotionFromText(assistantMessage);
            onFirstSentenceReady(earlyText);
          }
        }

        // Schedule batched UI update (~40ms debounce)
        if (flushTimer === null) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            applyMessageUpdate();
          }, 40);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          // IMPORTANT: our backend appends additional `data:` lines AFTER [DONE]
          // (e.g., [MENU_DATA]/[VENUE_DATA]). If we `break` here we can lose those
          // extra lines when the stream closes.
          if (jsonStr === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) updateAssistantMessage(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush any remaining buffered lines if the stream closes right after [DONE]
      // (common when metadata is appended in the same chunk).
      if (textBuffer.trim()) {
        const lines = textBuffer.split("\n");
        for (let raw of lines) {
          let line = raw;
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) updateAssistantMessage(content);
          } catch {
            // Ignore leftover partial JSON on stream end
          }
        }
      }

      // Final flush: clear any pending timer and apply last accumulated text
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      applyMessageUpdate();

      streamingRef.current = false;
      onSpeakingChange?.(false);
      setIsLoading(false);
    } catch (error) {
      streamingRef.current = false;

      if (error instanceof Error && error.name === 'AbortError') {
        // If a newer generation is already running, its cancel-and-replace already
        // cleaned up our placeholder. Don't touch state.
        if (generationRef.current !== thisGeneration) return;

        // Remove our placeholder/filler synchronously.
        const prevMsgs = messagesRef.current;
        const lastMsg = prevMsgs[prevMsgs.length - 1];
        if (lastMsg?.role === 'assistant') {
          const cleaned = prevMsgs.slice(0, -1);
          messagesRef.current = cleaned;
          setMessages(cleaned);
        }
        return;
      }
      
      // Don't show generic error for quota_exceeded (already handled)
      if (error instanceof Error && error.message === 'quota_exceeded') {
        // Remove empty placeholder
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content.trim()) {
            const next = prev.slice(0, -1);
            messagesRef.current = next;
            return next;
          }
          return prev;
        });
        setIsLoading(false);
        onSpeakingChange?.(false);
        return;
      }

      console.error("AI chat error:", error);
      // Remove empty placeholder on error so user doesn't see a ghost bubble
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content.trim()) {
          const next = prev.slice(0, -1);
          messagesRef.current = next;
          return next;
        }
        return prev;
      });
      toast({
        title: "Error",
        description: "Failed to get AI response. Please try again.",
        variant: "destructive"
      });
      onSpeakingChange?.(false);
      setIsLoading(false);
    }
  }, [mode, venueId, userLocation, sessionId, toast, onEmotion, onSpeakingChange, onQuotaExceeded, onFirstSentenceReady]);

  const clearChat = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setSessionId(null);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      streamingRef.current = false;

      // Synchronously remove any trailing assistant placeholder/filler so that:
      // (a) the isLoading=false TTS effect doesn't try to speak the filler, and
      // (b) a subsequent sendMessage reads a clean messagesRef immediately.
      const prevMsgs = messagesRef.current;
      const lastMsg = prevMsgs[prevMsgs.length - 1];
      if (lastMsg?.role === 'assistant') {
        const cleaned = prevMsgs.slice(0, -1);
        messagesRef.current = cleaned;
        setMessages(cleaned);
      }
    }
    setIsLoading(false);
    onSpeakingChange?.(false);
  }, [onSpeakingChange]);

  return {
    messages,
    isLoading,
    sessionId,
    sendMessage,
    clearChat,
    cancelRequest,
  };
}
