/**
 * Real-time lip sync engine using Web Audio API
 * Analyzes audio amplitude to drive mouth movement
 */

export interface LipSyncState {
  /** Current mouth openness (0-1) */
  mouthOpen: number;
  
  /** Audio volume level (0-1) */
  volume: number;
  
  /** Whether audio is currently playing */
  isPlaying: boolean;
  
  /** Smoothed amplitude for animations */
  smoothedAmplitude: number;
}

export class LipSyncEngine {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private smoothedValue = 0;
  private isActive = false;
  private animationFrameId: number | null = null;
  
  // Callback for state updates
  private onUpdate: ((state: LipSyncState) => void) | null = null;
  
  // Smoothing parameters
  private readonly smoothingFactor = 0.3; // Lower = smoother
  private readonly minThreshold = 0.05; // Noise floor
  
  constructor() {
    // AudioContext will be created on first use
  }
  
  /**
   * Set callback for lip sync state updates
   */
  setUpdateCallback(callback: (state: LipSyncState) => void) {
    this.onUpdate = callback;
  }
  
  /**
   * Connect to an audio element for lip sync analysis
   */
  connectToAudio(audioElement: HTMLAudioElement): void {
    try {
      // Create or resume audio context
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      
      // Create buffer for frequency data
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      // Connect audio element to analyser
      const source = this.audioContext.createMediaElementSource(audioElement);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      this.isActive = true;
      this.startAnalysis();
      
    } catch (error) {
      console.error('LipSync: Failed to connect audio:', error);
    }
  }
  
  /**
   * Connect to an AudioNode directly (for programmatic audio)
   */
  connectToNode(audioNode: AudioNode, audioContext: AudioContext): void {
    try {
      this.audioContext = audioContext;
      
      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      
      // Create buffer
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      // Connect
      audioNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      this.isActive = true;
      this.startAnalysis();
      
    } catch (error) {
      console.error('LipSync: Failed to connect node:', error);
    }
  }
  
  /**
   * Start the analysis loop
   */
  private startAnalysis(): void {
    if (this.animationFrameId !== null) return;
    
    const analyze = () => {
      if (!this.isActive || !this.analyser || !this.dataArray) {
        return;
      }
      
      // Get frequency data
      this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);
      
      // Calculate average amplitude from speech frequencies (human voice ~85-255 Hz)
      // Focus on bins 1-10 for speech-relevant frequencies
      let sum = 0;
      const speechBins = Math.min(10, this.dataArray.length);
      for (let i = 1; i < speechBins; i++) {
        sum += this.dataArray[i];
      }
      const rawAmplitude = sum / (speechBins * 255);
      
      // Apply threshold and normalize
      const thresholded = Math.max(0, rawAmplitude - this.minThreshold) / (1 - this.minThreshold);
      
      // Smooth the value
      this.smoothedValue += (thresholded - this.smoothedValue) * this.smoothingFactor;
      
      // Map to mouth openness with slight exaggeration for visibility
      const mouthOpen = Math.min(this.smoothedValue * 1.5, 1);
      
      // Send update
      if (this.onUpdate) {
        this.onUpdate({
          mouthOpen,
          volume: rawAmplitude,
          isPlaying: rawAmplitude > this.minThreshold,
          smoothedAmplitude: this.smoothedValue,
        });
      }
      
      this.animationFrameId = requestAnimationFrame(analyze);
    };
    
    this.animationFrameId = requestAnimationFrame(analyze);
  }
  
  /**
   * Stop analysis and cleanup
   */
  stop(): void {
    this.isActive = false;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Reset smoothed value
    this.smoothedValue = 0;
    
    // Send final update
    if (this.onUpdate) {
      this.onUpdate({
        mouthOpen: 0,
        volume: 0,
        isPlaying: false,
        smoothedAmplitude: 0,
      });
    }
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.dataArray = null;
  }
  
  /**
   * Get current state without callback
   */
  getCurrentState(): LipSyncState {
    return {
      mouthOpen: Math.min(this.smoothedValue * 1.5, 1),
      volume: this.smoothedValue,
      isPlaying: this.isActive && this.smoothedValue > this.minThreshold,
      smoothedAmplitude: this.smoothedValue,
    };
  }
}

// Singleton instance for global use
let lipSyncInstance: LipSyncEngine | null = null;

export function getLipSyncEngine(): LipSyncEngine {
  if (!lipSyncInstance) {
    lipSyncInstance = new LipSyncEngine();
  }
  return lipSyncInstance;
}
