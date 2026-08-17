import { useState, useEffect, useCallback } from 'react';

interface UseWakeLockReturn {
  isSupported: boolean;
  isActive: boolean;
  request: () => Promise<boolean>;
  release: () => Promise<void>;
}

/**
 * Hook to keep the screen awake using the Screen Wake Lock API.
 * Useful for navigation and kitchen display modes.
 */
export const useWakeLock = (): UseWakeLockReturn => {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isSupported] = useState(() => 'wakeLock' in navigator);
  const [isActive, setIsActive] = useState(false);

  // Request wake lock
  const request = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.log('Wake Lock API not supported');
      return false;
    }

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      setWakeLock(sentinel);
      setIsActive(true);

      // Listen for release events
      sentinel.addEventListener('release', () => {
        console.log('Wake Lock released');
        setIsActive(false);
        setWakeLock(null);
      });

      console.log('Wake Lock acquired');
      return true;
    } catch (err) {
      console.error('Wake Lock request failed:', err);
      return false;
    }
  }, [isSupported]);

  // Release wake lock
  const release = useCallback(async (): Promise<void> => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
      setIsActive(false);
    }
  }, [wakeLock]);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && wakeLock === null && isActive) {
        // Try to reacquire if we were active before
        await request();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [wakeLock, isActive, request]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, [wakeLock]);

  return {
    isSupported,
    isActive,
    request,
    release,
  };
};
