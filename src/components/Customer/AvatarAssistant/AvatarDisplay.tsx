import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ExpressionConfig } from "@/avatar/expressions";
import { useTranslation } from 'react-i18next';

export type AvatarExpression = 'idle' | 'thinking' | 'speaking' | 'happy' | 'concerned' | 'greeting';

interface AvatarDisplayProps {
  expression: AvatarExpression;
  isSpeaking: boolean;
  className?: string;
  size?: 'small' | 'full';
  /** Lip sync mouth openness (0-1) */
  mouthOpen?: number;
  /** Expression configuration from emotion engine */
  expressionConfig?: ExpressionConfig;
  /** Personality energy level */
  energy?: number;
}

export default function AvatarDisplay({ 
  expression, 
  isSpeaking, 
  className = "",
  size = 'full',
  mouthOpen: lipSyncMouth = 0,
  expressionConfig,
  energy = 0.7,
}: AvatarDisplayProps) {
  const { t } = useTranslation('common');
  const [mouthOpen, setMouthOpen] = useState(false);
  const [blinkState, setBlinkState] = useState(false);
  const [headTilt, setHeadTilt] = useState(0);
  const [breathePhase, setBreathePhase] = useState(0);

  // Lip-sync animation - use lipSyncMouth if available, otherwise toggle
  useEffect(() => {
    if (!isSpeaking) {
      setMouthOpen(false);
      return;
    }
    // If we have real lip sync data, don't use interval
    if (lipSyncMouth > 0.1) return;
    
    const interval = setInterval(() => {
      setMouthOpen(prev => !prev);
    }, 100 + Math.random() * 100);
    return () => clearInterval(interval);
  }, [isSpeaking, lipSyncMouth]);

  // Natural blinking
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 100);
    }, 2500 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Subtle head movement
  useEffect(() => {
    const headInterval = setInterval(() => {
      setHeadTilt((Math.random() - 0.5) * 4);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(headInterval);
  }, []);

  // Breathing animation
  useEffect(() => {
    const breatheInterval = setInterval(() => {
      setBreathePhase(prev => (prev + 1) % 360);
    }, 50);
    return () => clearInterval(breatheInterval);
  }, []);

  const getExpressionStyles = () => {
    // Use expressionConfig if available, otherwise fall back to defaults
    if (expressionConfig) {
      return {
        eyebrowOffset: expressionConfig.eyebrowOffset ?? 0,
        eyeScale: expressionConfig.eyeScale ?? 1,
        mouthCurve: expressionConfig.mouthCurve ?? 3,
        headTilt: expressionConfig.headTilt ?? 0,
      };
    }
    
    switch (expression) {
      case 'thinking':
        return { eyebrowOffset: -3, eyeScale: 0.9, mouthCurve: 0, headTilt: 5 };
      case 'happy':
        return { eyebrowOffset: 2, eyeScale: 0.85, mouthCurve: 8, headTilt: -3 };
      case 'concerned':
        return { eyebrowOffset: -5, eyeScale: 1, mouthCurve: -3, headTilt: 2 };
      case 'greeting':
        return { eyebrowOffset: 3, eyeScale: 1.05, mouthCurve: 6, headTilt: -5 };
      case 'speaking':
        return { eyebrowOffset: 1, eyeScale: 1, mouthCurve: 2, headTilt: 0 };
      default:
        return { eyebrowOffset: 0, eyeScale: 1, mouthCurve: 3, headTilt: 0 };
    }
  };

  // Use lip sync value if available
  const actualMouthOpen = lipSyncMouth > 0.1 ? lipSyncMouth > 0.3 : mouthOpen;

  const expressionStyles = getExpressionStyles();
  const breatheOffset = Math.sin(breathePhase * Math.PI / 180) * 1.5;

  const containerClass = size === 'full' ? "w-32 md:w-40" : "w-20";

  return (
    <div className={`relative flex items-end justify-center ${containerClass} ${className}`}>
      {/* Subtle ground shadow */}
      <div className="absolute bottom-0 w-16 h-2 bg-black/20 rounded-[50%] blur-sm" />

      <motion.div
        className="relative w-full"
        animate={{
          y: breatheOffset,
          rotate: expressionStyles.headTilt + headTilt * 0.5,
        }}
        transition={{
          y: { duration: 0.05 },
          rotate: { duration: 0.4, ease: "easeOut" },
        }}
      >
        <svg
          viewBox="0 0 200 420"
          className="w-full h-auto"
          style={{ 
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))'
          }}
        >
          <defs>
            {/* Realistic skin with subsurface scattering effect */}
            <radialGradient id="skinBase" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fce4d8" />
              <stop offset="50%" stopColor="#f0c9b8" />
              <stop offset="100%" stopColor="#d4a892" />
            </radialGradient>
            
            <radialGradient id="skinHighlight" cx="35%" cy="25%" r="50%">
              <stop offset="0%" stopColor="#fff8f5" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#fff8f5" stopOpacity="0" />
            </radialGradient>
            
            <linearGradient id="skinShadow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c9967d" stopOpacity="0" />
              <stop offset="100%" stopColor="#c9967d" stopOpacity="0.4" />
            </linearGradient>

            {/* Rich hair with realistic shine */}
            <linearGradient id="hairMain" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2d1f15" />
              <stop offset="50%" stopColor="#1a120c" />
              <stop offset="100%" stopColor="#0f0a07" />
            </linearGradient>
            
            <linearGradient id="hairShine" x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="#4a3528" stopOpacity="0" />
              <stop offset="50%" stopColor="#6b4c38" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#4a3528" stopOpacity="0" />
            </linearGradient>

            {/* Professional attire */}
            <linearGradient id="dressMain" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3d5a80" />
              <stop offset="40%" stopColor="#293d56" />
              <stop offset="100%" stopColor="#1a2836" />
            </linearGradient>
            
            <linearGradient id="dressFabricShine" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#5a7a9a" stopOpacity="0.25" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>

            {/* Eye details */}
            <radialGradient id="eyeWhite" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f0eeec" />
            </radialGradient>
            
            <radialGradient id="iris" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#7a6555" />
              <stop offset="50%" stopColor="#5a4535" />
              <stop offset="100%" stopColor="#3a2a20" />
            </radialGradient>

            {/* Lips */}
            <linearGradient id="lipColor" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#d4707a" />
              <stop offset="50%" stopColor="#c45a65" />
              <stop offset="100%" stopColor="#a84a55" />
            </linearGradient>
            
            <radialGradient id="lipShine" cx="50%" cy="20%" r="50%">
              <stop offset="0%" stopColor="#ff9aa5" stopOpacity="0.5" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            {/* Cheek blush */}
            <radialGradient id="blush" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffb0a0" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffb0a0" stopOpacity="0" />
            </radialGradient>

            {/* Belt accent */}
            <linearGradient id="beltGold" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#d4af37" />
              <stop offset="50%" stopColor="#f0d060" />
              <stop offset="100%" stopColor="#d4af37" />
            </linearGradient>

            {/* Shoe */}
            <linearGradient id="shoeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2a2a2a" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </linearGradient>
          </defs>

          {/* HAIR - Back layer */}
          <ellipse cx="100" cy="55" rx="52" ry="42" fill="url(#hairMain)" />
          <ellipse cx="100" cy="55" rx="50" ry="40" fill="url(#hairShine)" />
          
          {/* Long hair flowing down */}
          <path d="M 48 55 Q 40 100 45 150 Q 50 160 55 150 Q 52 100 55 58" fill="url(#hairMain)" />
          <path d="M 152 55 Q 160 100 155 150 Q 150 160 145 150 Q 148 100 145 58" fill="url(#hairMain)" />

          {/* BODY - Dress */}
          <motion.g
            animate={{ scaleY: 1 + Math.sin(breathePhase * Math.PI / 180) * 0.003 }}
            style={{ transformOrigin: '100px 180px' }}
          >
            <path
              d="M 70 125 
                 Q 55 145 50 200
                 Q 46 270 52 320
                 Q 60 365 72 395
                 L 80 395
                 Q 88 360 95 320
                 Q 100 360 105 320
                 Q 112 360 120 395
                 L 128 395
                 Q 140 365 148 320
                 Q 154 270 150 200
                 Q 145 145 130 125
                 Q 100 108 70 125"
              fill="url(#dressMain)"
            />
            <path
              d="M 70 125 
                 Q 55 145 50 200
                 Q 46 270 52 320
                 Q 60 365 72 395
                 L 80 395
                 Q 88 360 95 320
                 Q 100 360 105 320
                 Q 112 360 120 395
                 L 128 395
                 Q 140 365 148 320
                 Q 154 270 150 200
                 Q 145 145 130 125
                 Q 100 108 70 125"
              fill="url(#dressFabricShine)"
            />
            
            {/* Neckline */}
            <path d="M 80 125 Q 100 132 120 125" stroke="#1a2530" strokeWidth="2" fill="none" />
            
            {/* Belt */}
            <rect x="58" y="195" width="84" height="12" rx="2" fill="url(#beltGold)" />
            <ellipse cx="100" cy="201" rx="5" ry="4" fill="#b8942e" />
          </motion.g>

          {/* ARMS */}
          <motion.g
            animate={{
              rotate: isSpeaking ? [0, -3, 0, 3, 0] : expression === 'greeting' ? [0, -20, 0, -20, 0] : 0,
            }}
            transition={{
              duration: expression === 'greeting' ? 1 : 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: '55px 140px' }}
          >
            <path
              d="M 55 140 Q 35 180 30 225 Q 28 240 36 245"
              stroke="url(#skinBase)"
              strokeWidth="22"
              strokeLinecap="round"
              fill="none"
            />
            <ellipse cx="36" cy="248" rx="14" ry="12" fill="url(#skinBase)" />
          </motion.g>

          <motion.g
            animate={{ rotate: isSpeaking ? [0, 2, 0, -2, 0] : 0 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: '145px 140px' }}
          >
            <path
              d="M 145 140 Q 168 175 175 210 Q 180 228 172 235"
              stroke="url(#skinBase)"
              strokeWidth="22"
              strokeLinecap="round"
              fill="none"
            />
            <ellipse cx="172" cy="238" rx="14" ry="12" fill="url(#skinBase)" />
          </motion.g>

          {/* LEGS */}
          <path d="M 78 393 Q 76 408 74 418" stroke="url(#skinBase)" strokeWidth="20" strokeLinecap="round" fill="none" />
          <path d="M 122 393 Q 124 408 126 418" stroke="url(#skinBase)" strokeWidth="20" strokeLinecap="round" fill="none" />

          {/* SHOES */}
          <ellipse cx="74" cy="416" rx="22" ry="8" fill="url(#shoeGrad)" />
          <ellipse cx="126" cy="416" rx="22" ry="8" fill="url(#shoeGrad)" />

          {/* NECK */}
          <rect x="84" y="105" width="32" height="25" rx="8" fill="url(#skinBase)" />
          <rect x="84" y="105" width="32" height="25" rx="8" fill="url(#skinShadow)" />

          {/* HEAD */}
          <motion.g
            animate={{ rotate: expressionStyles.headTilt + headTilt }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ transformOrigin: '100px 65px' }}
          >
            {/* Face shape */}
            <ellipse cx="100" cy="62" rx="44" ry="52" fill="url(#skinBase)" />
            <ellipse cx="100" cy="62" rx="44" ry="52" fill="url(#skinHighlight)" />
            
            {/* Jawline definition */}
            <path d="M 60 80 Q 100 115 140 80" stroke="#d4a090" strokeWidth="2" opacity="0.2" fill="none" />

            {/* HAIR - Front */}
            <path
              d="M 56 42 Q 56 15 100 8 Q 144 15 144 42 Q 138 25 100 18 Q 62 25 56 42"
              fill="url(#hairMain)"
            />
            <path d="M 68 42 Q 78 52 73 62 Q 70 52 68 42" fill="url(#hairMain)" />
            <path d="M 82 38 Q 88 50 85 58 Q 82 48 82 38" fill="url(#hairMain)" />
            <path d="M 56 45 Q 50 65 54 85 Q 60 78 62 50" fill="url(#hairMain)" />
            <path d="M 144 45 Q 150 65 146 85 Q 140 78 138 50" fill="url(#hairMain)" />
            
            {/* Hair shine */}
            <path d="M 72 22 Q 100 14 128 22" stroke="url(#hairShine)" strokeWidth="4" fill="none" />

            {/* Cheeks */}
            <ellipse cx="68" cy="72" rx="14" ry="10" fill="url(#blush)" />
            <ellipse cx="132" cy="72" rx="14" ry="10" fill="url(#blush)" />

            {/* EYEBROWS */}
            <motion.g animate={{ y: expressionStyles.eyebrowOffset }} transition={{ duration: 0.2 }}>
              <path d="M 72 42 Q 82 37 94 42" stroke="#3d2a1f" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M 106 42 Q 118 37 128 42" stroke="#3d2a1f" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </motion.g>

            {/* EYES */}
            <motion.g
              animate={{ scaleY: blinkState ? 0.1 : expressionStyles.eyeScale }}
              transition={{ duration: 0.08 }}
              style={{ transformOrigin: '100px 56px' }}
            >
              {/* Left eye */}
              <ellipse cx="82" cy="56" rx="12" ry="10" fill="url(#eyeWhite)" />
              <motion.circle
                cx="82" cy="56" r="7"
                fill="url(#iris)"
                animate={{ cx: expression === 'thinking' ? 78 : 82 }}
              />
              <circle cx="82" cy="55" r="4" fill="#1a1008" />
              <circle cx="84" cy="53" r="2.5" fill="white" />
              <circle cx="80" cy="57" r="1" fill="white" opacity="0.6" />
              
              {/* Right eye */}
              <ellipse cx="118" cy="56" rx="12" ry="10" fill="url(#eyeWhite)" />
              <motion.circle
                cx="118" cy="56" r="7"
                fill="url(#iris)"
                animate={{ cx: expression === 'thinking' ? 114 : 118 }}
              />
              <circle cx="118" cy="55" r="4" fill="#1a1008" />
              <circle cx="120" cy="53" r="2.5" fill="white" />
              <circle cx="116" cy="57" r="1" fill="white" opacity="0.6" />
            </motion.g>

            {/* Eyelashes */}
            <g stroke="#2a1f15" strokeWidth="1.5" strokeLinecap="round">
              <path d="M 70 53 L 67 49" />
              <path d="M 74 50 L 72 46" />
              <path d="M 78 49 L 77 45" />
              <path d="M 122 49 L 123 45" />
              <path d="M 126 50 L 128 46" />
              <path d="M 130 53 L 133 49" />
            </g>

            {/* NOSE */}
            <path d="M 100 58 Q 96 70 100 76 Q 104 70 100 58" fill="#dbb09a" opacity="0.5" />
            <path d="M 95 74 Q 100 78 105 74" stroke="#c9967d" strokeWidth="1.5" fill="none" opacity="0.6" />

            {/* MOUTH */}
            <motion.g
              animate={{
                scaleY: mouthOpen ? 1.3 : 1,
                y: mouthOpen ? 1 : 0,
              }}
              style={{ transformOrigin: '100px 88px' }}
              transition={{ duration: 0.08 }}
            >
              {mouthOpen ? (
                <>
                  <ellipse cx="100" cy="88" rx="10" ry="6" fill="url(#lipColor)" />
                  <ellipse cx="100" cy="88" rx="10" ry="6" fill="url(#lipShine)" />
                  <ellipse cx="100" cy="90" rx="6" ry="3" fill="#2a1a18" />
                </>
              ) : (
                <>
                  <path
                    d={`M 88 86 Q 100 ${86 + expressionStyles.mouthCurve} 112 86`}
                    stroke="url(#lipColor)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d={`M 90 86 Q 100 ${84 + expressionStyles.mouthCurve * 0.5} 110 86`}
                    stroke="url(#lipShine)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                    opacity="0.6"
                  />
                </>
              )}
            </motion.g>
          </motion.g>
        </svg>
      </motion.div>
    </div>
  );
}
