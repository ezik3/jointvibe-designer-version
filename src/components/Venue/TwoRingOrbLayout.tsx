import { motion } from "framer-motion";
import { Eye } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface Orb {
  id: string;
  icon: any;
  label: string;
  color: string;
  gradientStyle?: React.CSSProperties;
  count: number | null;
}

interface TwoRingOrbLayoutProps {
  orbs: Orb[];
  onOrbClick: (orbId: string) => void;
  onControlCenterClick: () => void;
}

// Elliptical layout that fits all orbs on screen
const TwoRingOrbLayout = ({
  orbs,
  onOrbClick,
  onControlCenterClick,
}: TwoRingOrbLayoutProps) => {
  const { t } = useTranslation('venue');
  const orbCount = orbs.length;
  
  // Uniform sizing for all orbs
  const getOrbSize = () => {
    return { desktop: 'w-[4.5rem] h-[4.5rem]', mobile: 'w-12 h-12', iconDesktop: 'w-7 h-7', iconMobile: 'w-5 h-5' };
  };

  const sizes = getOrbSize();

  // Calculate position on ellipse for desktop (elliptical) and mobile (circular)
  const getPosition = (index: number, total: number, isMobile: boolean) => {
    const angle = (index / total) * 360 - 90; // Start from top (-90 degrees)
    const radians = (angle * Math.PI) / 180;
    
    if (isMobile) {
      // Mobile: smaller circular layout
      const radius = total <= 4 ? 85 : total <= 6 ? 95 : 105;
      return {
        x: Math.cos(radians) * radius,
        y: Math.sin(radians) * radius,
      };
    } else {
      // Desktop: elliptical layout - reduced vertical radius to prevent overflow
      const radiusX = total <= 4 ? 180 : total <= 6 ? 200 : 220;
      const radiusY = total <= 4 ? 100 : total <= 6 ? 110 : 120;
      return {
        x: Math.cos(radians) * radiusX,
        y: Math.sin(radians) * radiusY,
      };
    }
  };

  return (
    <div className="relative w-full h-[320px] md:h-[370px] flex items-center justify-center overflow-visible mt-4 md:mt-6">
      {/* Control Center (always in the middle) */}
      <motion.div 
        className="absolute cursor-pointer z-10"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        onClick={onControlCenterClick}
      >
        <motion.div 
          className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br from-primary/40 to-purple-500/40 flex items-center justify-center border-2 border-white/20"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-primary/60 to-purple-500/60 flex items-center justify-center backdrop-blur-sm">
            <Eye className="w-7 h-7 md:w-9 md:h-9 text-white" />
          </div>
        </motion.div>
        <p className="text-center text-white mt-2 font-bold text-sm md:text-base drop-shadow-lg">Control Center</p>
      </motion.div>

      {/* Orbs positioned around the center */}
      {orbs.map((orb, index) => {
        const Icon = orb.icon;
        const mobilePos = getPosition(index, orbCount, true);
        const desktopPos = getPosition(index, orbCount, false);
        
        return (
          <motion.div
            key={orb.id}
            className="absolute cursor-pointer"
            style={{
              left: '50%',
              top: '50%',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              y: [0, -6, 0],
            }}
            transition={{
              scale: { delay: index * 0.08, duration: 0.4 },
              y: { repeat: Infinity, duration: 3 + (index * 0.2), ease: "easeInOut" }
            }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onOrbClick(orb.id)}
          >
            {/* Mobile position */}
            <div 
              className="md:hidden"
              style={{
                transform: `translate(calc(-50% + ${mobilePos.x}px), calc(-50% + ${mobilePos.y}px))`,
              }}
            >
              <div className={`relative ${sizes.mobile} rounded-full ${!orb.gradientStyle ? `bg-gradient-to-br ${orb.color}` : ''} 
                shadow-xl flex items-center justify-center group border-2 border-white/30`}
                style={orb.gradientStyle || {}}>
                <div className={`absolute inset-0 rounded-full ${!orb.gradientStyle ? `bg-gradient-to-br ${orb.color}` : ''} opacity-50 blur-lg 
                  group-hover:opacity-80 transition-opacity`}
                  style={orb.gradientStyle || {}} />
                <Icon className={`${sizes.iconMobile} text-white relative z-10 drop-shadow-lg`} />
                {orb.count !== null && orb.count > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center 
                    justify-center text-white text-[9px] font-bold shadow-lg border-2 border-white z-20">
                    {orb.count > 99 ? '99+' : orb.count}
                  </div>
                )}
              </div>
              <p className="text-center text-white text-[10px] mt-1 font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap">
                {orb.label}
              </p>
            </div>

            {/* Desktop position */}
            <div 
              className="hidden md:block"
              style={{
                transform: `translate(calc(-50% + ${desktopPos.x}px), calc(-50% + ${desktopPos.y}px))`,
              }}
            >
              <div className={`relative ${sizes.desktop} rounded-full ${!orb.gradientStyle ? `bg-gradient-to-br ${orb.color}` : ''} 
                shadow-2xl flex items-center justify-center group border-2 border-white/30`}
                style={orb.gradientStyle || {}}>
                <div className={`absolute inset-0 rounded-full ${!orb.gradientStyle ? `bg-gradient-to-br ${orb.color}` : ''} opacity-60 blur-xl 
                  group-hover:opacity-90 transition-opacity`}
                  style={orb.gradientStyle || {}} />
                <Icon className={`${sizes.iconDesktop} text-white relative z-10 drop-shadow-lg`} />
                {orb.count !== null && orb.count > 0 && (
                  <div className="absolute -top-1 -right-1 w-7 h-7 bg-red-500 rounded-full flex items-center 
                    justify-center text-white text-xs font-bold shadow-lg border-2 border-white z-20">
                    {orb.count > 99 ? '99+' : orb.count}
                  </div>
                )}
              </div>
              <p className="text-center text-white text-xs md:text-sm mt-2 font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap">
                {orb.label}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default TwoRingOrbLayout;
