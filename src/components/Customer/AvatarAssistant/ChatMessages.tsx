import { ScrollArea } from "@/components/ui/scroll-area";
import { useRef, useEffect } from "react";
import AIMessageRenderer from "../AIMessageRenderer";
import type { AITimingInfo } from "@/hooks/useAIChat";
import { useTranslation } from 'react-i18next';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timing?: AITimingInfo;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  onVenueClick?: (venueId: string) => void;
  venueId?: string;
}

const isDebugTimingEnabled = () => {
  try { return localStorage.getItem('ai_debug_timing') === '1'; } catch { return false; }
};

export default function ChatMessages({ messages, isLoading, onVenueClick, venueId }: ChatMessagesProps) {
  const { t } = useTranslation('common');
  const scrollRef = useRef<HTMLDivElement>(null);
  const showTiming = isDebugTimingEnabled();

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    if (scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs px-4">
        <p className="text-center">
          Hi! I'm Vibe. Ask me anything!
        </p>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 scrollbar-hide"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', scrollBehavior: 'smooth' }}
    >
      <div className="flex flex-col gap-2 py-3">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[85%] px-4 py-2.5 shadow-sm ${
                message.role === 'user'
                  ? 'bg-[#007AFF] text-white rounded-[18px] rounded-br-[4px]'
                  : 'bg-[#E5E5EA] dark:bg-[#3A3A3C] text-[#1C1C1E] dark:text-white rounded-[18px] rounded-bl-[4px]'
              }`}
            >
              <AIMessageRenderer 
                content={message.content}
                role={message.role}
                onVenueClick={onVenueClick}
                venueId={venueId}
              />
            </div>
            {showTiming && message.role === 'assistant' && message.timing && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 ml-1 font-mono">
                TTFT: {message.timing.ttftMs}ms | DB: {message.timing.dbMs}ms | Total: {message.timing.totalMs}ms
              </p>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#E9E9EB] dark:bg-[#3A3A3C] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
