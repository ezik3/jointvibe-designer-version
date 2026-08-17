import type { Emotion } from './EmotionEngine';

/**
 * Personality profile that defines how the avatar behaves
 * These values control animation intensity and character
 */
export interface Personality {
  /** Display name of the avatar/character */
  name: string;
  
  /** Default emotional state when idle */
  baseMood: Emotion;
  
  /** 0-1: How energetic/active animations are (affects speed and amplitude) */
  energy: number;
  
  /** 0-1: Empathy level (affects response to emotional content) */
  warmth: number;
  
  /** 0-1: Self-assurance (affects posture and speech patterns) */
  confidence: number;
  
  /** 0-1: How strong facial expressions are (scales all expression weights) */
  expressiveness: number;
  
  /** Speech rate modifier (0.8-1.2) */
  speakingPace: number;
  
  /** How quickly expressions transition (ms) */
  transitionSpeed: number;
  
  /** Blink frequency range [min, max] in ms */
  blinkInterval: [number, number];
  
  /** Idle movement amplitude (0-1) */
  idleMovement: number;
}

/**
 * Default personality for Joint Vibe AI host
 * Friendly, warm, professional venue assistant
 */
export const defaultPersonality: Personality = {
  name: "Stellara",
  baseMood: 'neutral',
  energy: 0.7,
  warmth: 0.85,
  confidence: 0.8,
  expressiveness: 0.75,
  speakingPace: 1.0,
  transitionSpeed: 300,
  blinkInterval: [2500, 5000],
  idleMovement: 0.6,
};

/**
 * Energetic party host personality
 */
export const partyHostPersonality: Personality = {
  name: "Vibe",
  baseMood: 'excited',
  energy: 0.9,
  warmth: 0.9,
  confidence: 0.95,
  expressiveness: 0.9,
  speakingPace: 1.1,
  transitionSpeed: 200,
  blinkInterval: [2000, 4000],
  idleMovement: 0.8,
};

/**
 * Calm, professional concierge personality
 */
export const conciergePersonality: Personality = {
  name: "Aria",
  baseMood: 'neutral',
  energy: 0.5,
  warmth: 0.7,
  confidence: 0.85,
  expressiveness: 0.6,
  speakingPace: 0.95,
  transitionSpeed: 400,
  blinkInterval: [3000, 6000],
  idleMovement: 0.4,
};

/**
 * Get animation parameters based on personality
 */
export function getAnimationParams(personality: Personality) {
  return {
    // Idle breathing amplitude
    breatheAmplitude: 0.01 + personality.energy * 0.015,
    
    // Idle sway amplitude
    swayAmplitude: 0.02 + personality.energy * 0.03,
    
    // Speaking animation intensity
    speakingIntensity: 0.5 + personality.expressiveness * 0.5,
    
    // Head movement range
    headMovementRange: 3 + personality.energy * 4,
    
    // Expression transition duration
    transitionDuration: personality.transitionSpeed,
    
    // Micro-movement frequency multiplier
    microMovementSpeed: 0.8 + personality.energy * 0.4,
  };
}
