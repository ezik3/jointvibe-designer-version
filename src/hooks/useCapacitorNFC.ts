import { useState, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

// Use stub for web builds - actual Capacitor only needed for native mobile
let Capacitor: { isNativePlatform: () => boolean } = { isNativePlatform: () => false };

// Try to load real Capacitor, fall back to stub
try {
  // This will fail on web builds without Capacitor packages
  Capacitor = require('@capacitor/core').Capacitor;
} catch {
  // Stub already set above
}

// Dynamic import for Capacitor NFC plugin
let CapacitorNfc: any = null;

// Check if we're in a native Capacitor environment
const isNativeApp = Capacitor.isNativePlatform();

// Lazy load the NFC plugin only in native environment
const loadNFCPlugin = async () => {
  if (isNativeApp && !CapacitorNfc) {
    try {
      const module = await import('@capgo/capacitor-nfc');
      CapacitorNfc = module.CapacitorNfc;
      return true;
    } catch (error) {
      console.error('Failed to load NFC plugin:', error);
      return false;
    }
  }
  return !!CapacitorNfc;
};

interface NFCPaymentData {
  userId: string;
  sessionToken: string;
  timestamp: number;
  signature: string;
}

interface NFCReceiveData {
  customerId: string;
  sessionToken: string;
  timestamp: number;
}

export const useCapacitorNFC = () => {
  const [isNFCSupported, setIsNFCSupported] = useState<boolean | null>(null);
  const [isNFCActive, setIsNFCActive] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const listenerRef = useRef<any>(null);

  // Check NFC availability
  const checkNFCSupport = useCallback(async () => {
    if (!isNativeApp) {
      setIsNFCSupported(false);
      return false;
    }

    const loaded = await loadNFCPlugin();
    if (!loaded) {
      setIsNFCSupported(false);
      return false;
    }

    try {
      const { isEnabled } = await CapacitorNfc.isEnabled();
      setIsNFCSupported(isEnabled);
      return isEnabled;
    } catch (error) {
      console.error('Error checking NFC support:', error);
      setIsNFCSupported(false);
      return false;
    }
  }, []);

  // Simple encryption (same as Web NFC version for compatibility)
  const encryptPayload = useCallback((data: object): string => {
    const jsonString = JSON.stringify(data);
    const salt = Date.now().toString(36);
    return btoa(salt + ':' + jsonString);
  }, []);

  // Simple decryption
  const decryptPayload = useCallback((encrypted: string): object | null => {
    try {
      const decoded = atob(encrypted);
      const [, jsonString] = decoded.split(':');
      return JSON.parse(jsonString);
    } catch {
      console.error('Failed to decrypt NFC payload');
      return null;
    }
  }, []);

  // Generate session signature
  const generateSignature = useCallback((userId: string, timestamp: number): string => {
    const data = `${userId}:${timestamp}`;
    return btoa(data).substring(0, 16);
  }, []);

  // Customer mode: Write NFC tag (broadcast payment credentials)
  const startBroadcast = useCallback(async (userId: string, sessionToken: string): Promise<boolean> => {
    const supported = await checkNFCSupport();
    if (!supported) {
      toast({
        title: "NFC Not Available",
        description: "Please enable NFC in your device settings or use QR code.",
        variant: "destructive"
      });
      return false;
    }

    try {
      setIsBroadcasting(true);
      setIsNFCActive(true);

      const timestamp = Date.now();
      const signature = generateSignature(userId, timestamp);

      const paymentData: NFCPaymentData = {
        userId,
        sessionToken,
        timestamp,
        signature
      };

      const encryptedData = encryptPayload(paymentData);

      // Start NFC session for writing
      await CapacitorNfc.startScanSession({
        alertMessage: 'Hold your phone near the payment device'
      });

      // Write the NDEF message
      await CapacitorNfc.write({
        records: [
          {
            type: 'text',
            data: encryptedData
          }
        ]
      });

      toast({
        title: "Ready to Pay",
        description: "Hold your phone near the payment device"
      });

      return true;
    } catch (error: any) {
      console.error('Capacitor NFC broadcast error:', error);
      toast({
        title: "NFC Error",
        description: error.message || "Failed to start NFC. Please try QR code.",
        variant: "destructive"
      });
      setIsBroadcasting(false);
      setIsNFCActive(false);
      return false;
    }
  }, [checkNFCSupport, encryptPayload, generateSignature]);

  // Employee mode: Receive payment from customer
  const startReceiving = useCallback(async (
    onReceive: (data: NFCReceiveData) => void
  ): Promise<boolean> => {
    const supported = await checkNFCSupport();
    if (!supported) {
      toast({
        title: "NFC Not Available",
        description: "Please enable NFC in your device settings or use QR code.",
        variant: "destructive"
      });
      return false;
    }

    try {
      setIsReceiving(true);
      setIsNFCActive(true);

      // Add listener for NFC tags
      listenerRef.current = await CapacitorNfc.addListener('nfcTagScanned', async (event: any) => {
        try {
          const records = event.tag?.records || [];
          
          for (const record of records) {
            if (record.type === 'text' || record.recordType === 'text') {
              const encryptedData = record.data || record.payload;
              const decrypted = decryptPayload(encryptedData) as NFCPaymentData | null;

              if (decrypted && decrypted.userId && decrypted.sessionToken) {
                // Validate timestamp (must be within last 60 seconds)
                const age = Date.now() - decrypted.timestamp;
                if (age > 60000) {
                  toast({
                    title: "Payment Expired",
                    description: "Customer needs to reinitiate payment",
                    variant: "destructive"
                  });
                  return;
                }

                // Validate signature
                const expectedSig = generateSignature(decrypted.userId, decrypted.timestamp);
                if (expectedSig !== decrypted.signature) {
                  toast({
                    title: "Invalid Payment",
                    description: "Payment signature verification failed",
                    variant: "destructive"
                  });
                  return;
                }

                onReceive({
                  customerId: decrypted.userId,
                  sessionToken: decrypted.sessionToken,
                  timestamp: decrypted.timestamp
                });
              }
            }
          }
        } catch (error) {
          console.error('Error processing NFC tag:', error);
        }
      });

      // Start scanning
      await CapacitorNfc.startScanSession({
        alertMessage: 'Ask customer to tap their phone here'
      });

      toast({
        title: "Ready to Receive",
        description: "Ask customer to tap their phone here"
      });

      return true;
    } catch (error: any) {
      console.error('Capacitor NFC receive error:', error);
      toast({
        title: "NFC Error",
        description: error.message || "Failed to start NFC receiver",
        variant: "destructive"
      });
      setIsReceiving(false);
      setIsNFCActive(false);
      return false;
    }
  }, [checkNFCSupport, decryptPayload, generateSignature]);

  // Stop NFC operations
  const stopNFC = useCallback(async () => {
    try {
      if (listenerRef.current) {
        await listenerRef.current.remove();
        listenerRef.current = null;
      }
      
      if (isNativeApp && CapacitorNfc) {
        await CapacitorNfc.stopScanSession();
      }
    } catch (error) {
      console.error('Error stopping NFC:', error);
    }
    
    setIsBroadcasting(false);
    setIsReceiving(false);
    setIsNFCActive(false);
  }, []);

  return {
    isNativeApp,
    isNFCSupported,
    isNFCActive,
    isBroadcasting,
    isReceiving,
    checkNFCSupport,
    startBroadcast,
    startReceiving,
    stopNFC,
    encryptPayload,
    decryptPayload
  };
};
