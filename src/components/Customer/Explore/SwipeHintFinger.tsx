import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from 'react-i18next';

interface SwipeHintFingerProps {
  direction: "right" | "left";
  storageKey: string;
  show: boolean;
}

const SwipeHintFinger = ({ direction, storageKey, show }: SwipeHintFingerProps) => {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if user has already seen this hint
    const hasSeenHint = localStorage.getItem(storageKey);
    if (hasSeenHint) {
      setVisible(false);
      return;
    }

    if (show) {
      setVisible(true);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setVisible(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, storageKey]);

  // Mark hint as seen permanently
  const markAsSeen = () => {
    localStorage.setItem(storageKey, "true");
    setVisible(false);
  };

  if (!visible) return null;

  const isRight = direction === "right";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
        onClick={markAsSeen}
      >
        {/* Semi-transparent overlay */}
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Animated finger */}
        <motion.div
          className="relative z-10 flex flex-col items-center gap-3"
          initial={{ x: isRight ? -50 : 50 }}
          animate={{ x: isRight ? 50 : -50 }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        >
          {/* Hand emoji pointing in direction */}
          <span className="text-6xl" style={{ transform: isRight ? 'scaleX(1)' : 'scaleX(-1)' }}>
            👆
          </span>
          <motion.p 
            className="text-white text-sm font-medium bg-black/60 px-4 py-2 rounded-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {isRight ? "Swipe right to explore" : "Swipe left to go back"}
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SwipeHintFinger;

// Export helper to mark hint as seen
export const markSwipeHintSeen = (storageKey: string) => {
  localStorage.setItem(storageKey, "true");
};
