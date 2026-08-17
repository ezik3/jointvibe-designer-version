/**
 * Payment Configuration
 * 
 * This file controls whether payments are processed in SIMULATION mode or LIVE mode.
 * 
 * SIMULATION MODE (isSimulationMode = true):
 * - All payments appear real to users but don't process actual money
 * - Transactions are stored locally and shown in real-time
 * - Perfect for testing and development
 * - No actual Stripe charges or JVC transfers occur
 * 
 * LIVE MODE (isSimulationMode = false):
 * - Real payments are processed through Stripe and JVC system
 * - Actual money is transferred
 * - Use only when ready for production
 * 
 * TO SWITCH TO LIVE PAYMENTS:
 * Simply change SIMULATION_MODE to false below
 */

// ==========================================
// PAYMENT MODE CONFIGURATION
// ==========================================
// Set to `true` for simulated payments (testing)
// Set to `false` for real payments (production)
export const SIMULATION_MODE = false;

// ==========================================
// DO NOT MODIFY BELOW - Internal helpers
// ==========================================
export const isSimulationMode = (): boolean => SIMULATION_MODE;
export const isLiveMode = (): boolean => !SIMULATION_MODE;

// Simulation delay to make it feel realistic (milliseconds)
export const SIMULATION_DELAY_MS = 1500;

// Get mode label for debugging/display
export const getPaymentModeLabel = (): string => {
  return SIMULATION_MODE ? '🧪 Simulation Mode' : '🔴 Live Mode';
};

// Console log for developers
if (typeof window !== 'undefined') {
  console.log(`💳 Payment System: ${getPaymentModeLabel()}`);
}
