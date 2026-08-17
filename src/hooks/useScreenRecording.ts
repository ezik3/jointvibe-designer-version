import { useState, useRef, useCallback, useEffect } from 'react';
import { usePipControls, calculatePipRect, drawPipOnCanvas } from './usePipControls';
import type { PipShape, PipSize } from './usePipControls';

export type { PipShape, PipSize };

interface ScreenRecordingState {
  isSupported: boolean;
  isActive: boolean;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  compositeStream: MediaStream | null;
}

interface UseScreenRecordingReturn extends ScreenRecordingState {
  startScreenRecording: () => Promise<boolean>;
  stopScreenRecording: () => void;
  // PiP controls
  pipConfig: ReturnType<typeof usePipControls>['config'];
  setPipSize: (size: PipSize) => void;
  setPipShape: (shape: PipShape) => void;
  toggleSwap: () => void;
  handlePipDragStart: (e: React.PointerEvent, containerRect: DOMRect) => void;
  handlePipDragMove: (e: React.PointerEvent, containerRect: DOMRect) => void;
  handlePipDragEnd: () => void;
  isDragging: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  screenVideoRef: React.RefObject<HTMLVideoElement>;
  cameraVideoRef: React.RefObject<HTMLVideoElement>;
}

/**
 * Hook for capturing screen + webcam simultaneously.
 * Uses Canvas to composite both into a single recordable stream.
 */
export const useScreenRecording = (): UseScreenRecordingReturn => {
  const [state, setState] = useState<ScreenRecordingState>({
    isSupported: typeof navigator !== 'undefined' && 'getDisplayMedia' in navigator.mediaDevices,
    isActive: false,
    screenStream: null,
    cameraStream: null,
    compositeStream: null,
  });

  const pipControls = usePipControls({
    position: { x: 85, y: 80 }, // Bottom-right default
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Redraw loop that responds to pip config changes
  const startDrawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const drawFrame = () => {
      if (!screenVideoRef.current || !cameraVideoRef.current) return;

      const mainVideo = pipControls.config.isMainSwapped ? cameraVideoRef.current : screenVideoRef.current;
      const pipVideo = pipControls.config.isMainSwapped ? screenVideoRef.current : cameraVideoRef.current;

      // Draw main video (full screen)
      ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height);

      // Calculate PiP rect using current config
      if (pipVideo.videoWidth && pipVideo.videoHeight) {
        const rect = calculatePipRect(
          canvas.width,
          canvas.height,
          pipVideo.videoWidth,
          pipVideo.videoHeight,
          pipControls.config,
          pipControls.getSizeMultiplier,
          pipControls.getBorderRadius
        );

        // Mirror webcam when it's the PiP (default state)
        const shouldMirror = !pipControls.config.isMainSwapped;
        drawPipOnCanvas(ctx, pipVideo, rect, shouldMirror);
      }

      animationFrameRef.current = requestAnimationFrame(drawFrame);
    };

    // Cancel any existing loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    drawFrame();
  }, [pipControls.config, pipControls.getSizeMultiplier, pipControls.getBorderRadius]);

  // Restart draw loop when pip config changes
  useEffect(() => {
    if (state.isActive) {
      startDrawLoop();
    }
  }, [state.isActive, pipControls.config, startDrawLoop]);

  const startScreenRecording = useCallback(async (): Promise<boolean> => {
    try {
      // Request screen capture first (requires user gesture)
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      // Request webcam
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: true,
      });

      // Attach streams to hidden video elements
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = screenStream;
        await screenVideoRef.current.play();
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = cameraStream;
        await cameraVideoRef.current.play();
      }

      // Wait for video metadata to load
      await new Promise<void>((resolve) => {
        const checkReady = () => {
          if (
            screenVideoRef.current?.videoWidth &&
            cameraVideoRef.current?.videoWidth
          ) {
            resolve();
          } else {
            requestAnimationFrame(checkReady);
          }
        };
        checkReady();
      });

      // Setup canvas for compositing
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('Canvas not available');
      }

      // Match screen dimensions
      const screenWidth = screenVideoRef.current?.videoWidth || 1920;
      const screenHeight = screenVideoRef.current?.videoHeight || 1080;
      canvas.width = screenWidth;
      canvas.height = screenHeight;

      // Capture composite stream from canvas
      const compositeStream = canvas.captureStream(30);

      // Mix audio from both sources
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      // Add microphone audio
      const micTrack = cameraStream.getAudioTracks()[0];
      if (micTrack) {
        const micSource = audioContext.createMediaStreamSource(
          new MediaStream([micTrack])
        );
        micSource.connect(destination);
      }

      // Add system audio if available
      const systemAudioTrack = screenStream.getAudioTracks()[0];
      if (systemAudioTrack) {
        const systemSource = audioContext.createMediaStreamSource(
          new MediaStream([systemAudioTrack])
        );
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5;
        systemSource.connect(gainNode);
        gainNode.connect(destination);
      }

      // Add mixed audio to composite stream
      destination.stream.getAudioTracks().forEach((track) => {
        compositeStream.addTrack(track);
      });

      // Handle screen share ending
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenRecording();
      };

      setState({
        isSupported: true,
        isActive: true,
        screenStream,
        cameraStream,
        compositeStream,
      });

      return true;
    } catch (error) {
      console.error('Failed to start screen recording:', error);
      return false;
    }
  }, []);

  const stopScreenRecording = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop all tracks
    state.screenStream?.getTracks().forEach((track) => track.stop());
    state.cameraStream?.getTracks().forEach((track) => track.stop());

    setState((prev) => ({
      ...prev,
      isActive: false,
      screenStream: null,
      cameraStream: null,
      compositeStream: null,
    }));
  }, [state.screenStream, state.cameraStream]);

  // Pointer event handlers for dragging
  const handlePipDragStart = useCallback((e: React.PointerEvent, containerRect: DOMRect) => {
    pipControls.startDrag(e.clientX, e.clientY, containerRect, e.pointerId);
  }, [pipControls]);

  const handlePipDragMove = useCallback((e: React.PointerEvent, containerRect: DOMRect) => {
    pipControls.updateDrag(e.clientX, e.clientY, containerRect, e.pointerId);
  }, [pipControls]);

  const handlePipDragEnd = useCallback(() => {
    pipControls.endDrag();
  }, [pipControls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      state.screenStream?.getTracks().forEach((track) => track.stop());
      state.cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    ...state,
    startScreenRecording,
    stopScreenRecording,
    pipConfig: pipControls.config,
    setPipSize: pipControls.setSize,
    setPipShape: pipControls.setShape,
    toggleSwap: pipControls.toggleSwap,
    handlePipDragStart,
    handlePipDragMove,
    handlePipDragEnd,
    isDragging: pipControls.isDragging,
    canvasRef,
    screenVideoRef,
    cameraVideoRef,
  };
};

/**
 * Check if screen recording is supported (desktop only)
 */
export const checkScreenRecordingSupport = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.mediaDevices === 'undefined') return false;

  // Screen capture not available on mobile browsers
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  if (isMobile) return false;

  // Check for getDisplayMedia support - on desktop browsers this should be true
  // Use a more permissive check that works in iframes
  try {
    return typeof navigator.mediaDevices.getDisplayMedia === 'function';
  } catch {
    // Fallback: assume supported on desktop browsers
    return true;
  }
};
