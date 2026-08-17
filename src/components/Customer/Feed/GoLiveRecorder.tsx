import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Radio, Video, VideoOff, Mic, MicOff, RotateCcw, Camera, Square, Globe, Lock, Monitor, Smartphone, ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDualCamera, checkDualCameraSupport, detectPlatform } from "@/hooks/useDualCamera";
import { useScreenRecording, checkScreenRecordingSupport } from "@/hooks/useScreenRecording";
import { useDrawOverlay } from "@/hooks/useDrawOverlay";
import { calculatePipRect } from "@/hooks/usePipControls";
import type { PipShape, PipSize } from "@/hooks/usePipControls";
import GoLiveSideRail from "./GoLiveSideRail";
import GoLiveDrawPanel from "./GoLiveDrawPanel";
import { useTranslation } from 'react-i18next';
import "./go-live-recorder.css";

type RecordingMode = 'standard' | 'dual-cam' | 'screen-cam';

interface GoLiveRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  userAvatar?: string;
  userName?: string;
  onComplete: (data: {
    videoUrl: string;
    content: string;
    visibility: "private" | "public";
    isLive: boolean;
  }) => void;
}

export default function GoLiveRecorder({
  isOpen,
  onClose,
  userAvatar,
  userName,
  onComplete,
}: GoLiveRecorderProps) {
  const { t } = useTranslation('feed');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mode selection state
  const [showModeSelection, setShowModeSelection] = useState(true);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('standard');
  const [dualCamSupported, setDualCamSupported] = useState(false);
  const [screenRecordSupported, setScreenRecordSupported] = useState(false);
  const [platform, setPlatform] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [recordingTime, setRecordingTime] = useState(0);
  const [visibility, setVisibility] = useState<"private" | "public">("public");
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Dual camera hook
  const dualCamera = useDualCamera();
  
  // Screen recording hook
  const screenRecording = useScreenRecording();
  
  // Drawing overlay hook
  const drawOverlay = useDrawOverlay();

  // Detect capabilities on mount
  useEffect(() => {
    const detectCapabilities = async () => {
      const platformType = detectPlatform();
      setPlatform(platformType);
      
      const dualSupport = await checkDualCameraSupport();
      setDualCamSupported(dualSupport);
      
      const screenSupport = checkScreenRecordingSupport();
      setScreenRecordSupported(screenSupport);
    };
    
    detectCapabilities();
  }, []);

  // Start camera when modal opens - optimized for speed
  useEffect(() => {
    if (isOpen && !showModeSelection) {
      if (recordingMode === 'standard') {
        // Start camera immediately without waiting
        startCamera();
      }
    } else if (!isOpen) {
      stopAllStreams();
      resetState();
    }
    return () => stopAllStreams();
  }, [isOpen, showModeSelection, recordingMode]);
  
  // Handle facing mode changes separately to avoid re-triggering on open
  useEffect(() => {
    if (isOpen && !showModeSelection && recordingMode === 'standard' && streamRef.current) {
      // Only restart camera if we have an existing stream and facing mode changed
      startCamera();
    }
  }, [facingMode]);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const resetState = () => {
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setRecordedBlob(null);
    setPreviewUrl(null);
    setDescription("");
    setShowModeSelection(true);
    setRecordingMode('standard');
    chunksRef.current = [];
    drawOverlay.clear();
    drawOverlay.setEnabled(false);
    drawOverlay.setPanelOpen(false);
  };

  const stopAllStreams = () => {
    stopCamera();
    dualCamera.stopDualCamera();
    screenRecording.stopScreenRecording();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera access error:", error);
      toast.error(t("golive.camera_permission_error"));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    const activeStream = getActiveStream();
    if (activeStream) {
      const audioTrack = activeStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const switchCamera = async () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const getActiveStream = (): MediaStream | null => {
    switch (recordingMode) {
      case 'dual-cam':
        return dualCamera.compositeStream;
      case 'screen-cam':
        return screenRecording.compositeStream;
      default:
        return streamRef.current;
    }
  };

  const handleModeSelect = async (mode: RecordingMode) => {
    setRecordingMode(mode);
    setShowModeSelection(false);

    // Start camera/screen immediately without toast delays
    if (mode === 'dual-cam') {
      const success = await dualCamera.startDualCamera();
      if (!success) {
        toast.error(t("golive.dual_cam_fallback"));
        setRecordingMode('standard');
        startCamera();
      }
    } else if (mode === 'screen-cam') {
      const success = await screenRecording.startScreenRecording();
      if (!success) {
        toast.error(t("golive.screen_capture_error"));
        setShowModeSelection(true);
      }
    } else {
      // Standard mode - camera starts via useEffect
    }
  };

  const startRecording = () => {
    const activeStream = getActiveStream();
    if (!activeStream) {
      toast.error(t("golive.no_active_stream"));
      return;
    }

    chunksRef.current = [];
    
    // Try different mime types for best compatibility
    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4"
    ];
    
    let recorder: MediaRecorder | null = null;
    for (const mimeType of mimeTypes) {
      try {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          recorder = new MediaRecorder(activeStream, { mimeType });
          break;
        }
      } catch {
        continue;
      }
    }
    
    if (!recorder) {
      try {
        recorder = new MediaRecorder(activeStream);
      } catch (e) {
        toast.error(t("golive.recording_not_supported"));
        return;
      }
    }
    
    mediaRecorderRef.current = recorder;

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    };

    // Start immediately
    mediaRecorderRef.current.start(1000);
    setIsRecording(true);
    toast.success(t("golive.recording_started"));
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success(t("golive.recording_stopped"));
    }
  };

  const handleUploadAndPost = async () => {
    if (!recordedBlob) {
      toast.error(t("golive.no_video_recorded"));
      return;
    }

    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("common:auth.sign_in_required"));
        setIsUploading(false);
        return;
      }

      // Upload to Supabase storage
      const fileName = `${user.id}/${Date.now()}-live.webm`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("live-videos")
        .upload(fileName, recordedBlob, {
          contentType: "video/webm",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("live-videos")
        .getPublicUrl(uploadData.path);

      const videoUrl = urlData.publicUrl;

      // Call parent with video data - pre-recorded uploads are NOT live
      onComplete({
        videoUrl,
        content: description,
        visibility,
        isLive: false,
      });

      toast.success(t("golive.video_posted"));
      onClose();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(t("golive.upload_error"));
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRecordAgain = () => {
    setRecordedBlob(null);
    setPreviewUrl(null);
    setRecordingTime(0);
    
    if (recordingMode === 'standard') {
      startCamera();
    } else if (recordingMode === 'dual-cam') {
      dualCamera.startDualCamera();
    } else if (recordingMode === 'screen-cam') {
      screenRecording.startScreenRecording();
    }
  };

  if (!isOpen) return null;

  // Mode Selection Screen
  if (showModeSelection) {
    const portalContent = (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="go-live-recorder__mode-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
            className="go-live-recorder__mode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="go-live-recorder-mode-title"
          >
            <button type="button" className="go-live-recorder__mode-close" onClick={onClose} aria-label="Close recording options">
              <X aria-hidden="true" />
            </button>
            <span className="go-live-recorder__mode-icon"><Radio aria-hidden="true" /></span>
            <h2 id="go-live-recorder-mode-title">{t("golive.record_video")}</h2>
            <p>{t("golive.choose_camera_mode")}</p>

            <div className="go-live-recorder__mode-options">
              <motion.button
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => handleModeSelect("standard")}
                className="go-live-recorder__mode-option"
              >
                <span><Camera aria-hidden="true" /></span>
                <div>
                  <strong>{t("golive.standard")}</strong>
                  <small>{t("golive.single_camera_recording")}</small>
                </div>
                <ChevronRight aria-hidden="true" />
              </motion.button>

              {(platform === "mobile" || platform === "tablet") && (
                <motion.button
                  type="button"
                  whileTap={dualCamSupported ? { scale: 0.99 } : undefined}
                  onClick={() => dualCamSupported && handleModeSelect("dual-cam")}
                  disabled={!dualCamSupported}
                  className="go-live-recorder__mode-option"
                >
                  <span><Smartphone aria-hidden="true" /></span>
                  <div>
                    <strong>{t("golive.dual_camera")}</strong>
                    <small>{dualCamSupported ? t("golive.front_back_together") : t("golive.not_available_device")}</small>
                  </div>
                  {dualCamSupported ? <em>{t("common:app.new")}</em> : <ChevronRight aria-hidden="true" />}
                </motion.button>
              )}

              {platform === "desktop" && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleModeSelect("screen-cam")}
                  className="go-live-recorder__mode-option"
                >
                  <span><Monitor aria-hidden="true" /></span>
                  <div>
                    <strong>{t("golive.screen_plus_me")}</strong>
                    <small>{t("golive.share_screen_overlay")}</small>
                  </div>
                  <em>{t("common:app.new")}</em>
                </motion.button>
              )}
            </div>

            {(platform === "mobile" || platform === "tablet") && dualCamSupported && (
              <small className="go-live-recorder__mode-note">{t("golive.dual_cam_battery_warning")}</small>
            )}
          </motion.section>
        </motion.div>
      </AnimatePresence>
    );

    return createPortal(portalContent, document.body);
  }

  // Get current pip controls based on mode
  const currentPipControls = recordingMode === 'dual-cam' ? dualCamera : screenRecording;
  const hasPipControls = recordingMode === 'dual-cam' || recordingMode === 'screen-cam';

  // Helpers to check if pointer is inside PiP overlay for dragging
  const isPipHit = (clientX: number, clientY: number): boolean => {
    if (!hasPipControls || !containerRef.current) return false;

    const canvas = recordingMode === 'dual-cam' ? dualCamera.canvasRef.current : screenRecording.canvasRef.current;
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Scale from display coords to canvas coords
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // Get pip video to compute aspect ratio
    const pipVideo = recordingMode === 'dual-cam'
      ? (currentPipControls.pipConfig.isMainSwapped ? dualCamera.backVideoRef.current : dualCamera.frontVideoRef.current)
      : (currentPipControls.pipConfig.isMainSwapped ? screenRecording.screenVideoRef.current : screenRecording.cameraVideoRef.current);

    if (!pipVideo || pipVideo.videoWidth === 0) return false;

    const pipRect = calculatePipRect(
      canvas.width,
      canvas.height,
      pipVideo.videoWidth,
      pipVideo.videoHeight,
      currentPipControls.pipConfig,
      () => {
        switch (currentPipControls.pipConfig.size) {
          case 'small': return 0.15;
          case 'medium': return 0.22;
          case 'large': return 0.30;
          default: return 0.22;
        }
      },
      () => 16
    );

    return (
      canvasX >= pipRect.pipX &&
      canvasX <= pipRect.pipX + pipRect.pipWidth &&
      canvasY >= pipRect.pipY &&
      canvasY <= pipRect.pipY + pipRect.pipHeight
    );
  };

  // Handle pointer events for PiP dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    // If drawing is enabled, let draw canvas handle
    if (drawOverlay.enabled) return;
    if (!hasPipControls || !containerRef.current) return;

    // Only start drag if pointer is inside pip
    if (!isPipHit(e.clientX, e.clientY)) return;

    // Capture pointer to continue receiving events even outside element
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    if (recordingMode === 'dual-cam') {
      dualCamera.handlePipDragStart(e, rect);
    } else {
      screenRecording.handlePipDragStart(e, rect);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drawOverlay.enabled) return;
    if (!hasPipControls || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (recordingMode === 'dual-cam') {
      dualCamera.handlePipDragMove(e, rect);
    } else {
      screenRecording.handlePipDragMove(e, rect);
    }
  };

  const handlePointerUp = () => {
    if (recordingMode === 'dual-cam') {
      dualCamera.handlePipDragEnd();
    } else {
      screenRecording.handlePipDragEnd();
    }
  };

  // Size cycle handler
  const cyclePipSize = () => {
    const sizes: PipSize[] = ['small', 'medium', 'large'];
    const currentIndex = sizes.indexOf(currentPipControls.pipConfig.size);
    const nextIndex = (currentIndex + 1) % sizes.length;
    if (recordingMode === 'dual-cam') {
      dualCamera.setPipSize(sizes[nextIndex]);
    } else {
      screenRecording.setPipSize(sizes[nextIndex]);
    }
  };

  // Shape cycle handler  
  const cyclePipShape = () => {
    const shapes: PipShape[] = ['rectangle', 'rounded', 'circle'];
    const currentIndex = shapes.indexOf(currentPipControls.pipConfig.shape);
    const nextIndex = (currentIndex + 1) % shapes.length;
    if (recordingMode === 'dual-cam') {
      dualCamera.setPipShape(shapes[nextIndex]);
    } else {
      screenRecording.setPipShape(shapes[nextIndex]);
    }
  };

  // Swap handler
  const handleSwap = () => {
    if (recordingMode === 'dual-cam') {
      dualCamera.swapCameras();
    } else {
      screenRecording.toggleSwap();
    }
  };

  const handleBrushPress = () => {
    if (!drawOverlay.enabled) {
      drawOverlay.setEnabled(true);
      drawOverlay.setPanelOpen(true);
      return;
    }
    drawOverlay.setPanelOpen(!drawOverlay.panelOpen);
  };

  const modeLabel = recordingMode === "dual-cam"
    ? t("golive.dual_camera")
    : recordingMode === "screen-cam"
      ? t("golive.screen_plus_me")
      : t("golive.standard");
  const recordingInstruction = recordingMode === "dual-cam"
    ? t("golive.dual_cam_instruction")
    : recordingMode === "screen-cam"
      ? t("golive.screen_cam_instruction")
      : t("golive.standard_instruction");

  const portalContent = (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="go-live-recorder__recording-backdrop"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <motion.section
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.16 }}
          className={`go-live-recorder__surface${recordingMode === "screen-cam" ? " go-live-recorder__surface--screen" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Camera recording"
        >
          <video ref={dualCamera.frontVideoRef} className="go-live-recorder__hidden-media" playsInline muted />
          <video ref={dualCamera.backVideoRef} className="go-live-recorder__hidden-media" playsInline muted />
          <canvas ref={dualCamera.canvasRef} className="go-live-recorder__hidden-media" />
          <video ref={screenRecording.screenVideoRef} className="go-live-recorder__hidden-media" playsInline muted />
          <video ref={screenRecording.cameraVideoRef} className="go-live-recorder__hidden-media" playsInline muted />
          <canvas ref={screenRecording.canvasRef} className="go-live-recorder__hidden-media" />

          <div className="go-live-recorder__preview">
            {!previewUrl ? (
              recordingMode === "standard" ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`go-live-recorder__media${facingMode === "user" ? " is-mirrored" : ""}`}
                />
              ) : recordingMode === "dual-cam" ? (
                <canvas
                  ref={dualCamera.canvasRef}
                  className="go-live-recorder__media go-live-recorder__canvas"
                  style={{ display: dualCamera.isActive ? "block" : "none" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
              ) : (
                <canvas
                  ref={screenRecording.canvasRef}
                  className="go-live-recorder__media go-live-recorder__canvas"
                  style={{ display: screenRecording.isActive ? "block" : "none" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
              )
            ) : (
              <video src={previewUrl} controls className="go-live-recorder__media go-live-recorder__media--preview" />
            )}

            {!previewUrl && (
              <canvas
                ref={drawOverlay.canvasRef}
                width={1920}
                height={1080}
                className={`go-live-recorder__draw-canvas${drawOverlay.enabled ? " is-enabled" : ""}`}
                style={{ touchAction: "none" }}
                onPointerDown={(event) => {
                  if (drawOverlay.panelOpen) drawOverlay.setPanelOpen(false);
                  drawOverlay.onPointerDown(event);
                }}
                onPointerMove={drawOverlay.onPointerMove}
                onPointerUp={drawOverlay.onPointerUp}
                onPointerCancel={drawOverlay.onPointerCancel}
              />
            )}

            {!isCameraOn && !previewUrl && recordingMode === "standard" && (
              <div className="go-live-recorder__camera-off">
                <VideoOff aria-hidden="true" />
                <p>{t("golive.camera_off")}</p>
              </div>
            )}

            <header className="go-live-recorder__header">
              <div className="go-live-recorder__profile">
                <Avatar className="go-live-recorder__avatar">
                  <AvatarImage src={userAvatar} />
                  <AvatarFallback>{userName?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <div>
                  <strong>{userName || t("common:app.you")}</strong>
                  <div className="go-live-recorder__profile-meta">
                    <span>{modeLabel}</span>
                    <button
                      type="button"
                      className={visibility === "public" ? "is-active" : undefined}
                      onClick={() => setVisibility("public")}
                      aria-label="Post publicly"
                      aria-pressed={visibility === "public"}
                      title="Public"
                    >
                      <Globe aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={visibility === "private" ? "is-active" : undefined}
                      onClick={() => setVisibility("private")}
                      aria-label="Post privately"
                      aria-pressed={visibility === "private"}
                      title="Private"
                    >
                      <Lock aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="go-live-recorder__header-actions">
                {isRecording && (
                  <span className="go-live-recorder__recording-status">
                    <i aria-hidden="true" /> REC {formatTime(recordingTime)}
                  </span>
                )}
                <button type="button" className="go-live-recorder__close" onClick={onClose} aria-label="Close camera recording" title="Close">
                  <X aria-hidden="true" />
                </button>
              </div>
            </header>

            {recordingMode === "screen-cam" && !previewUrl && (
              <div className="go-live-recorder__share-status">
                <span><Monitor aria-hidden="true" /></span>
                <span><strong>Screen share active</strong><small>Shared with JointVibe</small></span>
              </div>
            )}

            {!previewUrl && (
              <GoLiveSideRail
                hasPipControls={hasPipControls}
                pipSize={currentPipControls.pipConfig.size}
                pipShape={currentPipControls.pipConfig.shape}
                onSwap={handleSwap}
                onCycleSize={cyclePipSize}
                onCycleShape={cyclePipShape}
                drawEnabled={drawOverlay.enabled}
                drawPanelOpen={drawOverlay.panelOpen}
                onBrushPress={handleBrushPress}
              />
            )}

            <GoLiveDrawPanel
              open={drawOverlay.enabled && drawOverlay.panelOpen}
              onOpenChange={drawOverlay.setPanelOpen}
              onDisableDrawing={() => {
                drawOverlay.setEnabled(false);
                drawOverlay.setPanelOpen(false);
              }}
              colors={drawOverlay.colors}
              color={drawOverlay.color}
              onColor={drawOverlay.setColor}
              customColor={drawOverlay.customColor}
              onCustomColor={drawOverlay.setCustomColor}
              size={drawOverlay.size}
              onSize={drawOverlay.setSize}
              canUndo={drawOverlay.canUndo}
              canRedo={drawOverlay.canRedo}
              onUndo={drawOverlay.undo}
              onRedo={drawOverlay.redo}
              onClear={drawOverlay.clear}
            />

            {previewUrl && (
              <div className="go-live-recorder__description">
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("golive.add_description")}
                  className="go-live-recorder__description-input"
                  rows={2}
                  maxLength={280}
                />
              </div>
            )}

            <div className="go-live-recorder__controls">
              {!previewUrl ? (
                <>
                  <div className="go-live-recorder__control-row">
                    <button type="button" className="go-live-recorder__utility" onClick={toggleMic} aria-label="Toggle microphone" title="Toggle microphone">
                      {isMicOn ? <Mic aria-hidden="true" /> : <MicOff className="is-off" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className={`go-live-recorder__record${isRecording ? " is-recording" : ""}`}
                      onClick={isRecording ? stopRecording : startRecording}
                      aria-label={isRecording ? "Stop recording" : "Start recording"}
                    >
                      {isRecording ? <Square aria-hidden="true" /> : <Radio aria-hidden="true" />}
                    </button>
                    {recordingMode === "standard" && (
                      <button type="button" className="go-live-recorder__utility" onClick={toggleCamera} aria-label="Toggle camera" title="Toggle camera">
                        {isCameraOn ? <Video aria-hidden="true" /> : <VideoOff className="is-off" aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                  {recordingMode === "standard" && (
                    <button type="button" className="go-live-recorder__flip" onClick={switchCamera}>
                      <Camera aria-hidden="true" /> {t("golive.flip_camera")}
                    </button>
                  )}
                  {!isRecording && <p>{recordingInstruction}</p>}
                </>
              ) : (
                <div className="go-live-recorder__post-actions">
                  <button type="button" className="go-live-recorder__secondary-action" onClick={handleRecordAgain} disabled={isUploading}>
                    <RotateCcw aria-hidden="true" /> {t("golive.record_again")}
                  </button>
                  <button type="button" className="go-live-recorder__primary-action" onClick={handleUploadAndPost} disabled={isUploading}>
                    {isUploading ? <span className="go-live-recorder__spinner" aria-hidden="true" /> : <Video aria-hidden="true" />}
                    {isUploading ? "Uploading..." : t("golive.post_video")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(portalContent, document.body);
}
