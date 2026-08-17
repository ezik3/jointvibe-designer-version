import { useState, useCallback } from "react";
import { Send, X, Bot, User as UserIcon, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAIChat, AIMessage } from "@/hooks/useAIChat";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from 'react-i18next';
import "./vibe-modal.css";

interface VenueAIChatProps {
  venueId: string;
  venueName: string;
  onClose: () => void;
}

export default function VenueAIChat({ venueId, venueName, onClose }: VenueAIChatProps) {
  const { t } = useTranslation('venue');
  const [inputValue, setInputValue] = useState("");
  const { toast } = useToast();

  const { messages, isLoading, sendMessage } = useAIChat({
    mode: 'venue',
    venueId,
    onEmotion: (emotion) => {
      // Could be used for avatar expression if integrated
    },
  });

  // Parse order JSON from AI response
  const parseOrderFromMessage = (content: string): { items: any[]; notes: string } | null => {
    const orderMatch = content.match(/\[ORDER_JSON\](.*?)\[\/ORDER_JSON\]/s);
    if (orderMatch) {
      try {
        return JSON.parse(orderMatch[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const handleConfirmOrder = async (order: { items: any[]; notes: string }) => {
    try {
      // Here you would create the actual order
      // For now, show a confirmation toast
      toast({
        title: "Order Submitted!",
        description: `${order.items.length} item(s) have been sent to the kitchen.`,
      });
    } catch (error) {
      toast({
        title: "Order Failed",
        description: "Could not submit order. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue.trim());
    setInputValue("");
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Clean message content by removing order JSON
  const cleanContent = (content: string) => {
    return content.replace(/\[ORDER_JSON\].*?\[\/ORDER_JSON\]/gs, '').trim();
  };

  return (
    <Card className="vibe-modal fixed bottom-4 right-4 z-50 flex h-[70vh] max-h-[600px] w-[calc(100%-2rem)] max-w-96 flex-col !rounded-[8px] md:h-[600px] md:w-96">
      {/* Header */}
      <div className="vibe-modal__header flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 border-2 border-background">
            <AvatarFallback className="bg-background text-primary">
              <Bot className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-foreground">
              AI Waiter
            </h3>
            <p className="text-xs text-muted-foreground">{venueName}</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="text-muted-foreground hover:text-primary"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Welcome message */}
          {messages.length === 0 && (
            <div className="flex gap-2 justify-start">
              <Avatar className="h-8 w-8 mt-1">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="vibe-modal__panel max-w-[80%] px-4 py-2">
                <p className="text-sm">
                  Welcome to {venueName}! 👋 I'm your AI waiter. 
                  Ask me about the menu, place an order, or let me know if you need anything!
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const order = msg.role === 'assistant' ? parseOrderFromMessage(msg.content) : null;
            const displayContent = cleanContent(msg.content);

            return (
              <div key={i}>
                <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[80%] rounded-[6px] px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
                  </div>
                  {msg.role === 'user' && (
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarFallback className="bg-secondary">
                        <UserIcon className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>

                {/* Order confirmation card */}
                {order && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="ml-10 mt-2"
                  >
                    <div className="vibe-modal__panel p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ShoppingCart className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">Order Ready</span>
                      </div>
                      <div className="space-y-1 mb-3">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="text-sm flex justify-between">
                            <span>{item.quantity}x {item.name}</span>
                            {item.modifiers?.length > 0 && (
                              <span className="text-muted-foreground text-xs">
                                ({item.modifiers.join(', ')})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={() => handleConfirmOrder(order)}
                      >
                        Confirm Order
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-2 justify-start">
              <Avatar className="h-8 w-8 mt-1">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="vibe-modal__panel px-4 py-2">
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
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about the menu or place an order..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isLoading || !inputValue.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
