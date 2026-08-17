import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, QrCode, X, Link as LinkIcon, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import jsQR from "jsqr";
import { useTranslation } from 'react-i18next';

interface QRScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type BarcodeDetectorLike = {
  detect: (image: HTMLVideoElement | ImageBitmap | Blob) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BarcodeDetector: any;
}

function extractPayToken(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  // If it's a full URL with /app/pay/:token
  const pathMatch = value.match(/\/app\/pay\/([a-zA-Z0-9_-]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  // If it's a URL with qr_token query param
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      const qp = url.searchParams.get("qr_token");
      if (qp) return qp;
    }
  } catch {
    // ignore
  }

  // If it's a bare token
  if (/^[a-zA-Z0-9-]{32,120}$/.test(value)) return value;

  return null;
}

export function QRScannerModal({ open, onOpenChange }: QRScannerModalProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const useFallbackRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
    setInitializing(false);
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Stop camera when modal closes
  useEffect(() => {
    if (!open) {
      stopCamera();
    }
  }, [open, stopCamera]);

  const handleDetectedValue = useCallback(
    (rawValue: string) => {
      const token = extractPayToken(rawValue);
      if (!token) {
        toast.error(t('qr.invalid_qr'), { description: t('qr.invalid_qr_hint') });
        return;
      }

      stopCamera();
      onOpenChange(false);
      navigate(`/app/pay/${token}`);
    },
    [navigate, onOpenChange, stopCamera]
  );

  // Fallback scanning using jsQR (works on Safari/iOS)
  const scanWithJsQR = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || !streamRef.current) {
      rafRef.current = requestAnimationFrame(scanWithJsQR);
      return;
    }

    // Wait until video has data
    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanWithJsQR);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scanWithJsQR);
      return;
    }

    // Set canvas size to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data and scan
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code?.data) {
        handleDetectedValue(code.data);
        return;
      }
    } catch (e) {
      console.warn("jsQR scan error:", e);
    }

    rafRef.current = requestAnimationFrame(scanWithJsQR);
  }, [handleDetectedValue]);

  // Native BarcodeDetector scanning
  const scanWithBarcodeDetector = useCallback(async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;

    if (!detector || !video || !streamRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        void scanWithBarcodeDetector();
      });
      return;
    }

    // Wait until the video has enough data
    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => {
        void scanWithBarcodeDetector();
      });
      return;
    }

    try {
      const codes = await detector.detect(video);
      const raw = codes?.[0]?.rawValue;
      if (raw) {
        handleDetectedValue(raw);
        return;
      }
    } catch (e) {
      console.warn("BarcodeDetector failed:", e);
      // Fall back to jsQR if native detection fails
      useFallbackRef.current = true;
      rafRef.current = requestAnimationFrame(scanWithJsQR);
      return;
    }

    rafRef.current = requestAnimationFrame(() => {
      void scanWithBarcodeDetector();
    });
  }, [handleDetectedValue, scanWithJsQR]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setInitializing(true);

      // Check if BarcodeDetector is available (Chrome, Edge, Opera)
      if (typeof BarcodeDetector !== "undefined") {
        try {
          detectorRef.current = new BarcodeDetector({ formats: ["qr_code"] });
          useFallbackRef.current = false;
        } catch {
          useFallbackRef.current = true;
        }
      } else {
        // Safari/iOS doesn't support BarcodeDetector - use jsQR fallback
        useFallbackRef.current = true;
      }

      // Request camera with various fallback options for iOS compatibility
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
          },
          audio: false,
        });
      } catch {
        // Fallback to basic video constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      // Set video source BEFORE setting scanning state
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready with loadedmetadata event
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error("Video element not available"));
            return;
          }
          
          const handleLoaded = () => {
            video.removeEventListener("loadedmetadata", handleLoaded);
            video.removeEventListener("error", handleError);
            resolve();
          };
          
          const handleError = () => {
            video.removeEventListener("loadedmetadata", handleLoaded);
            video.removeEventListener("error", handleError);
            reject(new Error("Video failed to load"));
          };
          
          // If already has metadata, resolve immediately
          if (video.readyState >= 1) {
            resolve();
            return;
          }
          
          video.addEventListener("loadedmetadata", handleLoaded);
          video.addEventListener("error", handleError);
          
          // Timeout fallback
          setTimeout(() => {
            video.removeEventListener("loadedmetadata", handleLoaded);
            video.removeEventListener("error", handleError);
            resolve(); // Continue anyway
          }, 3000);
        });

        // Explicitly play the video (required for iOS)
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.warn("Video play error:", playError);
        }

        // Try to enable continuous focus on supported browsers
        const track = stream.getVideoTracks()[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyTrack = track as any;
        if (anyTrack?.applyConstraints) {
          try {
            await anyTrack.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
          } catch {
            // ignore - not all devices support this
          }
        }
      }

      setScanning(true);
      setInitializing(false);

      // Begin detection loop with appropriate method
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      
      // Small delay to ensure video is actually rendering
      await new Promise(resolve => setTimeout(resolve, 200));
      
      if (useFallbackRef.current) {
        rafRef.current = requestAnimationFrame(scanWithJsQR);
      } else {
        rafRef.current = requestAnimationFrame(() => {
          void scanWithBarcodeDetector();
        });
      }
    } catch (error) {
      console.error("Camera error:", error);
      setInitializing(false);
      setCameraError(t('qr.camera_denied'));
      stopCamera();
    }
  };

  const handleTapToFocus = () => {
    // Restart camera to trigger refocus
    stopCamera();
    void startCamera();
  };

  const handleManualSubmit = () => {
    const token = extractPayToken(manualCode);
    if (!token) {
      toast.error(t('qr.invalid_link'));
      return;
    }

    onOpenChange(false);
    navigate(`/app/pay/${token}`);
  };

  const handleClose = () => {
    stopCamera();
    setManualCode("");
    setCameraError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="customer-dialog-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {t('qr.scan_payment')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hidden canvas for jsQR processing */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Camera Section */}
          {scanning || initializing ? (
            <div className="relative">
              <div
                className="block w-full cursor-pointer"
                onClick={handleTapToFocus}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  webkit-playsinline="true"
                  className="aspect-square w-full rounded-[8px] bg-black object-cover"
                  style={{ minHeight: '280px' }}
                  onLoadedMetadata={() => {
                    // Ensure video plays on iOS
                    videoRef.current?.play().catch(() => null);
                  }}
                />
              </div>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-48 w-48 animate-pulse rounded-[8px] border-2 border-primary" />
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={stopCamera}
              >
                <X className="h-4 w-4" />
              </Button>

              <p className="text-xs text-center text-muted-foreground mt-2">
                {initializing ? t('qr.starting_camera') : t('qr.tap_refocus')}
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              {cameraError ? (
                <div className="text-sm text-destructive mb-4">{cameraError}</div>
              ) : (
                <>
                  <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Camera className="h-10 w-10 text-primary" />
                  </div>
                  <Button onClick={startCamera} className="mb-4" disabled={initializing}>
                    {initializing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('qr.starting_camera_short')}
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4 mr-2" />
                        {t('qr.open_camera')}
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-muted-foreground">{t('qr.scan_hint')}</p>
                </>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{t('qr.or_manual')}</span>
            </div>
          </div>

          {/* Manual Entry */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('qr.paste_link')}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="customer-modal-field pl-10"
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              />
            </div>
            <Button onClick={handleManualSubmit} disabled={!manualCode.trim()}>
              {t('qr.go')}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            {t('qr.scan_failed_help')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
