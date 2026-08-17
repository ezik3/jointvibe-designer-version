import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, MicOff, Volume2, VolumeX, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useElevenLabsTTS } from '@/hooks/useElevenLabsTTS';
import { supabase } from '@/integrations/supabase/client';
import VRMScene from './VRMScene';
import { VRMAvatarExpression } from './VRMAvatar';
import AIUsageIndicator from './AIUsageIndicator';
import { useTranslation } from 'react-i18next';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function VRMChatbot() {
  const { t } = useTranslation('common');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expression, setExpression] = useState<VRMAvatarExpression>('idle');
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mouthAnimationRef = useRef<number | null>(null);

  const { speak, stop: stopTTS, toggleMute, isLoading: ttsLoading, isSpeaking, isMuted } = useElevenLabsTTS({
    onStart: () => {
      setExpression('speaking');
      startMouthAnimation();
    },
    onEnd: () => {
      setExpression('idle');
      stopMouthAnimation();
    },
    onError: () => {
      setExpression('idle');
      stopMouthAnimation();
    }
  });

  // Mouth animation for lip-sync effect
  const startMouthAnimation = () => {
    if (mouthAnimationRef.current) return;
    
    const animate = () => {
      setMouthOpen(prev => {
        const next = prev > 0.6 ? 0.2 : prev + 0.15;
        return next;
      });
      mouthAnimationRef.current = requestAnimationFrame(() => {
        setTimeout(animate, 90);
      });
    };
    animate();
  };

  const stopMouthAnimation = () => {
    if (mouthAnimationRef.current) {
      cancelAnimationFrame(mouthAnimationRef.current);
      mouthAnimationRef.current = null;
    }
    setMouthOpen(0);
  };

  // Greeting animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setExpression('happy');
      setTimeout(() => setExpression('idle'), 2000);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Detect sentiment from response
  const detectSentiment = (text: string): VRMAvatarExpression => {
    const lower = text.toLowerCase();
    
    if (text.includes('[EMO=happy]')) return 'happy';
    if (text.includes('[EMO=sad]')) return 'sad';
    
    if (lower.includes('sorry') || lower.includes('unfortunately') || lower.includes('cannot')) {
      return 'sad';
    }
    if (lower.includes('great') || lower.includes('happy') || lower.includes('love') || 
        lower.includes('excellent') || lower.includes('perfect') || lower.includes('awesome')) {
      return 'happy';
    }
    if (lower.includes('let me think') || lower.includes('hmm') || lower.includes('considering')) {
      return 'thinking';
    }
    return 'neutral';
  };

  // Stream chat with AI
  const streamChat = useCallback(async (userMessage: string) => {
    setIsLoading(true);
    setExpression('thinking');
    
    const userMsg: Message = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-gateway`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMsg].map(m => ({
              role: m.role,
              content: m.content
            })),
            mode: 'customer',
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          if (data.error === 'quota_exceeded') {
            toast({
              title: "Daily limit reached",
              description: data.message || "You've used today's free chats. Top up for more!",
            });
            throw new Error('quota_exceeded');
          }
          throw new Error('Rate limited. Please wait a moment.');
        }
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      if (reader) {
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        setExpression('speaking');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      role: 'assistant',
                      content: fullResponse.replace(/\[EMO=(happy|sad|neutral)\]\s*/gi, '')
                    };
                    return updated;
                  });
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      const emotion = detectSentiment(fullResponse);
      setExpression(emotion);

      const cleanedResponse = fullResponse.replace(/\[EMO=(happy|sad|neutral)\]\s*/gi, '');
      if (!isMuted && cleanedResponse) {
        await speak(cleanedResponse);
      }

      setTimeout(() => setExpression('idle'), 3000);
    } catch (error) {
      console.error('Chat error:', error);
      setExpression('sad');
      if (error instanceof Error && error.message !== 'quota_exceeded') {
        toast({
          title: "Error",
          description: error.message || "Failed to get response",
          variant: "destructive",
        });
      }
      setTimeout(() => setExpression('idle'), 2000);
    } finally {
      setIsLoading(false);
    }
  }, [messages, speak, isMuted, toast]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    const message = input.trim();
    setInput('');
    streamChat(message);
  }, [input, isLoading, streamChat]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Voice recording
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
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone",
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
      
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data, error } = await supabase.functions.invoke('voice-to-text', {
          body: { audio: base64Audio }
        });

        if (error) throw error;
        
        if (data?.text) {
          streamChat(data.text);
        }
      };
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Transcription Error",
        description: "Could not transcribe audio",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Avatar Button (when chat is closed) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-20 right-4 z-50"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsOpen(true)}
              className="relative w-20 h-20 rounded-full overflow-hidden shadow-lg border-2 border-primary/30 bg-gradient-to-br from-background to-muted"
            >
              <VRMScene
                speaking={false}
                mouthOpen={0}
                expression="idle"
                className="w-full h-full scale-150"
              />
              {/* Pulsing ring */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-20 right-4 z-50 w-[340px] max-h-[500px] flex flex-col"
          >
            {/* Header with Avatar */}
            <div className="flex items-start gap-3 mb-3">
              {/* 3D Avatar */}
              <div className="relative w-24 h-28 shrink-0">
                <VRMScene
                  speaking={isSpeaking}
                  mouthOpen={mouthOpen}
                  expression={expression}
                  className="w-full h-full"
                />
                {/* Mute button */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute bottom-0 left-0 h-6 w-6 bg-background/70 hover:bg-background/90 rounded-full"
                  onClick={toggleMute}
                >
                  {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </Button>
              </div>

              {/* Header info */}
              <div className="flex-1 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="font-semibold text-sm">Stellara</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Your AI Assistant</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setIsOpen(false)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Usage indicator */}
                <div className="mt-2">
                  <AIUsageIndicator compact />
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 max-h-[280px] overflow-y-auto space-y-3 pr-1 mb-3"
              style={{ scrollbarWidth: 'thin' }}
            >
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    Hi! I'm Stellara. Ask me about venues, deals, or anything else!
                  </p>
                </div>
              )}
              
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2.5 shadow-md ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md'
                        : 'bg-muted/80 backdrop-blur-sm text-foreground rounded-2xl rounded-bl-md border border-border/30'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </motion.div>
              ))}
              
              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-muted/80 backdrop-blur-sm border border-border/30 px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1.5">
                      <motion.span 
                        className="w-2 h-2 bg-primary/60 rounded-full"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                      />
                      <motion.span 
                        className="w-2 h-2 bg-primary/60 rounded-full"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                      />
                      <motion.span 
                        className="w-2 h-2 bg-primary/60 rounded-full"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input Area */}
            <div className="flex gap-2 bg-background/95 backdrop-blur-md border border-border/50 rounded-full px-4 py-2.5 shadow-lg">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('chat.ask_anything')}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
                disabled={isLoading || isRecording}
              />
              
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
              >
                {isRecording ? (
                  <MicOff className="h-4 w-4 text-destructive" />
                ) : (
                  <Mic className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>

              <Button
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
