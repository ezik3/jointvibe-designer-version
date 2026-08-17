import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// BLE Service UUID for JV Payments
const JV_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const JV_CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

export interface BLETerminal {
  deviceId: string;
  terminalName: string;
  venueId: string;
  vpkShort: string;
  proximityToken: string;
  amount: number;
  rssi: number;
  distance?: number; // UWB distance in meters if available
}

export interface BLEAdvertiseData {
  venueId: string;
  terminalId: string;
  terminalName: string;
  vpkShort: string;
  proximityToken: string;
  amount: number;
}

export function useBLEPayment() {
  const [isBLESupported, setIsBLESupported] = useState(false);
  const [isBLEEnabled, setIsBLEEnabled] = useState(false);
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [nearbyTerminals, setNearbyTerminals] = useState<BLETerminal[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const blePluginRef = useRef<any>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkBLESupport();
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      stopAll();
    };
  }, []);

  const checkBLESupport = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Native platform - use Capacitor BLE plugin
        const { BleClient } = await import('@capacitor-community/bluetooth-le');
        blePluginRef.current = BleClient;
        
        await BleClient.initialize();
        const enabled = await BleClient.isEnabled();
        setIsBLESupported(true);
        setIsBLEEnabled(enabled);
      } else {
        // Web platform - check for Web Bluetooth API
        if ('bluetooth' in navigator) {
          setIsBLESupported(true);
          // Web Bluetooth doesn't have a direct "isEnabled" check
          setIsBLEEnabled(true);
        } else {
          setIsBLESupported(false);
          setIsBLEEnabled(false);
        }
      }
    } catch (err) {
      console.error('BLE support check failed:', err);
      setIsBLESupported(false);
      setIsBLEEnabled(false);
    }
  };

  const requestBLEPermission = async (): Promise<boolean> => {
    try {
      if (Capacitor.isNativePlatform() && blePluginRef.current) {
        await blePluginRef.current.requestLEScan({ services: [JV_SERVICE_UUID] });
        return true;
      } else if ('bluetooth' in navigator) {
        // Web Bluetooth requires user gesture
        return true;
      }
      return false;
    } catch (err) {
      console.error('BLE permission request failed:', err);
      setError('Bluetooth permission denied');
      return false;
    }
  };

  // Staff: Start advertising payment request
  const startAdvertising = async (data: BLEAdvertiseData): Promise<boolean> => {
    try {
      setError(null);
      
      if (!isBLESupported || !isBLEEnabled) {
        setError('Bluetooth is not available');
        return false;
      }

      // Create compact payload for BLE advertisement
      // Format: JV|vpk|terminal|token|amount
      const payload = `JV|${data.vpkShort}|${data.terminalId.substring(0, 8)}|${data.proximityToken}|${data.amount}`;
      
      if (Capacitor.isNativePlatform() && blePluginRef.current) {
        // Native advertising using Capacitor
        // Note: Full peripheral mode advertising may require additional native setup
        console.log('Starting BLE advertisement:', payload);
        setIsAdvertising(true);
        
        // Store the advertise data for the native layer
        // In production, this would use native peripheral mode
        localStorage.setItem('jv_ble_advertise', JSON.stringify({
          ...data,
          payload,
          startedAt: Date.now()
        }));
        
        return true;
      } else {
        // Web platform - limited advertising support
        // Fall back to WebSocket-based discovery for web
        console.log('Web BLE advertising not fully supported, using fallback');
        setIsAdvertising(true);
        
        // Store advertise state for polling-based discovery
        localStorage.setItem('jv_ble_advertise', JSON.stringify({
          ...data,
          payload,
          startedAt: Date.now()
        }));
        
        return true;
      }
    } catch (err) {
      console.error('BLE advertising failed:', err);
      setError('Failed to start advertising');
      return false;
    }
  };

  const stopAdvertising = async () => {
    try {
      setIsAdvertising(false);
      localStorage.removeItem('jv_ble_advertise');
      
      if (Capacitor.isNativePlatform() && blePluginRef.current) {
        // Stop native advertising
        console.log('Stopped BLE advertisement');
      }
    } catch (err) {
      console.error('Failed to stop advertising:', err);
    }
  };

  // Customer: Start scanning for nearby terminals
  const startScanning = async (
    venueVpk: string,
    onTerminalFound?: (terminal: BLETerminal) => void
  ): Promise<boolean> => {
    try {
      setError(null);
      setNearbyTerminals([]);
      
      if (!isBLESupported || !isBLEEnabled) {
        setError('Bluetooth is not available');
        return false;
      }

      setIsScanning(true);
      
      if (Capacitor.isNativePlatform() && blePluginRef.current) {
        // Native BLE scanning
        await blePluginRef.current.requestLEScan(
          { services: [JV_SERVICE_UUID] },
          (result: any) => {
            handleScanResult(result, venueVpk, onTerminalFound);
          }
        );
      } else if ('bluetooth' in navigator) {
        // Web Bluetooth scanning
        try {
          const device = await (navigator as any).bluetooth.requestDevice({
            filters: [{ services: [JV_SERVICE_UUID] }],
            optionalServices: [JV_SERVICE_UUID]
          });
          
          if (device) {
            // Connect and read characteristic
            const server = await device.gatt?.connect();
            const service = await server?.getPrimaryService(JV_SERVICE_UUID);
            const characteristic = await service?.getCharacteristic(JV_CHARACTERISTIC_UUID);
            const value = await characteristic?.readValue();
            
            if (value) {
              const decoder = new TextDecoder();
              const payload = decoder.decode(value);
              handlePayloadParse(payload, device.id, -50, venueVpk, onTerminalFound);
            }
          }
        } catch (webErr) {
          console.error('Web Bluetooth scan failed:', webErr);
        }
      }

      // Set timeout to stop scanning after 10 seconds
      scanTimeoutRef.current = setTimeout(() => {
        stopScanning();
      }, 10000);

      return true;
    } catch (err) {
      console.error('BLE scanning failed:', err);
      setError('Failed to scan for terminals');
      setIsScanning(false);
      return false;
    }
  };

  const handleScanResult = (
    result: any,
    venueVpk: string,
    onTerminalFound?: (terminal: BLETerminal) => void
  ) => {
    try {
      // Parse the advertisement data
      const manufacturerData = result.manufacturerData;
      const serviceData = result.serviceData;
      const localName = result.localName;
      
      // Try to extract payload from various sources
      let payload = '';
      if (localName?.startsWith('JV|')) {
        payload = localName;
      } else if (serviceData?.[JV_SERVICE_UUID]) {
        const decoder = new TextDecoder();
        payload = decoder.decode(serviceData[JV_SERVICE_UUID]);
      }
      
      if (payload) {
        handlePayloadParse(payload, result.device.deviceId, result.rssi, venueVpk, onTerminalFound);
      }
    } catch (err) {
      console.error('Error parsing scan result:', err);
    }
  };

  const handlePayloadParse = (
    payload: string,
    deviceId: string,
    rssi: number,
    venueVpk: string,
    onTerminalFound?: (terminal: BLETerminal) => void
  ) => {
    // Parse: JV|vpk|terminal|token|amount
    const parts = payload.split('|');
    if (parts.length >= 5 && parts[0] === 'JV') {
      const [, vpkShort, terminalId, proximityToken, amountStr] = parts;
      
      // Only show terminals matching the venue VPK
      if (vpkShort === venueVpk.substring(0, 8)) {
        const terminal: BLETerminal = {
          deviceId,
          terminalName: `Terminal ${terminalId}`,
          venueId: '', // Will be resolved server-side
          vpkShort,
          proximityToken,
          amount: parseFloat(amountStr),
          rssi,
        };
        
        setNearbyTerminals(prev => {
          // Update or add terminal
          const existing = prev.findIndex(t => t.deviceId === deviceId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = terminal;
            return updated.sort((a, b) => b.rssi - a.rssi); // Sort by signal strength
          }
          return [...prev, terminal].sort((a, b) => b.rssi - a.rssi);
        });
        
        onTerminalFound?.(terminal);
      }
    }
  };

  const stopScanning = async () => {
    try {
      setIsScanning(false);
      
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      
      if (Capacitor.isNativePlatform() && blePluginRef.current) {
        await blePluginRef.current.stopLEScan();
      }
    } catch (err) {
      console.error('Failed to stop scanning:', err);
    }
  };

  const stopAll = async () => {
    await stopAdvertising();
    await stopScanning();
  };

  // Get the closest terminal (highest RSSI or shortest UWB distance)
  const getClosestTerminal = useCallback((): BLETerminal | null => {
    if (nearbyTerminals.length === 0) return null;
    
    // Sort by UWB distance first (if available), then RSSI
    const sorted = [...nearbyTerminals].sort((a, b) => {
      if (a.distance !== undefined && b.distance !== undefined) {
        return a.distance - b.distance;
      }
      return b.rssi - a.rssi;
    });
    
    return sorted[0];
  }, [nearbyTerminals]);

  // Get VPK for a venue (customer or staff)
  const getVenueVPK = async (venueId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('get-venue-vpk', {
        body: { venue_id: venueId }
      });
      
      if (error) throw error;
      return data.vpk;
    } catch (err) {
      console.error('Failed to get venue VPK:', err);
      return null;
    }
  };

  // Process payment via proximity
  const processProximityPayment = async (
    proximityToken: string,
    vpk?: string
  ): Promise<{ success: boolean; error?: string; transaction_id?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('process-proximity-payment', {
        body: {
          proximity_token: proximityToken,
          vpk,
          payment_method: 'ble'
        }
      });
      
      if (error) throw error;
      return { success: true, transaction_id: data.transaction_id };
    } catch (err: any) {
      console.error('Proximity payment failed:', err);
      return { success: false, error: err.message || 'Payment failed' };
    }
  };

  return {
    // State
    isBLESupported,
    isBLEEnabled,
    isAdvertising,
    isScanning,
    nearbyTerminals,
    error,
    
    // Actions
    requestBLEPermission,
    startAdvertising,
    stopAdvertising,
    startScanning,
    stopScanning,
    stopAll,
    
    // Utilities
    getClosestTerminal,
    getVenueVPK,
    processProximityPayment,
  };
}
