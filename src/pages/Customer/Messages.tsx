import { useState, useEffect } from "react";
import { Search, Send, ArrowLeft, MoreVertical, Phone, Video, Image, Smile, Plus } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Web3FeedHeader from "@/components/Customer/Feed/Web3FeedHeader";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

interface Message {
  id: string;
  content: string;
  sent: boolean;
  time: string;
}

// Mock data for conversations
const mockConversations: Conversation[] = [
  {
    id: "1",
    name: "Emma Wilson",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150",
    lastMessage: "See you at the venue tonight! 🎉",
    time: "2m ago",
    unread: 2,
    online: true,
  },
  {
    id: "2",
    name: "Mike Brooks",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
    lastMessage: "That was an amazing night 🔥",
    time: "15m ago",
    unread: 0,
    online: true,
  },
  {
    id: "3",
    name: "Sophie Lee",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    lastMessage: "Thanks for the invite!",
    time: "1h ago",
    unread: 0,
    online: false,
  },
  {
    id: "4",
    name: "Jake Rivera",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    lastMessage: "Heading there now",
    time: "3h ago",
    unread: 1,
    online: false,
  },
  {
    id: "5",
    name: "Olivia Davis",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
    lastMessage: "Let's meet up this weekend",
    time: "Yesterday",
    unread: 0,
    online: true,
  },
];

// Mock messages for a conversation
const mockMessages: Message[] = [
  { id: "1", content: "Hey! Are you coming to the venue tonight?", sent: false, time: "7:30 PM" },
  { id: "2", content: "Yes! Just getting ready now", sent: true, time: "7:32 PM" },
  { id: "3", content: "Perfect! I'll meet you at the entrance", sent: false, time: "7:33 PM" },
  { id: "4", content: "Sounds good, see you in about 30 mins", sent: true, time: "7:35 PM" },
  { id: "5", content: "See you at the venue tonight!", sent: false, time: "7:40 PM" },
];

const Messages = () => {
  const { t } = useTranslation('common');
  const isMobile = useIsMobile();
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = mockConversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    
    const newMsg: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sent: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    
    setMessages([...messages, newMsg]);
    setNewMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Conversation List View
  const ConversationList = () => (
    <div className="flex flex-col h-full relative">
      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder={t('messages.search', 'Search messages...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 bg-zinc-800/70 border-zinc-700/50 rounded-full h-11 text-white placeholder:text-zinc-500 focus:border-cyan-500/50 focus:ring-cyan-500/20"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {filteredConversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => setSelectedChat(conv)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 transition-all ${
              selectedChat?.id === conv.id 
                ? "bg-zinc-800/80 border-l-2 border-l-cyan-500" 
                : "hover:bg-zinc-800/40 border-l-2 border-l-transparent"
            }`}
          >
            <div className="relative flex-shrink-0">
              <Avatar className="w-12 h-12 ring-2 ring-zinc-700/50">
                <AvatarImage src={conv.avatar} className="object-cover" />
                <AvatarFallback className="bg-zinc-700 text-zinc-300">{conv.name[0]}</AvatarFallback>
              </Avatar>
              {conv.online && (
                <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
              )}
            </div>
            
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-semibold text-white truncate">{conv.name}</span>
                <span className="text-xs text-zinc-500 flex-shrink-0 ml-2">{conv.time}</span>
              </div>
              <p className="text-sm text-zinc-400 truncate">{conv.lastMessage}</p>
            </div>

            {conv.unread > 0 && (
              <div className="w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-white font-bold">{conv.unread}</span>
              </div>
            )}
          </button>
        ))}

        {filteredConversations.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-zinc-500">{t('messages.no_conversations', 'No conversations found')}</p>
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <Button 
          className="w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-600 shadow-lg shadow-cyan-500/30"
          size="icon"
        >
          <Plus className="w-5 h-5 text-white" />
        </Button>
      </div>
    </div>
  );

  // Chat View
  const ChatView = () => (
    <div className="flex flex-col h-full bg-zinc-900/50">
      {/* Chat Header */}
      <div className="flex items-center gap-3 p-4 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedChat(null)}
            className="mr-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        
        <div className="relative">
          <Avatar className="w-10 h-10 ring-2 ring-zinc-700/50">
            <AvatarImage src={selectedChat?.avatar} className="object-cover" />
            <AvatarFallback className="bg-zinc-700 text-zinc-300">{selectedChat?.name[0]}</AvatarFallback>
          </Avatar>
          {selectedChat?.online && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
          )}
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-white">{selectedChat?.name}</h3>
          <p className="text-xs text-zinc-500">
            {selectedChat?.online ? t('messages.online', 'Online') : t('messages.offline', 'Offline')}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white hover:bg-zinc-800">
            <Phone className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white hover:bg-zinc-800">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white hover:bg-zinc-800">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'none' }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sent ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                msg.sent
                  ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white rounded-br-md"
                  : "bg-zinc-800 text-white rounded-bl-md"
              }`}
            >
              <p className="text-sm">{msg.content}</p>
              <p className={`text-xs mt-1 ${msg.sent ? "text-white/70" : "text-zinc-500"}`}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white hover:bg-zinc-800 flex-shrink-0">
            <Plus className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white hover:bg-zinc-800 flex-shrink-0">
            <Image className="w-5 h-5" />
          </Button>
          
          <div className="flex-1 relative">
            <Input
              placeholder={t('messages.type_message', 'Type a message...')}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pr-10 bg-zinc-800 border-zinc-700 rounded-xl text-white placeholder:text-zinc-500"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <Smile className="w-5 h-5" />
            </Button>
          </div>

          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="bg-gradient-to-r from-cyan-500 to-teal-500 text-white rounded-xl flex-shrink-0 disabled:opacity-50"
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  // Empty State Component
  const EmptyState = () => (
    <div className="h-full flex items-center justify-center bg-zinc-900/30">
      <div className="text-center max-w-md px-6">
        {/* Logo Icon */}
        <div className="w-20 h-20 bg-zinc-800/80 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl">
          <svg 
            viewBox="0 0 24 24" 
            className="w-10 h-10 text-cyan-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        
        <h3 className="text-2xl font-bold text-white mb-4">{t('messages.your_messages', 'Your Messages')}</h3>
        <p className="text-zinc-400 text-sm leading-relaxed mb-8">
          {t('messages.empty_description', 'Connect with your private circle or start a conversation with your network. Your privacy is our priority.')}
        </p>
        
        <div className="flex items-center justify-center gap-4">
          <Button className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-cyan-500/25">
            {t('messages.new_conversation', 'New Conversation')}
          </Button>
          <Button 
            variant="outline" 
            className="border-zinc-600 text-white hover:bg-zinc-800 px-6 py-2.5 rounded-full font-semibold bg-zinc-800/50"
          >
            {t('messages.view_requests', 'View Requests')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      <Web3FeedHeader />

      <div className="pt-16 min-h-[calc(100vh-64px)]">
        {/* Mobile View */}
        {isMobile ? (
          <AnimatePresence mode="wait">
            {selectedChat ? (
              <motion.div
                key="chat"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.2 }}
                className="h-full"
              >
                <ChatView />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.2 }}
                className="h-full"
              >
                <ConversationList />
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          /* Desktop View - Split Panel */
          <div className="flex h-full max-w-6xl mx-auto">
            {/* Sidebar */}
            <div className="w-96 border-r border-zinc-800 flex-shrink-0 bg-zinc-900/40">
              <ConversationList />
            </div>

            {/* Chat Area */}
            <div className="flex-1">
              {selectedChat ? (
                <ChatView />
              ) : (
                <EmptyState />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messages;
