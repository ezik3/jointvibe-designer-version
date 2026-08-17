import { useState, useCallback } from 'react';
import { useBLEPayment, BLETerminal, BLEAdvertiseData } from './useBLEPayment';
import { useNFCPayment } from './useNFCPayment';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

export type ProximityMethod = 'ble' | 'nfc' | 'qr';

export interface ProximityPaymentState {
  isAvailable: boolean;
  preferredMethod: ProximityMethod;
  supportedMethods: ProximityMethod[];
}

export interface ProximityToken {
  token: string;
  expiresAt: Date;
  paymentRequestId: string;
}

export function useProximityPayment() {
  const ble = useBLEPayment();
  const nfc = useNFCPayment();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentToken, setCurrentToken] = useState<ProximityToken | null>(null);

  // Determine available methods and preferred one
  const getPaymentState = useCallback((): ProximityPaymentState => {
    const supportedMethods: ProximityMethod[] = ['qr']; // QR always available
    
    if (ble.isBLESupported && ble.isBLEEnabled) {
      supportedMethods.unshift('ble'); // BLE preferred on iOS
    }
    
    if (nfc.isNFCSupported) {
      supportedMethods.push('nfc'); // NFC for Android
    }
    
    // Prefer BLE on iOS (since NFC has restrictions), NFC on Android
    const preferredMethod = supportedMethods.includes('ble') 
      ? 'ble' 
      : supportedMethods.includes('nfc') 
        ? 'nfc' 
        : 'qr';
    
    return {
      isAvailable: supportedMethods.length > 1, // More than just QR
      preferredMethod,
      supportedMethods,
    };
  }, [ble.isBLESupported, ble.isBLEEnabled, nfc.isNFCSupported]);

  // Staff: Create a proximity token for payment request
  const createProximityToken = async (
    paymentRequestId: string,
    expirySeconds: number = 30
  ): Promise<ProximityToken | null> => {
    try {
      const token = uuidv4().replace(/-/g, '').substring(0, 16); // Short token
      const expiresAt = new Date(Date.now() + expirySeconds * 1000);
      
      // Update payment request with proximity token
      const { error } = await supabase
        .from('payment_requests')
        .update({
          proximity_token: token,
          proximity_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', paymentRequestId);
      
      if (error) throw error;
      
      const proximityToken: ProximityToken = {
        token,
        expiresAt,
        paymentRequestId,
      };
      
      setCurrentToken(proximityToken);
      return proximityToken;
    } catch (err) {
      console.error('Failed to create proximity token:', err);
      return null;
    }
  };

  // Staff: Start accepting payments via BLE
  const startAccepting = async (
    data: Omit<BLEAdvertiseData, 'proximityToken'> & { paymentRequestId: string }
  ): Promise<boolean> => {
    try {
      // Create proximity token
      const token = await createProximityToken(data.paymentRequestId);
      if (!token) {
        return false;
      }
      
      // Get venue VPK
      const vpk = await ble.getVenueVPK(data.venueId);
      if (!vpk) {
        console.error('Failed to get venue VPK');
        return false;
      }
      
      // Start BLE advertising
      const success = await ble.startAdvertising({
        ...data,
        vpkShort: vpk.substring(0, 8),
        proximityToken: token.token,
      });
      
      return success;
    } catch (err) {
      console.error('Failed to start accepting:', err);
      return false;
    }
  };

  // Staff: Stop accepting payments
  const stopAccepting = async () => {
    await ble.stopAdvertising();
    setCurrentToken(null);
  };

  // Customer: Start scanning for nearby terminals
  const startPaying = async (
    venueId: string,
    onTerminalFound?: (terminal: BLETerminal) => void
  ): Promise<boolean> => {
    try {
      // Get venue VPK (customer must be checked in)
      const vpk = await ble.getVenueVPK(venueId);
      if (!vpk) {
        console.error('Failed to get venue VPK - are you checked in?');
        return false;
      }
      
      // Start scanning with venue-scoped VPK
      return await ble.startScanning(vpk, onTerminalFound);
    } catch (err) {
      console.error('Failed to start paying:', err);
      return false;
    }
  };

  // Customer: Stop scanning
  const stopPaying = async () => {
    await ble.stopScanning();
  };

  // Customer: Complete payment to selected terminal
  const completePayment = async (
    terminal: BLETerminal
  ): Promise<{ success: boolean; error?: string; transaction_id?: string }> => {
    setIsProcessing(true);
    try {
      const result = await ble.processProximityPayment(
        terminal.proximityToken,
        terminal.vpkShort
      );
      return result;
    } finally {
      setIsProcessing(false);
    }
  };

  // Fallback: Generate QR code URL for payment
  const getQRFallbackUrl = (paymentRequestId: string, qrToken: string): string => {
    const origin = window.location.origin;
    return `${origin}/app/pay/${qrToken}`;
  };

  // Generate 2-digit confirmation code for crowded venues
  const generateConfirmationCode = (): string => {
    return Math.floor(10 + Math.random() * 90).toString();
  };

  return {
    // State
    paymentState: getPaymentState(),
    nearbyTerminals: ble.nearbyTerminals,
    isScanning: ble.isScanning,
    isAdvertising: ble.isAdvertising,
    isProcessing,
    currentToken,
    error: ble.error,
    
    // Staff actions
    startAccepting,
    stopAccepting,
    createProximityToken,
    
    // Customer actions
    startPaying,
    stopPaying,
    completePayment,
    
    // Utilities
    getClosestTerminal: ble.getClosestTerminal,
    getQRFallbackUrl,
    generateConfirmationCode,
    
    // Direct access to underlying hooks if needed
    ble,
    nfc,
  };
}
