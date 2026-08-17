import { useCallback, useEffect, useRef, useState } from "react";

type UseSingleCameraCanvasState = {
  isActive: boolean;
  rawStream: MediaStream | null;
  compositeStream: MediaStream | null;
};

type Options = {
  overlayCanvasRef?: React.RefObject<HTMLCanvasElement>;
};

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasW: number,
  canvasH: number
) {
  const vw = video.videoWidth || canvasW;
  const vh = video.videoHeight || canvasH;
  const videoAR = vw / vh;
  const canvasAR = canvasW / canvasH;

  let dw = canvasW;
  let dh = canvasH;
  let dx = 0;
  let dy = 0;

  if (videoAR > canvasAR) {
    // wider video; scale by height
    dh = canvasH;
    dw = dh * videoAR;
    dx = (canvasW - dw) / 2;
  } else {
    // taller video; scale by width
    dw = canvasW;
    dh = dw / videoAR;
    dy = (canvasH - dh) / 2;
  }

  ctx.drawImage(video, dx, dy, dw, dh);
}

export function useSingleCameraCanvas(options?: Options) {
  const [state, setState] = useState<UseSingleCameraCanvasState>({
    isActive: false,
    rawStream: null,
    compositeStream: null,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    state.rawStream?.getTracks().forEach((t) => t.stop());

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setState({ isActive: false, rawStream: null, compositeStream: null });
  }, [state.rawStream]);

  const start = useCallback(
    async (facingMode: "user" | "environment") => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: true,
        });

        if (!videoRef.current) throw new Error("video element missing");
        if (!canvasRef.current) throw new Error("canvas missing");

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // Match camera resolution
        const vw = videoRef.current.videoWidth || 720;
        const vh = videoRef.current.videoHeight || 1280;
        canvasRef.current.width = vw;
        canvasRef.current.height = vh;

        const composite = canvasRef.current.captureStream(30);
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) composite.addTrack(audioTrack);

        setState({ isActive: true, rawStream: stream, compositeStream: composite });

        const drawLoop = () => {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (!canvas || !video) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Mirror selfie
          if (facingMode === "user") {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }

          drawCover(ctx, video, canvas.width, canvas.height);
          ctx.restore();

          const overlay = options?.overlayCanvasRef?.current;
          if (overlay) {
            ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
          }

          rafRef.current = requestAnimationFrame(drawLoop);
        };

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        drawLoop();

        return true;
      } catch (e) {
        console.error("Failed to start camera canvas", e);
        stop();
        return false;
      }
    },
    [options?.overlayCanvasRef, stop]
  );

  // Cleanup
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    ...state,
    start,
    stop,
    videoRef,
    canvasRef,
  };
}
