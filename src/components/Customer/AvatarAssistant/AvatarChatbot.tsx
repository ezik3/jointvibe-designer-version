import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Volume2, VolumeX, MessageCircle, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useElevenLabsTTS } from "@/hooks/useElevenLabsTTS";
import { useAudioLipSync } from "@/hooks/useAudioLipSync";
import AvatarDisplay, { AvatarExpression } from "./AvatarDisplay";
import { detectEmotion, getEmotionIntensity } from "@/avatar/EmotionEngine";
import { Expressions, scaleExpression } from "@/avatar/expressions";
import { defaultPersonality, getAnimationParams } from "@/avatar/personality";
import type { ExpressionConfig } from "@/avatar/expressions";
import { useTranslation } from 'react-i18next';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AvatarChatbot() {
  const { t } = useTranslation('common');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expression, setExpression] = useState<AvatarExpression>('greeting');
  const [showInput, setShowInput] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentExpression, setCurrentExpression] = useState<ExpressionConfig>(Expressions.neutral);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();
  
  // Get personality animation parameters
  const animParams = getAnimationParams(defaultPersonality);
  
  // Audio lip sync hook
  const { mouthOpen, connectAudio, stop: stopLipSync } = useAudioLipSync();

  const {
    speak,
    stop,
    isSpeaking,
    isLoading: ttsLoading,
    isMuted,
    toggleMute,
  } = useElevenLabsTTS({
    onStart: () => setExpression('speaking'),
    onEnd: () => {
      setExpression('idle');
      stopLipSync();
    },
    onError: (error) => {
      console.error('TTS Error:', error);
      setExpression('idle');
      stopLipSync();
    },
    onAudioReady: (audio) => {
      // Connect audio to lip sync engine
      connectAudio(audio);
    },
  });

  // Initial greeting animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setExpression('idle');
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Convert emotion to avatar expression type
  const emotionToExpression = (emotion: string): AvatarExpression => {
    const mapping: Record<string, AvatarExpression> = {
      'neutral': 'idle',
      'happy': 'happy',
      'excited': 'happy',
      'apologetic': 'concerned',
      'serious': 'concerned',
      'thinking': 'thinking',
      'greeting': 'greeting',
      'concerned': 'concerned',
    };
    return mapping[emotion] || 'idle';
  };

  const streamChat = useCallback(async (userMessage: string) => {
    setIsLoading(true);
    setExpression('thinking');
    setCurrentExpression(scaleExpression(Expressions.thinking, defaultPersonality.expressiveness));
    
    const newMessages: Message[] = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newMessages);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            context: 'venue_assistant'
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            title: "Rate limit reached",
            description: "Please wait a moment before trying again.",
            variant: "destructive",
          });
          setExpression('concerned');
          setCurrentExpression(scaleExpression(Expressions.concerned, defaultPersonality.expressiveness));
          return;
        }
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                setMessages([...newMessages, { role: 'assistant', content: assistantMessage }]);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      setIsLoading(false);
      
      // Detect emotion from response and set expressions
      if (assistantMessage) {
        const emotion = detectEmotion(assistantMessage);
        const intensity = getEmotionIntensity(assistantMessage);
        const expressionConfig = Expressions[emotion] || Expressions.neutral;
        
        // Apply personality scaling
        const scaledExpression = scaleExpression(expressionConfig, defaultPersonality.expressiveness * intensity);
        setCurrentExpression(scaledExpression);
        
        // Set avatar expression type
        setExpression(emotionToExpression(emotion));
        
        // Speak the response if not muted
        if (!isMuted) {
          speak(assistantMessage);
        } else {
          setExpression('idle');
        }
      } else {
        setExpression('idle');
      }
      
    } catch (error) {
      console.error('Chat error:', error);
      setIsLoading(false);
      setExpression('concerned');
      setCurrentExpression(scaleExpression(Expressions.concerned, defaultPersonality.expressiveness));
      toast({
        title: "Error",
        description: "Failed to get a response. Please try again.",
        variant: "destructive",
      });
    }
  }, [messages, speak, isMuted, toast, stop]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const message = input.trim();
    setInput("");
    streamChat(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleInput = () => {
    setShowInput(prev => !prev);
    if (!showInput) {
      setExpression('greeting');
      setCurrentExpression(scaleExpression(Expressions.greeting, defaultPersonality.expressiveness));
      setTimeout(() => {
        setExpression('idle');
        setCurrentExpression(scaleExpression(Expressions.neutral, defaultPersonality.expressiveness));
      }, 1500);
    }
  };


  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setExpression('thinking');
      setCurrentExpression(scaleExpression(Expressions.thinking, defaultPersonality.expressiveness));
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setIsLoading(true);
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-to-text`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ audio: base64Audio }),
          }
        );

        if (!response.ok) {
          throw new Error('Transcription failed');
        }

        const { text } = await response.json();
        
        if (text && text.trim()) {
          streamChat(text.trim());
        } else {
          setIsLoading(false);
          setExpression('idle');
          setCurrentExpression(scaleExpression(Expressions.neutral, defaultPersonality.expressiveness));
          toast({
            title: "No speech detected",
            description: "Please try speaking again.",
            variant: "destructive",
          });
        }
      };
    } catch (error) {
      console.error('Transcription error:', error);
      setIsLoading(false);
      setExpression('concerned');
      setCurrentExpression(scaleExpression(Expressions.concerned, defaultPersonality.expressiveness));
      toast({
        title: "Transcription Error",
        description: "Failed to transcribe audio. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {/* Floating chat bubbles above avatar - scrollable */}
      <AnimatePresence>
        <motion.div 
          ref={scrollRef}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="w-52 max-h-64 overflow-y-auto mb-2 flex flex-col gap-2 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] px-3.5 py-2 shadow-lg ${
                    message.role === 'user'
                      ? 'bg-primary/90 text-primary-foreground rounded-[18px] rounded-br-[4px]'
                      : 'bg-background/80 text-foreground border border-border/50 rounded-[18px] rounded-bl-[4px]'
                  }`}
                >
                  <p className="text-[13px] leading-[1.35] whitespace-pre-wrap">{message.content}</p>
                </div>
              </motion.div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-background/80 border border-border/50 rounded-[18px] rounded-bl-[4px] px-4 py-2.5 shadow-lg">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      {/* Input field - shows when toggled */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="w-64 mb-2"
          >
            <div className="flex gap-1.5 bg-background/95 backdrop-blur-xl p-1.5 rounded-full border border-border/50 shadow-lg">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('chat.type_message')}
                className="flex-1 h-8 text-xs bg-transparent border-0 rounded-full px-3 focus-visible:ring-0"
                disabled={isLoading || isRecording}
                autoFocus
              />

              {/* Voice recording button */}
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
                size="sm"
                className={`h-8 w-8 p-0 rounded-full ${
                  isRecording
                    ? 'bg-destructive hover:bg-destructive/90 animate-pulse'
                    : 'bg-background/80 hover:bg-background border border-border/50'
                }`}
              >
                {isRecording ? (
                  <MicOff className="h-3.5 w-3.5 text-destructive-foreground" />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>

              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || isRecording}
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar with controls */}
      <div className="relative flex items-end">
        {/* Toggle input button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleInput}
          className="absolute -top-1 -right-1 z-10 h-7 w-7 rounded-full bg-background/90 backdrop-blur-sm border border-border/50 shadow-md"
        >
          <MessageCircle className={`h-3.5 w-3.5 ${showInput ? 'text-neon-cyan' : 'text-muted-foreground'}`} />
        </Button>

        {/* Mute button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute -top-1 -left-1 z-10 h-7 w-7 rounded-full bg-background/90 backdrop-blur-sm border border-border/50 shadow-md"
        >
          {isMuted ? (
            <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-neon-purple" />
          )}
        </Button>

        {/* Avatar */}
        <motion.div
          className="cursor-pointer"
          onClick={toggleInput}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <AvatarDisplay 
            expression={expression} 
            isSpeaking={isSpeaking} 
            size="full"
            mouthOpen={mouthOpen}
            expressionConfig={currentExpression}
            energy={defaultPersonality.energy}
          />
        </motion.div>
      </div>
    </div>
  );
}
