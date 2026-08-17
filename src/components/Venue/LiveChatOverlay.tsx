import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from 'react-i18next';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  color: string;
  isPinned?: boolean;
  timestamp: Date;
}

interface LiveChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

// Generate random colors for usernames like Twitch
const usernameColors = [
  "#FF0000", "#0000FF", "#00FF00", "#B22222", "#FF7F50", 
  "#9ACD32", "#FF4500", "#2E8B57", "#DAA520", "#D2691E",
  "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#00FF7F"
];

const getRandomColor = () => usernameColors[Math.floor(Math.random() * usernameColors.length)];

// Mock chat messages
const mockMessages: ChatMessage[] = [
  { id: "1", username: "KickBot", message: "This is a pinned message!", color: "#FF0000", isPinned: true, timestamp: new Date() },
  { id: "2", username: "MoonK", message: "OMEGALUL", color: "#B22222", timestamp: new Date() },
  { id: "3", username: "DCWork", message: "nice Dan hahah, should help the max win happen", color: "#00FF00", timestamp: new Date() },
  { id: "4", username: "mehmet", message: "Dan is blind rn", color: "#9ACD32", timestamp: new Date() },
  { id: "5", username: "Poofy", message: "YARRR", color: "#FFFFFF", timestamp: new Date() },
  { id: "6", username: "SirDrinks", message: "LFG", color: "#00FF00", timestamp: new Date() },
  { id: "7", username: "Chad44", message: "@Mitchell your bet is in.", color: "#FFD700", timestamp: new Date() },
  { id: "8", username: "Chad44", message: "Check out our monthly giveaways!", color: "#FFD700", timestamp: new Date() },
];

export default function LiveChatOverlay({ isOpen, onClose }: LiveChatOverlayProps) {
  const { t } = useTranslation('venue');
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Simulate incoming messages
  useEffect(() => {
    if (!isOpen) return;

    const simulatedMessages = [
      "Great vibes tonight! 🔥",
      "When does the DJ start?",
      "Table 5 needs service",
      "This place is lit!",
      "Order #45 ready",
      "VIP just arrived",
      "Music 🎵",
      "Best venue in town!"
    ];

    const interval = setInterval(() => {
      const randomMessage = simulatedMessages[Math.floor(Math.random() * simulatedMessages.length)];
      const newMsg: ChatMessage = {
        id: Date.now().toString(),
        username: `User${Math.floor(Math.random() * 1000)}`,
        message: randomMessage,
        color: getRandomColor(),
        timestamp: new Date()
      };
      setMessages(prev => [...prev.slice(-50), newMsg]); // Keep last 50 messages
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;

    const msg: ChatMessage = {
      id: Date.now().toString(),
      username: "VenueOwner",
      message: newMessage,
      color: "#00FF00",
      timestamp: new Date()
    };

    setMessages(prev => [...prev, msg]);
    setNewMessage("");
  };

  const pinnedMessage = messages.find(m => m.isPinned);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ duration: 0.3 }}
          className="fixed right-4 top-24 bottom-32 z-50 w-[calc(100vw-2rem)] max-w-[20rem]"
        >
          {/* Chat Container - Twitch-style dark overlay */}
          <div className="venue-floating-panel h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="venue-floating-panel__header flex items-center justify-between p-3 border-b">
              <h3 className="text-white font-semibold text-sm">Live Chat</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Pinned Message */}
            {pinnedMessage && (
              <div className="px-3 py-2 bg-[#0c1014] border-b border-[#2a323a]">
                <div className="flex items-center gap-2 text-xs">
                  <Pin className="h-3 w-3 text-yellow-400" />
                  <span className="text-white/60">Pinned message</span>
                </div>
                <p className="text-sm mt-1">
                  <span style={{ color: pinnedMessage.color }} className="font-bold">
                    {pinnedMessage.username}
                  </span>
                  <span className="text-white">: {pinnedMessage.message}</span>
                </p>
              </div>
            )}

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-3 space-y-1"
            >
              {messages.filter(m => !m.isPinned).map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm leading-relaxed"
                >
                  {msg.username.includes("Bot") && (
                    <span className="text-yellow-400 mr-1">✦</span>
                  )}
                  {msg.username === "VenueOwner" && (
                    <span className="text-green-400 mr-1">✦</span>
                  )}
                  <span style={{ color: msg.color }} className="font-bold">
                    {msg.username}
                  </span>
                  <span className="text-white">: {msg.message}</span>
                </motion.div>
              ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-[#2a323a]">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Send a message..."
                  className="text-sm"
                />
                <Button 
                  size="icon" 
                  onClick={handleSend}
                  className="venue-dialog-primary-action"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
