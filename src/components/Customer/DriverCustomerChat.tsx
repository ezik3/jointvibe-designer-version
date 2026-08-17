import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, Send, MessageCircle, User, Car } from "lucide-react";
import { useTranslation } from 'react-i18next';
import TranslatedText from "@/components/i18n/TranslatedText";

interface Message {
  id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

interface DriverCustomerChatProps {
  orderId: string;
  orderType: "delivery" | "ride";
  isDriver: boolean;
  otherPartyName?: string;
  otherPartyAvatar?: string;
  chatTarget?: 'customer' | 'venue';
  venueId?: string;
  onClose: () => void;
}

const DriverCustomerChat = ({
  orderId,
  orderType,
  isDriver,
  otherPartyName = "User",
  otherPartyAvatar,
  chatTarget = 'customer',
  venueId,
  onClose
}: DriverCustomerChatProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from("order_messages")
          .select("*")
          .eq("order_id", orderId)
          .eq("order_type", orderType)
          .order("created_at", { ascending: true });

        if (error) throw error;
        setMessages(data || []);
      } catch (error) {
        console.error("Error fetching messages:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(createRealtimeChannelTopic(`order-messages-${orderId}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_messages",
          filter: `order_id=eq.${orderId}`
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, orderType]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark messages as read
  useEffect(() => {
    const markAsRead = async () => {
      if (!user) return;
      
      const unreadMessages = messages.filter(
        m => m.sender_id !== user.id && !m.read_at
      );

      if (unreadMessages.length > 0) {
        await supabase
          .from("order_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", unreadMessages.map(m => m.id));
      }
    };

    markAsRead();
  }, [messages, user]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || sending) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from("order_messages")
        .insert({
          order_id: orderId,
          order_type: orderType,
          sender_id: user.id,
          sender_type: isDriver ? "driver" : "customer",
          content: newMessage.trim()
        });

      if (error) throw error;
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed inset-x-4 bottom-24 z-50 md:right-4 md:left-auto md:w-96"
      >
        <div className="customer-modal-panel overflow-hidden flex flex-col max-h-[60vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--customer-modal-line)] bg-[var(--customer-modal-raised)]">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 border-2 border-[var(--customer-modal-line)]">
                <AvatarImage src={otherPartyAvatar} />
                <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)]">
                  {isDriver ? <User className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-[var(--customer-modal-text)] font-semibold">{otherPartyName}</h3>
                <p className="text-[var(--customer-modal-muted)] text-xs">
                  {isDriver ? "Customer" : "Your Driver"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="customer-modal-secondary h-8 w-8 p-0"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Messages */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]"
          >
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-[var(--customer-modal-line)] border-t-[var(--customer-modal-cyan)] rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageCircle className="w-12 h-12 text-[var(--customer-modal-faint)] mb-2" />
                <p className="text-[var(--customer-modal-muted)] text-sm">No messages yet</p>
                <p className="text-[var(--customer-modal-faint)] text-xs">Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => {
                const isOwnMessage = message.sender_id === user?.id;
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-[6px] px-4 py-2 ${
                        isOwnMessage
                          ? "bg-[var(--customer-modal-cyan)] text-[var(--customer-modal-canvas)] rounded-br-sm"
                          : "bg-[var(--customer-modal-raised)] text-[var(--customer-modal-text)] rounded-bl-sm"
                      }`}
                    >
                      <TranslatedText
                        text={message.content}
                        contentId={message.id}
                        contentType="order_message"
                        hideToggle={isOwnMessage}
                        className="text-sm"
                      />
                      <p className={`text-xs mt-1 ${isOwnMessage ? "text-white/70" : "text-white/40"}`}>
                        {new Date(message.created_at).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[var(--customer-modal-line)]">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('chat.type_message')}
                className="customer-modal-field flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!newMessage.trim() || sending}
                className="customer-modal-primary"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DriverCustomerChat;
