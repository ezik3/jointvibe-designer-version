import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, RotateCcw, Check, SwitchCamera } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
  onSkip?: () => void;
  title?: string;
  instruction?: string;
  facingMode?: 'user' | 'environment';
  overlay?: 'face' | 'document' | 'none';
  presentation?: 'default' | 'venue-onboarding';
}

export default function CameraCapture({
  onCapture,
  onClose,
  onSkip,
  title = 'Take Photo',
  instruction = 'Position yourself in the frame',
  facingMode: initialFacingMode = 'user',
  overlay = 'none',
  presentation = 'default',
}: CameraCaptureProps) {
  const { t } = useTranslation('common');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(initialFacingMode);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setCameraUnavailable(false);
    try {
      stopCamera();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsLoading(false);
        };
      }

      // Check for multiple cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    } catch (error) {
      console.error('Camera error:', error);
      setCameraUnavailable(true);
      if (presentation === 'default') {
        toast.error('Could not access camera. Please check permissions.');
      }
      setIsLoading(false);
    }
  }, [facingMode, presentation, stopCamera]);

  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get the image data as base64
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    if (presentation === 'venue-onboarding') {
      stopCamera();
      onCapture(imageData);
      return;
    }

    setCapturedImage(imageData);
  }, [onCapture, presentation, stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
  }, []);

  const confirmPhoto = useCallback(() => {
    if (capturedImage) {
      stopCamera();
      onCapture(capturedImage);
    }
  }, [capturedImage, onCapture, stopCamera]);

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setCapturedImage(null);
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  const handleSkip = useCallback(() => {
    stopCamera();
    if (onSkip) {
      onSkip();
      return;
    }
    onClose();
  }, [onClose, onSkip, stopCamera]);

  if (presentation === 'venue-onboarding') {
    return (
      <section className="venue-onboarding-camera" aria-labelledby="venue-onboarding-camera-title">
        <header className="venue-onboarding-camera__top">
          <strong id="venue-onboarding-camera-title">Face verification</strong>
          <span>{cameraUnavailable ? 'Camera unavailable' : isLoading ? 'Starting camera...' : 'Camera ready'}</span>
        </header>

        <div className={`venue-onboarding-camera__preview${cameraUnavailable ? ' is-unavailable' : ''}${capturedImage ? ' is-captured' : ''}`}>
          {!capturedImage && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={facingMode === 'user' ? 'is-mirrored' : undefined}
            />
          )}
          {capturedImage && <img src={capturedImage} alt="Captured face" className={facingMode === 'user' ? 'is-mirrored' : undefined} />}

          {!capturedImage && !cameraUnavailable && !isLoading && overlay === 'face' && (
            <div className="venue-onboarding-camera__overlay" aria-hidden="true"><span /></div>
          )}
          {isLoading && !cameraUnavailable && <div className="venue-onboarding-camera__loading" aria-label="Starting camera"><span /></div>}
          {cameraUnavailable && (
            <div className="venue-onboarding-camera__unavailable" role="status">
              <Camera aria-hidden="true" />
              <strong>Camera access is unavailable</strong>
              <span>Allow camera access to continue with face verification, or skip this step for now.</span>
            </div>
          )}
        </div>

        <footer className="venue-onboarding-camera__controls">
          <p>{cameraUnavailable ? 'You can complete face verification later from venue settings.' : instruction}</p>
          {!cameraUnavailable && (
            <button className="venue-onboarding-camera__shutter" type="button" onClick={capturePhoto} disabled={isLoading} aria-label="Capture face photo">
              <span aria-hidden="true" />
            </button>
          )}
          <button className="venue-onboarding-text-button" type="button" onClick={handleSkip}>Skip for now</button>
        </footer>
        <canvas ref={canvasRef} className="hidden" />
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white hover:bg-white/20"
        >
          <X className="w-6 h-6" />
        </Button>
        <h2 className="text-white font-semibold">{title}</h2>
        {hasMultipleCameras && !capturedImage && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCamera}
            className="text-white hover:bg-white/20"
          >
            <SwitchCamera className="w-6 h-6" />
          </Button>
        )}
        {!hasMultipleCameras && <div className="w-10" />}
      </div>

      {/* Camera View / Captured Image */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {!capturedImage ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />
            
            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {/* Face overlay guide */}
            {overlay === 'face' && !isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-64 h-80">
                  {/* Oval face guide */}
                  <div className="absolute inset-0 border-4 border-white/50 rounded-[50%]" />
                  {/* Corner markers */}
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-cyan" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-cyan" />
                  <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-1 h-12 bg-cyan" />
                  <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-1 h-12 bg-cyan" />
                </div>
              </div>
            )}

            {/* Document overlay guide */}
            {overlay === 'document' && !isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-80 h-52 border-4 border-dashed border-white/50 rounded-lg">
                  {/* Corner markers */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-cyan rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-cyan rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-cyan rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-cyan rounded-br-lg" />
                </div>
              </div>
            )}
          </>
        ) : (
          <img
            src={capturedImage}
            alt="Captured"
            className={`absolute inset-0 w-full h-full object-cover ${
              facingMode === 'user' ? 'scale-x-[-1]' : ''
            }`}
          />
        )}
      </div>

      {/* Instruction */}
      <div className="absolute bottom-32 left-0 right-0 text-center px-4">
        <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-full inline-block">
          {capturedImage ? 'Review your photo' : instruction}
        </p>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8 px-4">
        {!capturedImage ? (
          <Button
            size="lg"
            onClick={capturePhoto}
            disabled={isLoading}
            className="w-20 h-20 rounded-full bg-white hover:bg-white/90 p-0"
          >
            <Camera className="w-10 h-10 text-black" />
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              variant="outline"
              onClick={retakePhoto}
              className="w-16 h-16 rounded-full border-white text-white hover:bg-white/20"
            >
              <RotateCcw className="w-8 h-8" />
            </Button>
            <Button
              size="lg"
              onClick={confirmPhoto}
              className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 p-0"
            >
              <Check className="w-10 h-10 text-white" />
            </Button>
          </>
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
