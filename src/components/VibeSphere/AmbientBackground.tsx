import { motion } from "framer-motion";
import { useMemo } from "react";
import { useTranslation } from 'react-i18next';

const AmbientBackground = () => {
  const { t } = useTranslation('common');
  const particles = useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 15 + Math.random() * 10,
      size: 2 + Math.random() * 4,
      opacity: 0.1 + Math.random() * 0.3,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ overflow: 'hidden' }}>
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(200,50%,5%)] via-[hsl(220,50%,8%)] to-[hsl(240,50%,5%)]" />
      
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--cyan)/0.15)_0%,_transparent_70%)]" />
      
      {/* Floating particles */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-cyan/50"
          style={{
            left: `${particle.x}%`,
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
          }}
          initial={{ y: "100vh" }}
          animate={{ y: "-10vh" }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: "linear",
          }}
        />
      ))}
      
      {/* Vignette effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_hsl(0,0%,0%,0.6)_100%)]" />
    </div>
  );
};

export default AmbientBackground;
