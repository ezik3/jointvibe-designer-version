import { motion } from "framer-motion";
import { ReactNode } from "react";
import { useTranslation } from 'react-i18next';

interface FloatingOrbProps {
  icon: ReactNode;
  label: string;
  color: string;
  glowColor: string;
  delay?: number;
  onClick?: () => void;
}

const FloatingOrb = ({
  icon,
  label,
  color,
  glowColor,
  delay = 0,
  onClick,
}: FloatingOrbProps) => {
  const { t } = useTranslation('common');
  return (
    <motion.button
      className="flex flex-col items-center gap-2 cursor-pointer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay, duration: 0.5, type: "spring" }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
    >
      {/* Floating animation wrapper */}
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: delay * 0.5,
        }}
      >
        {/* Orb with glow - responsive sizing */}
        <motion.div
          className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${color}, ${color}dd)`,
            boxShadow: `0 0 40px ${glowColor}`,
          }}
          animate={{
            boxShadow: [
              `0 0 30px ${glowColor}`,
              `0 0 50px ${glowColor}`,
              `0 0 30px ${glowColor}`,
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {/* Inner glow */}
          <div
            className="absolute inset-0 rounded-full opacity-50"
            style={{
              background: `radial-gradient(circle at 30% 30%, white, transparent 60%)`,
            }}
          />
          
          {/* Icon */}
          <div className="relative z-10 text-white">{icon}</div>
        </motion.div>
      </motion.div>

      {/* Label */}
      <motion.span
        className="text-white/80 text-sm font-medium"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.2 }}
      >
        {label}
      </motion.span>
    </motion.button>
  );
};

export default FloatingOrb;
