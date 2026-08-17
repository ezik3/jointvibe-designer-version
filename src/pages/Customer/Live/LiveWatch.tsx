import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { createRealtimeChannelTopic } from "@/lib/realtime";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Flag } from "lucide-react";
import ViewerCountBadge from "@/components/Customer/Live/ViewerCountBadge";
import FloatingLiveChatPanel from "@/components/Customer/Live/FloatingLiveChatPanel";
import { useTranslation } from 'react-i18next';

const LiveWatch = () => {
  const { t } = useTranslation('common');
  const { streamId } = useParams<{ streamId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  // Track audio elements appended to document.body so we can clean them up on unmount
  const audioElesRef = useRef<HTMLElement[]>([]);

  const [streamEnded, setStreamEnded] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [hostName, setHostName] = useState("Streamer");
  const [hostAvatar, setHostAvatar] = useState<string | undefined>();
  const [connecting, setConnecting] = useState(true);

  // Upsert viewer presence
  useEffect(() => {
    if (!streamId || !user) return;
    const upsertPresence = async () => {
      await (supabase as any).from("live_stream_viewers").upsert(
        { stream_id: streamId, user_id: user.id, last_seen_at: new Date().toISOString() },
        { onConflict: "stream_id,user_id" }
      );
    };
    upsertPresence();
    const interval = setInterval(upsertPresence, 15000);
    return () => clearInterval(interval);
  }, [streamId, user]);

  // Viewer count polling
  useEffect(() => {
    if (!streamId) return;
    const poll = async () => {
      const cutoff = new Date(Date.now() - 45000).toISOString();
      const { count } = await (supabase as any)
        .from("live_stream_viewers")
        .select("*", { count: "exact", head: true })
        .eq("stream_id", streamId)
        .gte("last_seen_at", cutoff);
      setViewerCount(count || 0);
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [streamId]);

  // Connect to LiveKit room
  useEffect(() => {
    if (!streamId || !user) return;
    let room: Room | null = null;

    (async () => {
      try {
        const { data: stream } = await (supabase as any)
          .from("live_streams")
          .select("*")
          .eq("id", streamId)
          .maybeSingle();

        if (!stream || stream.status !== "live") {
          setStreamEnded(true);
          setConnecting(false);
          return;
        }

        const { data: profile } = await supabase
          .from("customer_profiles")
          .select("display_name, avatar_url")
          .eq("user_id", stream.host_user_id)
          .maybeSingle();

        if (profile) {
          setHostName(profile.display_name?.split(" ")[0] || "Streamer");
          setHostAvatar(profile.avatar_url || undefined);
        }

        const { data, error } = await supabase.functions.invoke("livekit-token", {
          body: { action: "viewer", streamId },
        });

        if (error || !data?.token) {
          toast.error(data?.error || "Failed to join stream");
          setConnecting(false);
          return;
        }

        const wsUrl = data.wsUrl || import.meta.env.VITE_LIVEKIT_WS_URL;
        if (!wsUrl) { toast.error("LiveKit not configured"); setConnecting(false); return; }

        room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video) {
            const doAttach = (label: string) => {
              if (videoRef.current) {
                track.attach(videoRef.current);
                console.log(`[LiveWatch] ✅ Video track attached (${label})`);
                return true;
              }
              return false;
            };
            requestAnimationFrame(() => { if (doAttach("rAF")) return; });
            [100, 300, 600, 1000].forEach((ms) =>
              setTimeout(() => doAttach(`${ms}ms`), ms)
            );
          }
          if (track.kind === Track.Kind.Audio) {
            const audioEl = track.attach();
            document.body.appendChild(audioEl);
            audioElesRef.current.push(audioEl);
          }
        });

        room.on(RoomEvent.Disconnected, () => { setStreamEnded(true); });

        await room.connect(wsUrl, data.token);
        setConnecting(false);

        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (pub.track && pub.track.kind === Track.Kind.Video) {
              const t = pub.track;
              requestAnimationFrame(() => {
                if (videoRef.current) t.attach(videoRef.current);
              });
              [200, 500, 1000].forEach((ms) =>
                setTimeout(() => { if (videoRef.current) t.attach(videoRef.current); }, ms)
              );
            }
            if (pub.track && pub.track.kind === Track.Kind.Audio) {
              const audioEl = pub.track.attach();
              document.body.appendChild(audioEl);
              audioElesRef.current.push(audioEl);
            }
          });
        });
      } catch (err) {
        console.error("Error joining stream:", err);
        toast.error("Failed to join stream");
        setConnecting(false);
      }
    })();

    return () => {
      room?.disconnect();
      // Remove any audio elements we appended to document.body
      audioElesRef.current.forEach((el) => {
        if (el.parentNode === document.body) {
          document.body.removeChild(el);
        }
      });
      audioElesRef.current = [];
    };
  }, [streamId, user]);

  // Listen for stream ending
  useEffect(() => {
    if (!streamId) return;
    const channel = supabase
      .channel(createRealtimeChannelTopic(`stream-status-${streamId}`))
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${streamId}` },
        (payload) => {
          if ((payload.new as any).status === "ended") {
            setStreamEnded(true);
            roomRef.current?.disconnect();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [streamId]);

  // Cleanup video/room + auto-navigate when stream ends
  useEffect(() => {
    if (!streamEnded) return;
    // Clear video source so camera feed doesn't show behind overlay
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = "";
    }
    // Disconnect room if still connected
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    // Auto-navigate back after 3 seconds
    const timer = setTimeout(() => navigate(-1), 3000);
    return () => clearTimeout(timer);
  }, [streamEnded, navigate]);

  const handleReport = async () => {
    if (!user || !streamId) return;
    await supabase.from("post_reports").insert({ post_id: streamId, reporter_id: user.id, reason: "live_stream_report" });
    toast.success("Report submitted");
  };

  const content = (
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col">
      <div className="flex-1 relative">
        {connecting && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-white/80 text-sm">Joining stream...</p>
            </div>
          </div>
        )}
        <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40" />

        {streamEnded && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-30">
            <div className="text-center space-y-4">
              <p className="text-white text-xl font-bold">Stream Ended</p>
              <p className="text-white/40 text-sm">Returning to feed in 3s...</p>
              <button onClick={() => navigate(-1)} className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-colors">Back to Feed</button>
            </div>
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
          <button onClick={() => navigate(-1)} className="p-2 bg-black/40 backdrop-blur-sm rounded-full">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-red-500 px-3 py-1 rounded-full">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white text-xs font-bold">LIVE</span>
            </div>
            <ViewerCountBadge count={viewerCount} />
          </div>
          <button onClick={handleReport} className="p-2 bg-black/40 backdrop-blur-sm rounded-full">
            <Flag className="w-4 h-4 text-white/70" />
          </button>
        </div>

        <div className="absolute top-16 left-4 z-10 flex items-center gap-2">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-red-500 to-pink-500">
            {hostAvatar ? <img src={hostAvatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-bold">{hostName[0]}</div>}
          </div>
          <span className="text-white font-semibold text-sm">{hostName}</span>
        </div>
      </div>

      {streamId && !streamEnded && (
        <FloatingLiveChatPanel streamId={streamId} />
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default LiveWatch;
