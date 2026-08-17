import { useState, useCallback } from "react";
import { Send, X, Bot, Sparkles, TrendingUp, Megaphone, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { useAIChat } from "@/hooks/useAIChat";
import { useTranslation } from 'react-i18next';

interface OwnerAIHelperProps {
  venueId: string;
  venueName: string;
  isOpen: boolean;
  onClose: () => void;
}

const quickPrompts = [
  { icon: Megaphone, label: "Write a deal", prompt: "Help me write a compelling happy hour deal" },
  { icon: TrendingUp, label: "Analyze sales", prompt: "What are my best selling items this week?" },
  { icon: Sparkles, label: "Promo ideas", prompt: "Suggest some promotional ideas for this weekend" },
  { icon: HelpCircle, label: "Platform help", prompt: "How do I set up push notifications for deals?" },
];

export default function OwnerAIHelper({ venueId, venueName, isOpen, onClose }: OwnerAIHelperProps) {
  const { t } = useTranslation('venue');
  const [inputValue, setInputValue] = useState("");

  const { messages, isLoading, sendMessage, clearChat } = useAIChat({
    mode: 'owner',
    venueId,
  });

  const handleSend = useCallback((message?: string) => {
    const msg = message || inputValue.trim();
    if (!msg || isLoading) return;
    sendMessage(msg);
    setInputValue("");
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed bottom-4 right-4 z-50"
      >
        <Card className="venue-floating-panel w-[calc(100vw-2rem)] max-w-md h-[70vh] max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="venue-floating-panel__header flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#12363b] flex items-center justify-center">
                <Bot className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">JV Assistant</h3>
                <p className="text-xs text-slate-400">Your venue helper</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              className="text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Quick prompts - show when no messages */}
          {messages.length === 0 && (
            <div className="p-4 border-b border-[#2a323a] bg-[#0c1014]">
              <p className="text-sm text-muted-foreground mb-3">Quick actions:</p>
              <div className="grid grid-cols-2 gap-2">
                {quickPrompts.map((qp, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="venue-dialog-secondary-action justify-start text-xs h-auto py-2"
                    onClick={() => handleSend(qp.prompt)}
                  >
                    <qp.icon className="h-3 w-3 mr-1.5 shrink-0" />
                    <span className="truncate">{qp.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    Hi! I'm here to help you manage <strong>{venueName}</strong>.
                  </p>
                  <p className="text-xs mt-1">
                    Ask me about analytics, promotions, or anything else!
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="venue-dialog-icon--cyan w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[85%] ${
                      msg.role === 'user'
                        ? 'bg-cyan-400 text-[#080b0e]'
                        : 'bg-[#171d23]'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex gap-2 justify-start">
                  <div className="venue-dialog-icon--cyan w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-[#171d23] rounded-lg px-4 py-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-[#2a323a]">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button className="venue-dialog-primary-action" onClick={() => handleSend()} disabled={isLoading || !inputValue.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
