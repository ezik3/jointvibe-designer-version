import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';
import "./vibe-modal.css";

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  color: string;
  isPinned?: boolean;
  timestamp: Date;
  isVenue?: boolean;
  avatarUrl?: string;
}

interface CustomerChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
}

// Generate random colors for usernames
const usernameColors = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
];

const getRandomColor = () => usernameColors[Math.floor(Math.random() * usernameColors.length)];

// Mock avatar URLs for simulated messages
const mockAvatars = [
  "https://i.pravatar.cc/40?img=1",
  "https://i.pravatar.cc/40?img=2",
  "https://i.pravatar.cc/40?img=3",
  "https://i.pravatar.cc/40?img=4",
  "https://i.pravatar.cc/40?img=5",
  "https://i.pravatar.cc/40?img=6",
  "https://i.pravatar.cc/40?img=7",
  "https://i.pravatar.cc/40?img=8",
];

const getRandomAvatar = () => mockAvatars[Math.floor(Math.random() * mockAvatars.length)];

const CustomerChatModal = ({ isOpen, onClose, venueId, venueName }: CustomerChatModalProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [userColor] = useState(getRandomColor());
  const [username, setUsername] = useState("Guest");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user profile for display name and avatar
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("customer_profiles")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
        .single();
      
      if (data?.display_name) {
        setUsername(data.display_name);
      }
      if (data?.avatar_url) {
        setUserAvatar(data.avatar_url);
      }
    };
    
    fetchProfile();
  }, [user]);

  // Initialize with welcome message
  useEffect(() => {
    if (isOpen) {
      setMessages([
        {
          id: "welcome",
          username: venueName,
          message: `Welcome to ${venueName}! Feel free to chat with the venue staff.`,
          color: "#00D9FF",
          isPinned: true,
          timestamp: new Date(),
          isVenue: true,
          avatarUrl: undefined
        }
      ]);
    }
  }, [isOpen, venueName]);

  // Simulate venue responses (in production, would use real-time messaging)
  useEffect(() => {
    if (!isOpen) return;

    const venueResponses = [
      "A server will be with you shortly!",
      "Thanks for joining us today! 🎉",
      "Our specials tonight are amazing!",
      "Let us know if you need anything!",
    ];

    const interval = setInterval(() => {
      // Randomly add venue messages occasionally
      if (Math.random() > 0.7) {
        const randomResponse = venueResponses[Math.floor(Math.random() * venueResponses.length)];
        const newMsg: ChatMessage = {
          id: Date.now().toString(),
          username: venueName,
          message: randomResponse,
          color: "#00D9FF",
          timestamp: new Date(),
          isVenue: true,
          avatarUrl: getRandomAvatar()
        };
        setMessages(prev => [...prev.slice(-50), newMsg]);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [isOpen, venueName]);

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
      username: username,
      message: newMessage,
      color: userColor,
      timestamp: new Date(),
      avatarUrl: userAvatar || undefined
    };

    setMessages(prev => [...prev, msg]);
    setNewMessage("");
  };

  const pinnedMessage = messages.find(m => m.isPinned);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div 
          className="vibe-modal-backdrop absolute inset-0"
          onClick={onClose}
        />
        
        {/* Chat Container */}
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          className="vibe-modal vibe-modal--chat relative w-full flex flex-col"
        >
          {/* Header */}
          <div className="vibe-modal__header flex items-center justify-between p-4">
            <div>
              <h3 className="text-foreground font-semibold">Live Chat</h3>
              <p className="text-xs text-muted-foreground">{venueName}</p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Pinned Message */}
          {pinnedMessage && (
            <div className="vibe-modal__pinned px-4 py-2">
              <div className="flex items-center gap-2 text-xs">
                <Pin className="h-3 w-3 text-primary" />
                <span className="text-muted-foreground">Pinned message</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={pinnedMessage.avatarUrl} />
                  <AvatarFallback className="text-[8px] bg-primary/30">
                    {pinnedMessage.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-foreground text-sm">{pinnedMessage.message}</span>
              </div>
            </div>
          )}

          {/* Messages */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {messages.filter(m => !m.isPinned).map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2"
              >
                {/* Profile Avatar */}
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarImage src={msg.avatarUrl} />
                  <AvatarFallback 
                    className="text-[10px]"
                    style={{ backgroundColor: msg.color + '40', color: msg.color }}
                  >
                    {msg.username.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                {/* Message Content */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm leading-relaxed text-white">
                    {msg.isVenue && (
                      <span className="text-primary mr-1">✦</span>
                    )}
                    {msg.message}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Input */}
          <div className="vibe-modal__composer p-4">
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
                className="bg-primary hover:bg-primary/80"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomerChatModal;
