import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface FistBumpAnimationProps {
  show: boolean;
  onComplete: () => void;
}

interface ConfettiParticle {
  id: number;
  top: string;
  tx: number;
  ty: number;
  rotate: number;
  emoji: string;
  delay: number;
}

const ANIMATION_DURATION = 1800; // Total animation duration in ms

const FistBumpAnimation: React.FC<FistBumpAnimationProps> = ({ show, onComplete }) => {
  const { t } = useTranslation('feed');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [phase, setPhase] = useState<'idle' | 'approach' | 'impact' | 'explode'>('idle');
  const [screenShake, setScreenShake] = useState(false);

  // Left confetti particles
  const leftConfetti: ConfettiParticle[] = [
    { id: 1, top: '45%', tx: -30, ty: 80, rotate: 180, emoji: '🎊', delay: 0 },
    { id: 2, top: '47%', tx: -20, ty: 100, rotate: -145, emoji: '🎉', delay: 0.02 },
    { id: 3, top: '50%', tx: -40, ty: 90, rotate: 220, emoji: '🎊', delay: 0.04 },
    { id: 4, top: '52%', tx: -15, ty: 110, rotate: -90, emoji: '🎉', delay: 0.06 },
    { id: 5, top: '48%', tx: -35, ty: 85, rotate: 160, emoji: '🎊', delay: 0.08 },
    { id: 6, top: '54%', tx: -25, ty: 105, rotate: -120, emoji: '🎉', delay: 0.1 },
    { id: 7, top: '46%', tx: -45, ty: 95, rotate: 200, emoji: '🎊', delay: 0.12 },
    { id: 8, top: '51%', tx: -10, ty: 115, rotate: -170, emoji: '🎉', delay: 0.14 }
  ];

  // Right confetti particles
  const rightConfetti: ConfettiParticle[] = [
    { id: 1, top: '45%', tx: 30, ty: 80, rotate: -180, emoji: '🎊', delay: 0 },
    { id: 2, top: '47%', tx: 20, ty: 100, rotate: 145, emoji: '🎉', delay: 0.02 },
    { id: 3, top: '50%', tx: 40, ty: 90, rotate: -220, emoji: '🎊', delay: 0.04 },
    { id: 4, top: '52%', tx: 15, ty: 110, rotate: 90, emoji: '🎉', delay: 0.06 },
    { id: 5, top: '48%', tx: 35, ty: 85, rotate: -160, emoji: '🎊', delay: 0.08 },
    { id: 6, top: '54%', tx: 25, ty: 105, rotate: 120, emoji: '🎉', delay: 0.1 },
    { id: 7, top: '46%', tx: 45, ty: 95, rotate: -200, emoji: '🎊', delay: 0.12 },
    { id: 8, top: '51%', tx: 10, ty: 115, rotate: 170, emoji: '🎉', delay: 0.14 }
  ];

  useEffect(() => {
    if (!show) {
      setPhase('idle');
      return;
    }

    // Initialize audio
    audioRef.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-hard-punch-2275.mp3');

    // Start approach phase
    setPhase('approach');

    // Impact phase at ~400ms
    const impactTimer = setTimeout(() => {
      setPhase('impact');
      setScreenShake(true);
      
      // Play sound at impact
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.log("Audio blocked by browser"));
      }
      
      // Stop shake after brief moment
      setTimeout(() => setScreenShake(false), 150);
    }, 400);

    // Explode phase at ~600ms
    const explodeTimer = setTimeout(() => {
      setPhase('explode');
    }, 600);

    // Complete animation
    const completeTimer = setTimeout(() => {
      onComplete();
      setPhase('idle');
    }, ANIMATION_DURATION);

    return () => {
      clearTimeout(impactTimer);
      clearTimeout(explodeTimer);
      clearTimeout(completeTimer);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center overflow-hidden"
        animate={
          screenShake
            ? { x: [0, -4, 4, -3, 3, -2, 2, 0], y: [0, 3, -3, 2, -2, 1, -1, 0] }
            : {}
        }
        transition={{ duration: 0.15 }}
      >
        {/* Semi-transparent backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />

        {/* Main animation container */}
        <div className="relative w-[500px] h-[300px] flex justify-center items-center">
          {/* Left fist */}
          <motion.div
            className="absolute text-[80px] sm:text-[100px] select-none"
            style={{ 
              filter: 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.5))',
              left: '0'
            }}
            initial={{ x: -100, rotate: -15, opacity: 0 }}
            animate={
              phase === 'approach'
                ? { x: 80, rotate: -5, opacity: 1 }
                : phase === 'impact'
                ? { x: 130, rotate: 0, scale: 1.1 }
                : phase === 'explode'
                ? { x: 130, rotate: 0, opacity: 0, scale: 0.8 }
                : { x: -100, rotate: -15, opacity: 0 }
            }
            transition={{
              duration: phase === 'approach' ? 0.4 : phase === 'impact' ? 0.1 : 0.3,
              ease: phase === 'impact' ? [0.2, 0.9, 0.2, 1] : 'easeOut'
            }}
          >
            🤜
          </motion.div>

          {/* Right fist */}
          <motion.div
            className="absolute text-[80px] sm:text-[100px] select-none"
            style={{ 
              filter: 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.5))',
              right: '0'
            }}
            initial={{ x: 100, rotate: 15, opacity: 0 }}
            animate={
              phase === 'approach'
                ? { x: -80, rotate: 5, opacity: 1 }
                : phase === 'impact'
                ? { x: -130, rotate: 0, scale: 1.1 }
                : phase === 'explode'
                ? { x: -130, rotate: 0, opacity: 0, scale: 0.8 }
                : { x: 100, rotate: 15, opacity: 0 }
            }
            transition={{
              duration: phase === 'approach' ? 0.4 : phase === 'impact' ? 0.1 : 0.3,
              ease: phase === 'impact' ? [0.2, 0.9, 0.2, 1] : 'easeOut'
            }}
          >
            🤛
          </motion.div>

          {/* Impact effects - only show during impact/explode */}
          {(phase === 'impact' || phase === 'explode') && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] flex justify-center items-center pointer-events-none">
              {/* Spark emojis */}
              {['💥', '✨', '⚡', '🔥'].map((emoji, index) => (
                <motion.div
                  key={index}
                  className="absolute text-4xl sm:text-5xl"
                  style={{
                    top: index === 0 ? '-20px' : index === 1 ? '50%' : 'auto',
                    bottom: index === 2 ? '-20px' : 'auto',
                    left: index === 1 ? '-20px' : index !== 3 ? '50%' : 'auto',
                    right: index === 3 ? '-20px' : 'auto',
                    transform: 'translate(-50%, -50%)'
                  }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.3, 1.5, 0.5] }}
                  transition={{
                    duration: 0.6,
                    delay: index * 0.05,
                    ease: 'easeOut'
                  }}
                >
                  {emoji}
                </motion.div>
              ))}

              {/* Impact wave */}
              <motion.div
                className="absolute rounded-full border-4"
                style={{ borderColor: 'rgba(255, 200, 0, 0.8)' }}
                initial={{ width: 40, height: 40, opacity: 0 }}
                animate={{ 
                  width: [40, 200], 
                  height: [40, 200], 
                  opacity: [1, 0],
                  borderColor: ['rgba(255, 200, 0, 1)', 'rgba(255, 100, 0, 0)']
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />

              {/* Second wave */}
              <motion.div
                className="absolute rounded-full border-2"
                style={{ borderColor: 'rgba(255, 150, 0, 0.6)' }}
                initial={{ width: 30, height: 30, opacity: 0 }}
                animate={{ 
                  width: [30, 160], 
                  height: [30, 160], 
                  opacity: [0.8, 0]
                }}
                transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
              />
            </div>
          )}

          {/* POUND! Text */}
          {(phase === 'impact' || phase === 'explode') && (
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-black text-4xl sm:text-5xl select-none z-10"
              style={{
                color: 'hsl(var(--primary-foreground))',
                textShadow: '0 0 20px hsl(var(--primary) / 0.8), 0 0 40px hsl(var(--accent) / 0.6), 0 4px 12px rgba(0,0,0,0.5)'
              }}
              initial={{ scale: 0.5, opacity: 0, y: 20 }}
              animate={{ scale: [0.5, 1.2, 1], opacity: [0, 1, 0], y: [20, -10, -30] }}
              transition={{ duration: 0.8, ease: [0.2, 0.9, 0.2, 1] }}
            >
              POUND!
            </motion.div>
          )}

          {/* Confetti particles - only during explode phase */}
          {phase === 'explode' && (
            <>
              {/* Left confetti */}
              {leftConfetti.map((particle) => (
                <motion.div
                  key={`left-${particle.id}`}
                  className="absolute text-xl pointer-events-none"
                  style={{ top: particle.top, left: '45%' }}
                  initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 1 }}
                  animate={{
                    opacity: [0, 1, 0],
                    x: particle.tx * 2,
                    y: particle.ty,
                    rotate: particle.rotate,
                    scale: [1, 0.8, 0.3]
                  }}
                  transition={{
                    duration: 0.8,
                    delay: particle.delay,
                    ease: 'easeOut'
                  }}
                >
                  {particle.emoji}
                </motion.div>
              ))}

              {/* Right confetti */}
              {rightConfetti.map((particle) => (
                <motion.div
                  key={`right-${particle.id}`}
                  className="absolute text-xl pointer-events-none"
                  style={{ top: particle.top, right: '45%' }}
                  initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 1 }}
                  animate={{
                    opacity: [0, 1, 0],
                    x: particle.tx * 2,
                    y: particle.ty,
                    rotate: particle.rotate,
                    scale: [1, 0.8, 0.3]
                  }}
                  transition={{
                    duration: 0.8,
                    delay: particle.delay,
                    ease: 'easeOut'
                  }}
                >
                  {particle.emoji}
                </motion.div>
              ))}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FistBumpAnimation;
