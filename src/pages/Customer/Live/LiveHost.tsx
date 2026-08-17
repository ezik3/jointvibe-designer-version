import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Room, Track, RoomEvent, DisconnectReason } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { X, Mic, MicOff, Video, VideoOff, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import ViewerCountBadge from "@/components/Customer/Live/ViewerCountBadge";
import FloatingLiveChatPanel from "@/components/Customer/Live/FloatingLiveChatPanel";
import { recordTierEvent } from "@/hooks/useUserTier";
import { updateVenueScoreCounter } from "@/hooks/useVenueTier";
import { useTranslation } from 'react-i18next';

const LOG = (tag: string, ...args: unknown[]) => console.log(`[LiveHost:${tag}]`, new Date().toISOString(), ...args);

const LiveHost = () => {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const endCalledRef = useRef(false);
  const mountIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const transitioningToLiveRef = useRef(false);
  const trackAttachedRef = useRef(false);

  const [phase, setPhase] = useState<"preview" | "live" | "ended">("preview");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const peakViewerCountRef = useRef(0);

  LOG("mount", `instance=${mountIdRef.current}, user=${user?.id}`);

  // Log Supabase URL for backend consistency check
  useEffect(() => {
    LOG("supabase-url", `App is using: ${(supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL}`);
  }, []);

  // Log unmount
  useEffect(() => {
    const id = mountIdRef.current;
    return () => {
      LOG("unmount", `instance=${id}, phase at unmount=${phase}, streamId=${streamId}, endCalled=${endCalledRef.current}`);
    };
  }, [phase, streamId]);

  // Start local camera preview
  useEffect(() => {
    if (phase !== "preview") return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    LOG("camera", `Starting preview camera, facingMode=${facingMode}`);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: true });
        if (cancelled) {
          LOG("camera", "Preview cancelled before stream ready, stopping tracks");
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);
        if (videoRef.current) videoRef.current.srcObject = stream;
        LOG("camera", "Preview camera started OK");
      } catch (err) {
        LOG("camera", "Camera access denied:", err);
        toast.error("Camera access denied");
      }
    })();

    return () => {
      cancelled = true;
      // Don't stop preview tracks if we're transitioning to LiveKit
      if (stream && !transitioningToLiveRef.current) {
        LOG("camera", "Cleanup: stopping preview tracks");
        stream.getTracks().forEach((t) => t.stop());
      } else if (stream && transitioningToLiveRef.current) {
        LOG("camera", "Skipping preview cleanup — transitioning to live");
      }
    };
  }, [phase, facingMode]);

  // Aggressive re-attach: retry chain guarantees track sticks after React reconciliation
  useEffect(() => {
    if (phase !== "live" || !roomRef.current) return;

    const tryAttach = (label: string) => {
      if (!videoRef.current || !roomRef.current) return false;
      const camPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) {
        camPub.track.attach(videoRef.current);
        trackAttachedRef.current = true;
        LOG("reattach", `✅ Camera track attached (${label})`);
        // Stop leftover preview tracks now that LiveKit is rendering
        if (localStream) {
          localStream.getTracks().forEach((t) => t.stop());
          LOG("reattach", "Stopped leftover preview tracks");
        }
        return true;
      }
      return false;
    };

    // Retry chain: rAF → 100ms → 300ms → 600ms → 1000ms
    requestAnimationFrame(() => { if (tryAttach("rAF")) return; });
    const delays = [100, 300, 600, 1000];
    const timers = delays.map((ms) =>
      setTimeout(() => { if (!trackAttachedRef.current) tryAttach(`${ms}ms`); }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, localStream]);

  // Timer
  useEffect(() => {
    if (phase !== "live") return;
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Viewer count polling
  useEffect(() => {
    if (!streamId || phase !== "live") return;
    const interval = setInterval(async () => {
      const cutoff = new Date(Date.now() - 45000).toISOString();
      const { count } = await (supabase as any)
        .from("live_stream_viewers")
        .select("*", { count: "exact", head: true })
        .eq("stream_id", streamId)
        .gte("last_seen_at", cutoff);
      const c = count || 0;
      setViewerCount(c);
      if (c > peakViewerCountRef.current) peakViewerCountRef.current = c;
    }, 10000);
    return () => clearInterval(interval);
  }, [streamId, phase]);

  const [isGoingLive, setIsGoingLive] = useState(false);

  const goLive = useCallback(async () => {
    if (!user || isGoingLive) return;
    setIsGoingLive(true);
    LOG("goLive", "Starting go-live flow...");

    try {
      // Verify session exists before invoking
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      LOG("goLive", `Session check: userId=${sessionData.session?.user?.id || "NONE"}, hasToken=${!!accessToken}, tokenPrefix=${accessToken?.slice(0, 20) || "N/A"}`);

      if (!accessToken) {
        toast.error("You must be logged in to go live");
        setIsGoingLive(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { action: "host", title: title || "Live Stream" },
      });

      LOG("goLive", `Edge function response: error=${!!error}, streamId=${data?.streamId}, hasToken=${!!data?.token}, wsUrl=${data?.wsUrl ? "SET" : "EMPTY"}`);

      if (error || !data?.token) {
        toast.error(data?.error || "Failed to start stream");
        setIsGoingLive(false);
        return;
      }

      setStreamId(data.streamId);
      // Mark transition so preview cleanup doesn't kill tracks prematurely
      transitioningToLiveRef.current = true;
      trackAttachedRef.current = false;
      LOG("goLive", `Stream created: ${data.streamId}. Clearing preview before LiveKit takes over.`);

      // CRITICAL: Clear preview srcObject and stop preview tracks BEFORE LiveKit creates its own
      // This prevents the old preview stream from conflicting with LiveKit's camera track
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        LOG("goLive", "Cleared video srcObject");
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        LOG("goLive", "Stopped preview tracks before LiveKit takeover");
      }

      const wsUrl = data.wsUrl || import.meta.env.VITE_LIVEKIT_WS_URL;
      if (!wsUrl) {
        LOG("goLive", "✘ No wsUrl available!");
        toast.error("LiveKit WebSocket URL not configured");
        setIsGoingLive(false);
        return;
      }

      const room = new Room();
      roomRef.current = room;

      // Monitor ALL room events for debugging
      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        LOG("room-event", `⚠ DISCONNECTED reason=${reason ?? "unknown"}`);
      });
      room.on(RoomEvent.Reconnecting, () => {
        LOG("room-event", "🔄 RECONNECTING...");
      });
      room.on(RoomEvent.Reconnected, () => {
        LOG("room-event", "✅ RECONNECTED");
      });
      room.on(RoomEvent.ConnectionQualityChanged, (_quality, participant) => {
        if (participant.isLocal) {
          LOG("room-event", `Connection quality: ${_quality}`);
        }
      });

      // Listen for local track published to attach video reliably
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        LOG("room-event", `LocalTrackPublished: source=${publication.source}, kind=${publication.kind}`);
        if (publication.source === Track.Source.Camera && publication.track) {
          const track = publication.track;
          const doAttach = (label: string) => {
            if (videoRef.current) {
              track.attach(videoRef.current);
              trackAttachedRef.current = true;
              LOG("room-event", `✅ Camera track attached (${label})`);
              return true;
            }
            return false;
          };
          // Aggressive retry chain: rAF → 100ms → 300ms → 600ms → 1000ms
          requestAnimationFrame(() => { if (doAttach("rAF")) return; });
          [100, 300, 600, 1000].forEach((ms) =>
            setTimeout(() => { if (!trackAttachedRef.current) doAttach(`LocalTrackPublished+${ms}ms`); }, ms)
          );
        }
      });

      LOG("goLive", `Connecting to room at ${wsUrl.substring(0, 30)}...`);
      
      // Add 15s timeout to room.connect
      const connectPromise = room.connect(wsUrl, data.token);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out after 15 seconds")), 15000)
      );
      
      try {
        await Promise.race([connectPromise, timeoutPromise]);
      } catch (connectErr: any) {
        LOG("goLive", "✘ Room connect failed:", connectErr);
        toast.error(connectErr?.message || "Failed to connect to live server");
        setIsGoingLive(false);
        roomRef.current = null;
        return;
      }
      
      LOG("goLive", "Room connected! Enabling camera+mic...");

      await room.localParticipant.enableCameraAndMicrophone();
      LOG("goLive", "Camera+mic enabled. Checking for existing track...");

      // Also try immediate attachment in case event already fired
      const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camTrack?.track && videoRef.current) {
        camTrack.track.attach(videoRef.current);
        LOG("goLive", "Video attached immediately");
      } else {
        LOG("goLive", "Track not yet available, waiting for LocalTrackPublished event");
      }

      setPhase("live");
      LOG("goLive", "✅ Phase set to LIVE. Stream is broadcasting.");
      const toastId = toast.success("🔴 You're live!", { duration: 2000 });
      setTimeout(() => toast.dismiss(toastId), 2500);
    } catch (err) {
      LOG("goLive", "✘ Error:", err);
      toast.error("Failed to go live");
      setIsGoingLive(false);
    }
  }, [user, title, localStream, isGoingLive]);

  const endStream = useCallback(async (caller: string) => {
    LOG("endStream", `Called by: ${caller}, streamId=${streamId}, alreadyCalled=${endCalledRef.current}`);

    if (endCalledRef.current) {
      LOG("endStream", "Already called, skipping duplicate.");
      return;
    }
    endCalledRef.current = true;

    try {
      if (streamId) {
        LOG("endStream", `Invoking end-live-stream edge function for ${streamId}...`);
        const { data, error } = await supabase.functions.invoke("end-live-stream", { body: { streamId } });
        LOG("endStream", `Edge function result: data=${JSON.stringify(data)}, error=${error ? JSON.stringify(error) : "none"}`);

        // Tier events for live streaming
        if (user && elapsedSeconds >= 600) {
          recordTierEvent(user.id, "live_stream", { stream_id: streamId, duration_seconds: elapsedSeconds });
        }
        if (user && peakViewerCountRef.current >= 10) {
          recordTierEvent(user.id, "live_stream_viewers", { stream_id: streamId, peak_viewers: peakViewerCountRef.current });
        }
        // Fire venue tier counter for live stream ended (if venue-associated stream)
        // The edge function end-live-stream already updates the live_streams table status to 'ended'
        // which the DB trigger handles, but we also fire here for any venue_id-tagged streams
        updateVenueScoreCounter(streamId, "live_stream_ended").catch(() => {});
      }
      if (roomRef.current) {
        LOG("endStream", "Disconnecting LiveKit room...");
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      setPhase("ended");
      LOG("endStream", "✅ Phase set to ENDED");
    } catch (err) {
      LOG("endStream", "✘ Error:", err);
      toast.error("Failed to end stream");
    }
  }, [streamId]);

  const toggleMic = () => {
    if (roomRef.current && phase === "live") {
      const enabled = !isMicOn;
      roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      setIsMicOn(enabled);
    }
  };

  const toggleCam = () => {
    if (roomRef.current && phase === "live") {
      const enabled = !isCamOn;
      roomRef.current.localParticipant.setCameraEnabled(enabled);
      setIsCamOn(enabled);
    }
  };

  // Auto-navigate back 3s after stream ends
  useEffect(() => {
    if (phase !== "ended") return;
    const timer = setTimeout(() => navigate(-1), 3000);
    return () => clearTimeout(timer);
  }, [phase, navigate]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const content = (
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col">
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40" />

        {/* Debug overlay — hidden from users */}
        <div className="hidden absolute top-12 left-2 z-20 bg-black/70 text-[10px] text-green-400 font-mono p-2 rounded max-w-[200px]">
          <div>inst: {mountIdRef.current}</div>
          <div>phase: {phase}</div>
          <div>streamId: {streamId?.slice(0, 8) || "none"}</div>
          <div>endCalled: {String(endCalledRef.current)}</div>
          <div>room: {roomRef.current ? "connected" : "null"}</div>
        </div>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
          <button onClick={() => {
            if (phase === "live") {
              LOG("ui", "X button pressed while LIVE → calling endStream");
              endStream("x-button-live");
            } else {
              LOG("ui", "X button pressed while preview → navigating back");
              localStream?.getTracks().forEach((t) => t.stop());
              navigate(-1);
            }
          }} className="p-2 bg-black/40 backdrop-blur-sm rounded-full">
            <X className="w-5 h-5 text-white" />
          </button>
          {phase === "live" && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-red-500 px-3 py-1 rounded-full">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white text-xs font-bold">LIVE</span>
                <span className="text-white/80 text-xs">{formatTime(elapsedSeconds)}</span>
              </div>
              <ViewerCountBadge count={viewerCount} />
            </div>
          )}
        </div>

        {/* Title input removed per user request */}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          {phase === "preview" && (
            <Button onClick={goLive} disabled={isGoingLive} className="w-full h-14 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-lg font-bold rounded-2xl disabled:opacity-50">
              <Radio className="w-5 h-5 mr-2" /> {isGoingLive ? "Connecting..." : "GO LIVE"}
            </Button>
          )}
          {phase === "live" && (
            <div className="flex items-center justify-center gap-4">
              <button onClick={toggleMic} className="p-3 bg-white/10 backdrop-blur-sm rounded-full">
                {isMicOn ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-red-400" />}
              </button>
              <button onClick={() => { LOG("ui", "END LIVE button pressed"); endStream("end-button"); }} className="px-8 py-3 bg-red-500 hover:bg-red-600 rounded-full text-white font-bold transition-colors">END LIVE</button>
              <button onClick={toggleCam} className="p-3 bg-white/10 backdrop-blur-sm rounded-full">
                {isCamOn ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-red-400" />}
              </button>
            </div>
          )}
          {phase === "ended" && (
            <div className="text-center space-y-4">
              <p className="text-white text-xl font-bold">Stream Ended</p>
              <p className="text-white/60">Duration: {formatTime(elapsedSeconds)}</p>
              <p className="text-white/40 text-sm">Returning to feed in 3s...</p>
              <Button onClick={() => navigate(-1)} className="bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl px-8">Back to Feed</Button>
            </div>
          )}
        </div>
      </div>

      {phase === "live" && streamId && (
        <FloatingLiveChatPanel streamId={streamId} />
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default LiveHost;
