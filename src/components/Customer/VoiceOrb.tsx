import { motion } from "framer-motion";
import { Mic, Loader2 } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface VoiceOrbProps {
  isRecording: boolean;
  isTranscribing: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  volume: number; // 0-1
  transcript?: string;
  onTap: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function VoiceOrb({
  isRecording,
  isTranscribing,
  isThinking,
  isSpeaking,
  volume,
  onTap,
  disabled,
  size = 'medium',
}: VoiceOrbProps) {
  const { t } = useTranslation('common');
  // Determine state for styling
  const isActive = isRecording || isTranscribing || isThinking || isSpeaking;
  const isProcessing = isTranscribing || isThinking;
  
  // Scale based on volume when recording
  const volumeScale = isRecording ? 1 + volume * 0.1 : 1;
  
  // Size configurations - smaller overall
  const sizeConfig = {
    // Halved footprint vs previous implementation
    small: { container: 56, core: 20, icon: 'h-3.5 w-3.5', rings: [0.86, 0.72, 0.6] },
    medium: { container: 72, core: 26, icon: 'h-4 w-4', rings: [0.86, 0.72, 0.6] },
    large: { container: 120, core: 44, icon: 'h-6 w-6', rings: [0.84, 0.70, 0.58] },
  };
  
  const config = sizeConfig[size];
  const containerSize = config.container;
  const coreSize = config.core;
  const iconSize = config.icon;
  const ringScales = config.rings;

  // Dynamic glow color based on state
  const getGlowColor = () => {
    if (isRecording) return "rgba(239, 68, 68, 0.6)"; // red
    if (isProcessing) return "rgba(245, 158, 11, 0.6)"; // amber
    if (isSpeaking) return "rgba(34, 197, 94, 0.6)"; // green
    return "rgba(67, 229, 255, 0.6)"; // cyan
  };

  const getCoreGradient = () => {
    if (isRecording) return "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(239, 68, 68, 1) 15%, rgba(185, 28, 28, 1) 40%, rgba(127, 29, 29, 0.9) 70%, transparent 100%)";
    if (isProcessing) return "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(245, 158, 11, 1) 15%, rgba(180, 83, 9, 1) 40%, rgba(120, 53, 15, 0.9) 70%, transparent 100%)";
    if (isSpeaking) return "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(34, 197, 94, 1) 15%, rgba(22, 163, 74, 1) 40%, rgba(21, 128, 61, 0.9) 70%, transparent 100%)";
    return "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(67, 229, 255, 1) 15%, rgba(42, 164, 204, 1) 40%, rgba(30, 120, 150, 0.9) 70%, transparent 100%)";
  };

  const getRingColor = () => {
    if (isRecording) return "rgba(239, 68, 68,";
    if (isProcessing) return "rgba(245, 158, 11,";
    if (isSpeaking) return "rgba(34, 197, 94,";
    return "rgba(67, 229, 255,";
  };

  const ringColor = getRingColor();

  return (
    <div className="flex flex-col items-center">
      {/* The Orb Container */}
      <motion.button
        onClick={onTap}
        disabled={disabled || isProcessing || isSpeaking}
        className="relative flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
        style={{ width: containerSize, height: containerSize }}
        animate={{ scale: volumeScale }}
        transition={{ scale: { type: "spring", stiffness: 300, damping: 20 } }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Outer glow halo */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: containerSize * 0.9,
            height: containerSize * 0.9,
            background: `radial-gradient(circle at center, ${getGlowColor()} 0%, ${getGlowColor().replace('0.6', '0.3')} 40%, transparent 70%)`,
            filter: 'blur(16px)',
          }}
          animate={{
            opacity: [0.5, 0.8, 0.5],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Energy waves - expanding rings (reduced to 2) */}
        {isActive && (
          <>
            {[0, 1].map((i) => (
              <motion.div
                key={`wave-${i}`}
                className="absolute rounded-full"
                style={{
                  width: coreSize,
                  height: coreSize,
                  border: `2px solid ${ringColor} 0.5)`,
                }}
                animate={{
                  width: [coreSize, containerSize * 0.95],
                  height: [coreSize, containerSize * 0.95],
                  opacity: [0.6, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: i * 1,
                }}
              />
            ))}
          </>
        )}

        {/* Spinning Rings */}
        {ringScales.map((scale, i) => {
          const ringSize = containerSize * scale;
          const isClockwise = i % 2 === 0;
          const duration = 4 + i * 1.2;
          const opacities = [0.9, 0.7, 0.6, 0.5, 0.6];
          
          return (
            <motion.div
              key={`ring-${i}`}
              className="absolute rounded-full"
              style={{
                width: ringSize,
                height: ringSize,
                borderTop: `${i === 0 ? 3 : 2}px solid ${ringColor} ${opacities[i]})`,
                borderRight: `${i === 0 ? 3 : 2}px solid ${ringColor} ${opacities[i] * 0.6})`,
                borderBottom: `1px solid ${ringColor} ${opacities[i] * 0.3})`,
                borderLeft: `1px solid transparent`,
                boxShadow: `0 0 ${15 + i * 5}px ${ringColor} ${opacities[i] * 0.5}), inset 0 0 ${10 + i * 3}px ${ringColor} 0.15)`,
              }}
              animate={{
                rotate: isClockwise ? 360 : -360,
              }}
              transition={{
                duration,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          );
        })}

        {/* Orbiting particles (reduced to 2) */}
        {[0, 1].map((i) => {
          const orbitRadius = containerSize * 0.35;
          const duration = 3 + i * 0.8;
          const particleSize = size === 'small' ? 3 : size === 'medium' ? 4 : 5;
          
          return (
            <motion.div
              key={`particle-${i}`}
              className="absolute rounded-full"
              style={{
                width: particleSize,
                height: particleSize,
                background: isRecording ? '#ef4444' : isProcessing ? '#f59e0b' : isSpeaking ? '#22c55e' : '#43e5ff',
                boxShadow: `0 0 8px ${isRecording ? '#ef4444' : isProcessing ? '#f59e0b' : isSpeaking ? '#22c55e' : '#43e5ff'}`,
              }}
              animate={{
                rotate: i % 2 === 0 ? 360 : -360,
                x: [0, orbitRadius, 0, -orbitRadius, 0],
                y: [-orbitRadius, 0, orbitRadius, 0, -orbitRadius],
              }}
              transition={{
                duration,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.6,
              }}
            />
          );
        })}

        {/* Central core orb */}
        <motion.div
          className="absolute rounded-full flex items-center justify-center z-10"
          style={{
            width: coreSize,
            height: coreSize,
            background: getCoreGradient(),
            boxShadow: `
              0 0 30px 15px ${getGlowColor()},
              0 0 60px 30px ${getGlowColor().replace('0.6', '0.35')},
              0 0 90px 45px ${getGlowColor().replace('0.6', '0.2')},
              inset 0 0 20px rgba(255, 255, 255, 0.3),
              inset -3px -3px 15px rgba(0, 30, 50, 0.5)
            `,
          }}
          animate={{
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Icon */}
          <div className="text-white z-10">
            {isProcessing ? (
              <Loader2 className={`${iconSize} animate-spin`} />
            ) : (
              <Mic className={iconSize} />
            )}
          </div>
        </motion.div>
      </motion.button>
    </div>
  );
}
