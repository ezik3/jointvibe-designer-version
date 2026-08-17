import { useState, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

// Check if Web NFC is supported (Android Chrome only)
const isWebNFCSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

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

export const useNFCPayment = () => {
  const [isNFCSupported] = useState(isWebNFCSupported);
  const [isNFCActive, setIsNFCActive] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Simple encryption (in production, use proper crypto)
  const encryptPayload = useCallback((data: object): string => {
    const jsonString = JSON.stringify(data);
    // Base64 encode with timestamp salt
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
    // Simple HMAC-like signature (in production, use proper crypto)
    const data = `${userId}:${timestamp}`;
    return btoa(data).substring(0, 16);
  }, []);

  // Customer mode: Broadcast payment credentials
  const startBroadcast = useCallback(async (userId: string, sessionToken: string): Promise<boolean> => {
    if (!isWebNFCSupported) {
      toast({
        title: "NFC Not Supported",
        description: "Your device doesn't support NFC payments. Please use QR code instead.",
        variant: "destructive"
      });
      return false;
    }

    try {
      setIsBroadcasting(true);
      setIsNFCActive(true);
      
      abortControllerRef.current = new AbortController();
      
      // @ts-ignore - NDEFReader is not in TypeScript types yet
      const ndef = new NDEFReader();
      
      const timestamp = Date.now();
      const signature = generateSignature(userId, timestamp);
      
      const paymentData: NFCPaymentData = {
        userId,
        sessionToken,
        timestamp,
        signature
      };
      
      const encryptedData = encryptPayload(paymentData);
      
      await ndef.write({
        records: [
          {
            recordType: "text",
            data: encryptedData
          },
          {
            recordType: "url",
            data: `jointvibe://nfc-pay/${encryptedData.substring(0, 32)}`
          }
        ]
      }, { signal: abortControllerRef.current.signal });

      toast({
        title: "Ready to Pay",
        description: "Hold your phone near the payment device"
      });
      
      return true;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('NFC broadcast error:', error);
        toast({
          title: "NFC Error",
          description: error.message || "Failed to start NFC. Please try QR code.",
          variant: "destructive"
        });
      }
      setIsBroadcasting(false);
      setIsNFCActive(false);
      return false;
    }
  }, [encryptPayload, generateSignature]);

  // Employee mode: Receive payment from customer
  const startReceiving = useCallback(async (
    onReceive: (data: NFCReceiveData) => void
  ): Promise<boolean> => {
    if (!isWebNFCSupported) {
      toast({
        title: "NFC Not Supported",
        description: "Your device doesn't support NFC. Please use QR code instead.",
        variant: "destructive"
      });
      return false;
    }

    try {
      setIsReceiving(true);
      setIsNFCActive(true);
      
      abortControllerRef.current = new AbortController();
      
      // @ts-ignore - NDEFReader is not in TypeScript types yet
      const ndef = new NDEFReader();
      
      await ndef.scan({ signal: abortControllerRef.current.signal });
      
      ndef.addEventListener("reading", ({ message }: any) => {
        for (const record of message.records) {
          if (record.recordType === "text") {
            const decoder = new TextDecoder();
            const encryptedData = decoder.decode(record.data);
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
      });

      toast({
        title: "Ready to Receive",
        description: "Ask customer to tap their phone here"
      });
      
      return true;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('NFC receive error:', error);
        toast({
          title: "NFC Error",
          description: error.message || "Failed to start NFC receiver",
          variant: "destructive"
        });
      }
      setIsReceiving(false);
      setIsNFCActive(false);
      return false;
    }
  }, [decryptPayload, generateSignature]);

  // Stop NFC operations
  const stopNFC = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsBroadcasting(false);
    setIsReceiving(false);
    setIsNFCActive(false);
  }, []);

  return {
    isNFCSupported,
    isNFCActive,
    isBroadcasting,
    isReceiving,
    startBroadcast,
    startReceiving,
    stopNFC,
    encryptPayload,
    decryptPayload
  };
};
