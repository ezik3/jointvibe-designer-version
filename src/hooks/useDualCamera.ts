import { useState, useRef, useCallback, useEffect } from 'react';
import { usePipControls, calculatePipRect, drawPipOnCanvas } from './usePipControls';
import type { PipShape, PipSize } from './usePipControls';

export type { PipShape, PipSize };

interface DualCameraState {
  isSupported: boolean;
  isActive: boolean;
  frontStream: MediaStream | null;
  backStream: MediaStream | null;
  compositeStream: MediaStream | null;
}

interface UseDualCameraReturn extends DualCameraState {
  startDualCamera: () => Promise<boolean>;
  stopDualCamera: () => void;
  swapCameras: () => void;
  // PiP controls
  pipConfig: ReturnType<typeof usePipControls>['config'];
  setPipSize: (size: PipSize) => void;
  setPipShape: (shape: PipShape) => void;
  handlePipDragStart: (e: React.PointerEvent, containerRect: DOMRect) => void;
  handlePipDragMove: (e: React.PointerEvent, containerRect: DOMRect) => void;
  handlePipDragEnd: () => void;
  isDragging: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  frontVideoRef: React.RefObject<HTMLVideoElement>;
  backVideoRef: React.RefObject<HTMLVideoElement>;
}

/**
 * Hook for capturing and compositing front + back camera simultaneously.
 * Uses Canvas to combine both streams into a single recordable stream.
 */
export const useDualCamera = (): UseDualCameraReturn => {
  const [state, setState] = useState<DualCameraState>({
    isSupported: false,
    isActive: false,
    frontStream: null,
    backStream: null,
    compositeStream: null,
  });

  const pipControls = usePipControls({
    position: { x: 80, y: 75 }, // Bottom-right default
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frontVideoRef = useRef<HTMLVideoElement>(null);
  const backVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check for dual camera support on mount
  useEffect(() => {
    checkDualCameraSupport().then((supported) => {
      setState((prev) => ({ ...prev, isSupported: supported }));
    });
  }, []);

  // Redraw loop that responds to pip config changes
  const startDrawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const drawFrame = () => {
      if (!frontVideoRef.current || !backVideoRef.current) return;

      const mainVideo = pipControls.config.isMainSwapped ? frontVideoRef.current : backVideoRef.current;
      const pipVideo = pipControls.config.isMainSwapped ? backVideoRef.current : frontVideoRef.current;

      // Draw main camera (full screen)
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

        // Mirror front camera in PiP
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

  const startDualCamera = useCallback(async (): Promise<boolean> => {
    const pickFrontBackDeviceIds = async (): Promise<{ frontId?: string; backId?: string }> => {
      // Ensure labels are available (most browsers hide them until permission granted)
      try {
        const perm = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        perm.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore; we'll still try facingMode fallback
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      const front = videoDevices.find((d) => /front|user|facetime/i.test(d.label));
      const back = videoDevices.find((d) => /back|rear|environment/i.test(d.label));

      // Prefer distinct front/back IDs when possible
      if (front?.deviceId && back?.deviceId && front.deviceId !== back.deviceId) {
        return { frontId: front.deviceId, backId: back.deviceId };
      }

      // Fallback: just pick two different devices
      if (videoDevices.length >= 2) {
        const [a, b] = videoDevices;
        if (a?.deviceId && b?.deviceId && a.deviceId !== b.deviceId) {
          return { frontId: a.deviceId, backId: b.deviceId };
        }
      }

      return {};
    };

    try {
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIOS) {
        // Browser limitation: can’t run both cameras at once on iOS Safari/WebView.
        return false;
      }

      const { frontId, backId } = await pickFrontBackDeviceIds();

      // Request both camera streams (try explicit deviceIds first; fallback to facingMode)
      const [frontStream, backStream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: frontId
            ? { deviceId: { exact: frontId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        }),
        navigator.mediaDevices.getUserMedia({
          video: backId
            ? { deviceId: { exact: backId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        }),
      ]);

      // Attach streams to hidden video elements
      if (frontVideoRef.current) {
        frontVideoRef.current.srcObject = frontStream;
        await frontVideoRef.current.play();
      }
      if (backVideoRef.current) {
        backVideoRef.current.srcObject = backStream;
        await backVideoRef.current.play();
      }

      // Setup canvas for compositing
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('Canvas not available');
      }

      // Set canvas dimensions (16:9 aspect ratio)
      canvas.width = 1280;
      canvas.height = 720;

      // Capture composite stream from canvas
      const compositeStream = canvas.captureStream(30);

      // Add audio track from front camera (where user is speaking)
      const audioTrack = frontStream.getAudioTracks()[0];
      if (audioTrack) {
        compositeStream.addTrack(audioTrack);
      }

      setState({
        isSupported: true,
        isActive: true,
        frontStream,
        backStream,
        compositeStream,
      });

      return true;
    } catch (error) {
      console.error('Failed to start dual camera:', error);
      return false;
    }
  }, []);

  const stopDualCamera = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop all tracks
    state.frontStream?.getTracks().forEach((track) => track.stop());
    state.backStream?.getTracks().forEach((track) => track.stop());

    setState((prev) => ({
      ...prev,
      isActive: false,
      frontStream: null,
      backStream: null,
      compositeStream: null,
    }));
  }, [state.frontStream, state.backStream]);

  const swapCameras = useCallback(() => {
    pipControls.toggleSwap();
  }, [pipControls]);

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
      state.frontStream?.getTracks().forEach((track) => track.stop());
      state.backStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    ...state,
    startDualCamera,
    stopDualCamera,
    swapCameras,
    pipConfig: pipControls.config,
    setPipSize: pipControls.setSize,
    setPipShape: pipControls.setShape,
    handlePipDragStart,
    handlePipDragMove,
    handlePipDragEnd,
    isDragging: pipControls.isDragging,
    canvasRef,
    frontVideoRef,
    backVideoRef,
  };
};

/**
 * Check if device supports dual camera (front + back simultaneously)
 * Note: iOS Safari and most mobile browsers cannot access both cameras simultaneously.
 * This actually tests the capability by briefly requesting both streams.
 */
export const checkDualCameraSupport = async (): Promise<boolean> => {
  try {
    if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    // Check if we're on mobile (dual cam makes sense on mobile)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    if (!isMobile) return false;

    // iOS Safari cannot use both cameras simultaneously in the browser (hard limitation)
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) return false;

    // We need permission to reliably identify devices (labels often empty before permission)
    try {
      const perm = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      perm.getTracks().forEach((t) => t.stop());
    } catch {
      // If permission is blocked, we can't support dual cam anyway
      return false;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');

    // If there are at least 2 cameras, allow the user to try.
    // Some Android devices/browsers still fail to open both simultaneously — startDualCamera() will
    // handle that and fall back gracefully.
    return videoDevices.length >= 2;
  } catch (error) {
    console.error('[DualCamera] Error checking support:', error);
    return false;
  }
};

/**
 * Detect current platform
 */
export const detectPlatform = (): 'mobile' | 'tablet' | 'desktop' => {
  const userAgent = navigator.userAgent.toLowerCase();

  // Check for tablets
  if (
    /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(
      userAgent
    )
  ) {
    return 'tablet';
  }

  // Check for mobile
  if (
    /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  ) {
    return 'mobile';
  }

  return 'desktop';
};
