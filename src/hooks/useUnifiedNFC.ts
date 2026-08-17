import { useState, useCallback, useEffect } from 'react';
import { useNFCPayment } from './useNFCPayment';
import { useCapacitorNFC } from './useCapacitorNFC';

/**
 * Unified NFC hook that automatically uses:
 * - Capacitor NFC for native iOS/Android apps
 * - Web NFC for Android Chrome browser
 * - Falls back to "not supported" for other browsers
 */
export const useUnifiedNFC = () => {
  // Use Capacitor NFC for native apps, Web NFC for browsers
  const webNFC = useNFCPayment();
  const capacitorNFC = useCapacitorNFC();
  
  // Check if native app from the hook (it handles the stub internally)
  const isNativeApp = capacitorNFC.isNativeApp;

  const [isNFCSupported, setIsNFCSupported] = useState(false);

  // Check NFC support on mount
  useEffect(() => {
    const checkSupport = async () => {
      if (isNativeApp) {
        const supported = await capacitorNFC.checkNFCSupport();
        setIsNFCSupported(supported);
      } else {
        setIsNFCSupported(webNFC.isNFCSupported);
      }
    };
    checkSupport();
  }, [isNativeApp, capacitorNFC.checkNFCSupport, webNFC.isNFCSupported]);

  // Unified interface
  const startBroadcast = useCallback(async (userId: string, sessionToken: string): Promise<boolean> => {
    if (isNativeApp) {
      return capacitorNFC.startBroadcast(userId, sessionToken);
    }
    return webNFC.startBroadcast(userId, sessionToken);
  }, [isNativeApp, capacitorNFC.startBroadcast, webNFC.startBroadcast]);

  const startReceiving = useCallback(async (
    onReceive: (data: { customerId: string; sessionToken: string; timestamp: number }) => void
  ): Promise<boolean> => {
    if (isNativeApp) {
      return capacitorNFC.startReceiving(onReceive);
    }
    return webNFC.startReceiving(onReceive);
  }, [isNativeApp, capacitorNFC.startReceiving, webNFC.startReceiving]);

  const stopNFC = useCallback(() => {
    if (isNativeApp) {
      capacitorNFC.stopNFC();
    } else {
      webNFC.stopNFC();
    }
  }, [isNativeApp, capacitorNFC.stopNFC, webNFC.stopNFC]);

  return {
    isNativeApp,
    isNFCSupported,
    isNFCActive: isNativeApp ? capacitorNFC.isNFCActive : webNFC.isNFCActive,
    isBroadcasting: isNativeApp ? capacitorNFC.isBroadcasting : webNFC.isBroadcasting,
    isReceiving: isNativeApp ? capacitorNFC.isReceiving : webNFC.isReceiving,
    startBroadcast,
    startReceiving,
    stopNFC,
    encryptPayload: isNativeApp ? capacitorNFC.encryptPayload : webNFC.encryptPayload,
    decryptPayload: isNativeApp ? capacitorNFC.decryptPayload : webNFC.decryptPayload
  };
};
