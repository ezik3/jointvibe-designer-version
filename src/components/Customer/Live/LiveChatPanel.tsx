import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import { Send } from "lucide-react";
import { useTranslation } from 'react-i18next';
import TranslatedText from "@/components/i18n/TranslatedText";

interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  display_name?: string;
  avatar_url?: string;
}

interface LiveChatPanelProps {
  streamId: string;
}

const LiveChatPanel = ({ streamId }: LiveChatPanelProps) => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [lastSent, setLastSent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  // Store sender's own profile so optimistic messages always show name/avatar
  const senderProfileRef = useRef<{ display_name?: string; avatar_url?: string } | null>(null);

  // Fetch own profile on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from("customer_profiles")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) senderProfileRef.current = data;
      });
  }, [user]);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await (supabase as any)
        .from("live_chat_messages")
        .select("*")
        .eq("stream_id", streamId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((m: any) => m.user_id))] as string[];
        const { data: profiles } = await supabase
          .from("customer_profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || []);
        const msgs = data.map((m: any) => ({
          ...m,
          display_name: profileMap.get(m.user_id)?.display_name,
          avatar_url: profileMap.get(m.user_id)?.avatar_url,
        }));
        msgs.forEach((m: ChatMessage) => knownIdsRef.current.add(m.id));
        setMessages(msgs);
      }
    };

    fetchMessages();

    const channel = supabase
      .channel(createRealtimeChannelTopic(`live-chat-${streamId}`))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages" },
        async (payload) => {
          const msg = payload.new as any;
          // Client-side filter: only process messages for this stream
          if (msg.stream_id !== streamId) return;
          if (knownIdsRef.current.has(msg.id)) return;
          knownIdsRef.current.add(msg.id);

          // Also remove any temp ID for this message (in case optimistic was added with temp id)
          // We identify by checking if this is our own message arriving via realtime
          if (user && msg.user_id === user.id) {
            // Our own message arrived via realtime — we already have it optimistically, skip
            // But check if we truly have it (by content match within last few seconds)
            setMessages(prev => {
              const hasDupe = prev.some(m => m.user_id === msg.user_id && m.content === msg.content && m.id.startsWith("temp-"));
              if (hasDupe) {
                // Replace temp message with real one
                return prev.map(m => 
                  m.id.startsWith("temp-") && m.user_id === msg.user_id && m.content === msg.content
                    ? { ...msg, display_name: m.display_name, avatar_url: m.avatar_url }
                    : m
                );
              }
              return prev;
            });
            return;
          }

          const { data: profile } = await supabase
            .from("customer_profiles")
            .select("display_name, avatar_url")
            .eq("user_id", msg.user_id)
            .maybeSingle();

          setMessages((prev) => [
            ...prev,
            { ...msg, display_name: profile?.display_name, avatar_url: profile?.avatar_url },
          ]);
        }
      )
      .subscribe((status: string) => {
        console.log(`[LiveChat] Channel status for stream ${streamId}:`, status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [streamId, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!user || !input.trim()) return;
    const now = Date.now();
    if (now - lastSent < 1000) return;

    const trimmed = input.trim().slice(0, 240);
    setInput("");
    setLastSent(now);

    const profile = senderProfileRef.current;
    const tempId = `temp-${Date.now()}`;

    // TRUE optimistic: append BEFORE the DB insert
    const optimisticMsg: ChatMessage = {
      id: tempId,
      user_id: user.id,
      stream_id: streamId,
      content: trimmed,
      created_at: new Date().toISOString(),
      display_name: profile?.display_name,
      avatar_url: profile?.avatar_url,
    } as any;

    knownIdsRef.current.add(tempId);
    setMessages((prev) => [...prev, optimisticMsg]);

    // Insert into DB
    const { data: inserted } = await (supabase as any).from("live_chat_messages").insert({
      stream_id: streamId,
      user_id: user.id,
      content: trimmed,
    }).select().single();

    // Replace temp ID with real ID
    if (inserted) {
      knownIdsRef.current.add(inserted.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: inserted.id } : m
        )
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1.5 px-3 py-2 scrollbar-hide">
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 overflow-hidden">
              {msg.avatar_url ? (
                <img src={msg.avatar_url} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-bold">
                  {(msg.display_name || "A")[0]}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="text-cyan-400 text-xs font-semibold mr-1.5">
                {msg.display_name?.split(" ")[0] || "Anon"}
              </span>
              <TranslatedText
                text={msg.content}
                contentId={msg.id}
                contentType="live_chat_message"
                hideToggle={msg.user_id === user?.id}
                className="text-white/90 text-xs break-words"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-sm border-t border-white/10">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder={t('chat.say_something')}
          maxLength={240}
          className="flex-1 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="p-2 rounded-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
};

export default LiveChatPanel;
