// Emotion detection from AI response text

export type Emotion = 'neutral' | 'happy' | 'excited' | 'apologetic' | 'serious' | 'thinking' | 'greeting' | 'concerned';

/**
 * Detects emotion from text content using keyword analysis
 * Returns the most appropriate emotion for avatar expression
 */
export function detectEmotion(text: string): Emotion {
  const lowerText = text.toLowerCase();
  
  // Priority order: more specific matches first
  
  // Apologetic / concerned
  if (
    lowerText.includes('sorry') || 
    lowerText.includes('unfortunately') || 
    lowerText.includes('cannot') ||
    lowerText.includes('unable') ||
    lowerText.includes('apologize') ||
    lowerText.includes('regret')
  ) {
    return 'apologetic';
  }
  
  // Excited
  if (
    lowerText.includes('wow') || 
    lowerText.includes('awesome') ||
    lowerText.includes('amazing') ||
    lowerText.includes('incredible') ||
    lowerText.includes('fantastic') ||
    lowerText.includes('excellent') ||
    lowerText.includes('!!')
  ) {
    return 'excited';
  }
  
  // Happy / welcoming
  if (
    lowerText.includes('welcome') || 
    lowerText.includes('great to') ||
    lowerText.includes('glad') ||
    lowerText.includes('happy to') ||
    lowerText.includes('pleasure') ||
    lowerText.includes('wonderful') ||
    lowerText.includes('delighted')
  ) {
    return 'happy';
  }
  
  // Greeting
  if (
    lowerText.includes('hello') || 
    lowerText.includes('hi ') ||
    lowerText.includes('hey ') ||
    lowerText.includes('good morning') ||
    lowerText.includes('good afternoon') ||
    lowerText.includes('good evening')
  ) {
    return 'greeting';
  }
  
  // Thinking / considering
  if (
    lowerText.includes('let me think') || 
    lowerText.includes('considering') ||
    lowerText.includes('perhaps') ||
    lowerText.includes('maybe') ||
    lowerText.includes('could be') ||
    (lowerText.includes('?') && lowerText.length < 100)
  ) {
    return 'thinking';
  }
  
  // Serious / important
  if (
    lowerText.includes('important') || 
    lowerText.includes('warning') ||
    lowerText.includes('caution') ||
    lowerText.includes('note that') ||
    lowerText.includes('please be aware')
  ) {
    return 'serious';
  }
  
  // Default to neutral
  return 'neutral';
}

/**
 * Get emotional intensity based on text characteristics
 * Returns 0-1 value for how strongly to express the emotion
 */
export function getEmotionIntensity(text: string): number {
  const lowerText = text.toLowerCase();
  
  // Count intensity markers
  let intensity = 0.5; // baseline
  
  // Exclamation marks increase intensity
  const exclamationCount = (text.match(/!/g) || []).length;
  intensity += Math.min(exclamationCount * 0.1, 0.3);
  
  // All caps words increase intensity
  const capsWords = (text.match(/\b[A-Z]{2,}\b/g) || []).length;
  intensity += Math.min(capsWords * 0.05, 0.15);
  
  // Intensifier words
  const intensifiers = ['very', 'really', 'extremely', 'absolutely', 'definitely'];
  intensifiers.forEach(word => {
    if (lowerText.includes(word)) intensity += 0.05;
  });
  
  return Math.min(intensity, 1);
}
