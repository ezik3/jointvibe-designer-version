import type { Emotion } from './EmotionEngine';

/**
 * Expression configuration for morph targets and visual parameters
 * Maps emotions to facial expression weights
 */
export interface ExpressionConfig {
  // Morph target weights (0-1)
  mouthSmile?: number;
  mouthOpen?: number;
  jawOpen?: number;
  browRaise?: number;
  browDown?: number;
  cheekRaise?: number;
  eyeSquint?: number;
  eyeWide?: number;
  
  // Animation parameters
  headTilt?: number;
  eyebrowOffset?: number;
  eyeScale?: number;
  mouthCurve?: number;
}

/**
 * Expression presets for each emotion
 * Values are normalized 0-1, will be scaled by personality.expressiveness
 */
export const Expressions: Record<Emotion, ExpressionConfig> = {
  neutral: {
    mouthSmile: 0.2,
    browRaise: 0,
    browDown: 0,
    cheekRaise: 0,
    headTilt: 0,
    eyebrowOffset: 0,
    eyeScale: 1,
    mouthCurve: 3,
  },
  
  happy: {
    mouthSmile: 0.7,
    cheekRaise: 0.5,
    browRaise: 0.3,
    eyeSquint: 0.2,
    headTilt: -3,
    eyebrowOffset: 2,
    eyeScale: 0.85,
    mouthCurve: 8,
  },
  
  excited: {
    mouthSmile: 0.9,
    cheekRaise: 0.6,
    browRaise: 0.6,
    eyeWide: 0.3,
    headTilt: -5,
    eyebrowOffset: 4,
    eyeScale: 1.1,
    mouthCurve: 10,
  },
  
  apologetic: {
    mouthSmile: 0.1,
    browDown: 0.4,
    browRaise: 0.2, // inner brow raise
    headTilt: 4,
    eyebrowOffset: -4,
    eyeScale: 0.95,
    mouthCurve: -2,
  },
  
  serious: {
    mouthSmile: 0,
    browDown: 0.5,
    headTilt: 2,
    eyebrowOffset: -3,
    eyeScale: 1,
    mouthCurve: 0,
  },
  
  thinking: {
    mouthSmile: 0.1,
    browRaise: 0.3,
    headTilt: 5,
    eyebrowOffset: -3,
    eyeScale: 0.9,
    mouthCurve: 0,
  },
  
  greeting: {
    mouthSmile: 0.6,
    cheekRaise: 0.4,
    browRaise: 0.4,
    eyeWide: 0.2,
    headTilt: -5,
    eyebrowOffset: 3,
    eyeScale: 1.05,
    mouthCurve: 6,
  },
  
  concerned: {
    mouthSmile: 0.05,
    browDown: 0.3,
    browRaise: 0.2,
    headTilt: 2,
    eyebrowOffset: -5,
    eyeScale: 1,
    mouthCurve: -3,
  },
};

/**
 * Blend two expressions together
 * @param from Starting expression
 * @param to Target expression  
 * @param t Blend factor 0-1
 */
export function blendExpressions(
  from: ExpressionConfig,
  to: ExpressionConfig,
  t: number
): ExpressionConfig {
  const result: ExpressionConfig = {};
  
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]) as Set<keyof ExpressionConfig>;
  
  keys.forEach(key => {
    const fromVal = from[key] ?? 0;
    const toVal = to[key] ?? 0;
    (result as any)[key] = fromVal + (toVal - fromVal) * t;
  });
  
  return result;
}

/**
 * Apply personality scaling to expression
 * @param expression Base expression config
 * @param expressiveness Personality expressiveness 0-1
 */
export function scaleExpression(
  expression: ExpressionConfig,
  expressiveness: number
): ExpressionConfig {
  const result: ExpressionConfig = { ...expression };
  
  // Scale emotional expression weights
  if (result.mouthSmile !== undefined) result.mouthSmile *= expressiveness;
  if (result.cheekRaise !== undefined) result.cheekRaise *= expressiveness;
  if (result.browRaise !== undefined) result.browRaise *= expressiveness;
  if (result.browDown !== undefined) result.browDown *= expressiveness;
  if (result.eyeSquint !== undefined) result.eyeSquint *= expressiveness;
  if (result.eyeWide !== undefined) result.eyeWide *= expressiveness;
  
  // Head tilt scales with expressiveness
  if (result.headTilt !== undefined) result.headTilt *= expressiveness;
  if (result.eyebrowOffset !== undefined) result.eyebrowOffset *= expressiveness;
  
  return result;
}
