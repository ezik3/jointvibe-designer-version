import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';

interface CheckInTransitionProps {
  isVisible: boolean;
  venueName: string;
  venueType?: string;
  vibeLevel?: string;
  onComplete?: () => void;
}

const CheckInTransition = ({
  isVisible,
  venueName,
  venueType,
  vibeLevel = "🔥 Lit",
  onComplete,
}: CheckInTransitionProps) => {
  const { t } = useTranslation('common');
  const [confetti, setConfetti] = useState<Array<{ id: number; x: number; rotation: number; color: string }>>([]);

  useEffect(() => {
    if (isVisible) {
      // Generate confetti particles
      const particles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 400,
        rotation: Math.random() * 360,
        color: ["#00D9FF", "#A855F7", "#EC4899", "#FBBF24", "#22C55E"][Math.floor(Math.random() * 5)],
      }));
      setConfetti(particles);

      // Trigger completion after animation
      const timer = setTimeout(() => {
        onComplete?.();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Pulsing Rings */}
          {[1, 2, 3].map((ring) => (
            <motion.div
              key={ring}
              className="absolute rounded-full border-2 border-cyan/50"
              initial={{ width: 50, height: 50, opacity: 0.8 }}
              animate={{
                width: [50, 300 + ring * 100],
                height: [50, 300 + ring * 100],
                opacity: [0.8, 0],
              }}
              transition={{
                duration: 2,
                delay: ring * 0.3,
                repeat: 1,
                ease: "easeOut",
              }}
            />
          ))}

          {/* Venue Icon/Logo */}
          <motion.div
            className="relative z-10 flex flex-col items-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: [0, 360] }}
            transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          >
            {/* Glowing orb */}
            <motion.div
              className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan via-purple to-pink flex items-center justify-center shadow-[0_0_60px_rgba(0,217,255,0.5)]"
              animate={{
                boxShadow: [
                  "0 0 60px rgba(0,217,255,0.5)",
                  "0 0 80px rgba(168,85,247,0.5)",
                  "0 0 60px rgba(0,217,255,0.5)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-4xl">🌐</span>
            </motion.div>

            {/* Venue Details */}
            <motion.div
              className="mt-6 text-center"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1, duration: 0.5 }}
            >
              <h2 className="text-3xl font-bold text-white mb-2">{venueName}</h2>
              {venueType && <p className="text-cyan text-lg">{venueType}</p>}
              <p className="text-white/60 mt-1">{vibeLevel}</p>
            </motion.div>

            {/* Welcome Message */}
            <motion.p
              className="mt-8 text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan via-purple to-pink"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.5 }}
            >
              Welcome! ✨
            </motion.p>
          </motion.div>

          {/* Confetti Explosion */}
          {confetti.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute w-3 h-3 rounded-full"
              style={{ backgroundColor: particle.color }}
              initial={{ x: 0, y: 0, scale: 0 }}
              animate={{
                x: particle.x,
                y: [-50, -200 - Math.random() * 200],
                scale: [0, 1, 0],
                rotate: particle.rotation,
              }}
              transition={{
                duration: 2,
                delay: 1.5,
                ease: "easeOut",
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CheckInTransition;
