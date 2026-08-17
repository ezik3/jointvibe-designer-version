import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { AIMessage } from "@/hooks/useAIChat";
import AIMessageRenderer from "./AIMessageRenderer";
import { useTranslation } from 'react-i18next';

interface SwipeableChatPanelProps {
  messages: AIMessage[];
  isLoading: boolean;
  onVenueClick?: (venueId: string) => void;
}

export default function SwipeableChatPanel({ messages, isLoading, onVenueClick }: SwipeableChatPanelProps) {
  const { t } = useTranslation('common');
  const [isHidden, setIsHidden] = useState(false);
  const constraintsRef = useRef(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      });
    }
  }, [messages, isLoading]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    // If swiped right more than 100px, hide the panel
    if (info.offset.x > 100) {
      setIsHidden(true);
    }
    // If swiped left from hidden state, show the panel
    if (info.offset.x < -50 && isHidden) {
      setIsHidden(false);
    }
  };

  return (
    <>
      {/* Edge indicator to bring panel back */}
      <AnimatePresence>
        {isHidden && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onClick={() => setIsHidden(false)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-background/90 backdrop-blur-sm rounded-l-xl p-2 shadow-lg border border-r-0 border-border"
          >
            <ChevronLeft className="h-6 w-6 text-foreground" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat messages panel */}
      <motion.div
        ref={constraintsRef}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        animate={{ x: isHidden ? "110%" : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-full touch-pan-y"
      >
        {/* Swipe hint */}
        {messages.length > 0 && !isHidden && (
          <motion.div 
            className="flex justify-end mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
          >
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-background/70 rounded-full px-2 py-1">
              <span>{t('chat.swipe_to_hide')}</span>
              <ChevronLeft className="h-3 w-3 rotate-180" />
            </div>
          </motion.div>
        )}

        {/* Scrollable messages container */}
        <div 
          ref={scrollContainerRef}
          className="max-h-[40vh] overflow-y-auto no-scrollbar"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="flex flex-col gap-3 pointer-events-auto items-center mx-auto w-full">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-center"
              >
                <div
                  className={`max-w-[85%] px-4 py-3 shadow-lg ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-primary/80 to-primary text-primary-foreground rounded-2xl'
                      : 'bg-background/95 text-foreground rounded-2xl'
                  }`}
                >
                  <AIMessageRenderer 
                    content={msg.content} 
                    role={msg.role} 
                    onVenueClick={onVenueClick}
                  />
                </div>
              </motion.div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex justify-start"
              >
                <div className="bg-background/95 rounded-2xl rounded-bl-md px-4 py-3 shadow-lg">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
