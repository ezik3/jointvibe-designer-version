import { useRef, useEffect } from "react";
import { Play } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface MediaFrameProps {
  imageUrl?: string;
  videoUrl?: string;
  alt?: string;
  aspectRatio?: string;
  className?: string;
  showPlayButton?: boolean;
  autoPlay?: boolean;
}

/**
 * Standardized 9:16 media renderer.
 * - Vertical content: object-cover fills frame
 * - Non-vertical content: blurred background + centered object-contain
 * - Videos: autoPlay, muted, loop, playsInline by default
 */
const MediaFrame = ({
  imageUrl,
  videoUrl,
  alt = "Post media",
  aspectRatio = "9/16",
  className = "",
  showPlayButton = false,
  autoPlay = true,
}: MediaFrameProps) => {
  const { t } = useTranslation('feed');
  const mediaUrl = videoUrl || imageUrl;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (autoPlay) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [videoUrl, autoPlay]);

  if (!mediaUrl) return null;

  return (
    <div
      className={`relative overflow-hidden bg-black ${className}`}
      style={{ aspectRatio }}
    >
      {/* Blurred background fill for non-vertical media */}
      {imageUrl && !videoUrl && (
        <div
          className="absolute inset-0 scale-110 blur-2xl opacity-40"
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {videoUrl && (
        <div className="absolute inset-0 scale-110 blur-2xl opacity-40 bg-black" />
      )}

      {/* Foreground media — centered, no stretch, no clip */}
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay={autoPlay}
          muted
          loop
          playsInline
          preload="metadata"
          className="relative z-10 h-full w-full object-contain"
        />
      ) : (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          className="relative z-10 h-full w-full object-contain"
        />
      )}

      {/* Optional play button overlay */}
      {showPlayButton && videoUrl && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            <Play className="w-6 h-6 text-white fill-white ml-1" />
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaFrame;
