import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLivePresence, LivePresenceStream } from "@/hooks/useLivePresence";
import { X, Radio } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from 'react-i18next';

/**
 * Shows a popup when a user you follow goes live.
 * Auto-dismisses after 8 seconds or on swipe/click.
 */
const LiveFollowerPopup = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { streams } = useLivePresence();
  const [popup, setPopup] = useState<LivePresenceStream | null>(null);
  const [visible, setVisible] = useState(false);
  const seenRef = useRef(new Set<string>());
  const followingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch who the current user follows
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_follows")
        .select("following_id")
        .eq("follower_id", user.id);
      followingRef.current = new Set(data?.map((d) => d.following_id) || []);
    })();
  }, [user]);

  // Watch for new live streams from followed users
  useEffect(() => {
    if (!user || followingRef.current.size === 0) return;

    for (const stream of streams) {
      if (
        followingRef.current.has(stream.host_user_id) &&
        !seenRef.current.has(stream.id) &&
        stream.host_user_id !== user.id
      ) {
        seenRef.current.add(stream.id);
        setPopup(stream);
        setVisible(true);

        // Auto-dismiss after 8s
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setVisible(false), 8000);
        break; // show one at a time
      }
    }
  }, [streams, user]);

  const dismiss = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
  };

  const watchStream = () => {
    if (!popup) return;
    dismiss();
    navigate(`/app/live/watch/${popup.id}`);
  };

  if (!visible || !popup) return null;

  return (
    <div className="fixed top-16 left-4 right-4 md:left-auto md:right-6 md:w-[380px] z-[9998] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="customer-modal-panel p-3 flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="w-12 h-12 border-2 border-[var(--customer-modal-line)]">
            <AvatarImage src={popup.host_avatar} />
            <AvatarFallback className="bg-[var(--customer-modal-cyan-soft)] text-[var(--customer-modal-cyan)] font-bold">
              {(popup.host_name || "L")[0]}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 border-2 border-[var(--customer-modal-surface)] flex items-center justify-center">
            <Radio className="w-2.5 h-2.5 text-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[var(--customer-modal-text)] text-sm font-semibold truncate">
            {t('live.is_live', { name: popup.host_name?.split(" ")[0] || t('live.someone') })}
          </p>
          <p className="text-[var(--customer-modal-muted)] text-xs truncate">
            {popup.title || t('live.streaming_now')}
          </p>
        </div>

        <button
          onClick={watchStream}
          className="customer-modal-primary shrink-0 px-4 py-1.5 text-xs font-bold transition-colors"
        >
          {t('live.watch')}
        </button>

        <button onClick={dismiss} className="customer-modal-secondary shrink-0 h-7 w-7 p-0 transition-colors" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default LiveFollowerPopup;
