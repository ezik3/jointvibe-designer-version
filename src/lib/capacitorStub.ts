/**
 * Stub for @capacitor/core to avoid bun install timeout on web builds.
 * The actual Capacitor packages are only needed for native mobile builds.
 */

export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: () => false,
};

export default Capacitor;
