import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SecurityStatus {
  pin_set: boolean;
  face_enabled: boolean;
  face_threshold: 'every' | 'over_50' | 'over_100' | 'never';
  has_enrolled_selfie: boolean;
  trusted_device_count: number;
}

interface VerificationResult {
  success: boolean;
  verified: boolean;
  method?: string;
  error?: string;
  message?: string;
  locked_until?: string;
  attempts?: number;
  cached?: boolean;
}

const VERIFICATION_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getDeviceId(): string {
  const key = 'jv_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function usePaymentSecurity() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const lastVerifiedAt = useRef<number | null>(null);

  const isRecentlyVerified = useCallback((): boolean => {
    if (!lastVerifiedAt.current) return false;
    return (Date.now() - lastVerifiedAt.current) < VERIFICATION_CACHE_DURATION;
  }, []);

  const checkPinStatus = useCallback(async (): Promise<SecurityStatus | null> => {
    if (!user) {
      setStatus(null);
      return null;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('manage-payment-pin', {
        body: { action: 'check_status' },
      });
      if (error) throw error;
      setStatus(data);
      return data;
    } catch (e) {
      console.error('Failed to check PIN status:', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      setStatus(null);
      setLoading(false);
      return;
    }

    checkPinStatus();
  }, [authLoading, user, checkPinStatus]);

  const setupPin = useCallback(async (pin: string): Promise<VerificationResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-payment-pin', {
        body: { action: 'setup', pin },
      });
      if (error) throw error;
      if (data.error) return { success: false, verified: false, error: data.error, message: data.message };
      await checkPinStatus();
      return { success: true, verified: true };
    } catch (e: any) {
      return { success: false, verified: false, error: 'setup_failed', message: e.message };
    }
  }, [checkPinStatus]);

  const verifyPin = useCallback(async (pin: string): Promise<VerificationResult> => {
    // Check cache first — skip verification if recently verified
    if (isRecentlyVerified()) {
      return { success: true, verified: true, method: 'cached', cached: true };
    }

    try {
      const { data, error } = await supabase.functions.invoke('manage-payment-pin', {
        body: { action: 'verify', pin },
      });
      if (error) throw error;
      if (data.error) return { success: false, verified: false, ...data };
      // Cache successful verification
      lastVerifiedAt.current = Date.now();
      return { success: true, verified: true, method: 'pin' };
    } catch (e: any) {
      return { success: false, verified: false, error: 'verify_failed', message: e.message };
    }
  }, [isRecentlyVerified]);

  const changePin = useCallback(async (currentPin: string, newPin: string): Promise<VerificationResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-payment-pin', {
        body: { action: 'change', pin: currentPin, new_pin: newPin },
      });
      if (error) throw error;
      if (data.error) return { success: false, verified: false, ...data };
      return { success: true, verified: true };
    } catch (e: any) {
      return { success: false, verified: false, error: 'change_failed', message: e.message };
    }
  }, []);

  const verifyFace = useCallback(async (selfieBase64: string, amount: number): Promise<VerificationResult> => {
    // Check cache first
    if (isRecentlyVerified()) {
      return { success: true, verified: true, method: 'cached', cached: true };
    }

    try {
      const { data, error } = await supabase.functions.invoke('verify-payment-face', {
        body: { selfie_base64: selfieBase64, transaction_amount: amount, device_id: getDeviceId() },
      });
      if (error) throw error;
      if (data.error) return { success: false, verified: false, ...data };
      // Cache successful verification
      lastVerifiedAt.current = Date.now();
      return { success: true, verified: true, method: data.method || 'face' };
    } catch (e: any) {
      return { success: false, verified: false, error: 'face_failed', message: e.message };
    }
  }, [isRecentlyVerified]);

  const requireVerification = useCallback((amount: number): 'none' | 'pin_only' | 'pin_and_face' => {
    // If recently verified, no verification needed (5-min cache)
    if (isRecentlyVerified()) return 'none';

    if (!status?.face_enabled) return 'pin_only';
    switch (status.face_threshold) {
      case 'every': return 'pin_and_face';
      case 'over_50': return amount >= 50 ? 'pin_and_face' : 'pin_only';
      case 'over_100': return amount >= 100 ? 'pin_and_face' : 'pin_only';
      default: return 'pin_only';
    }
  }, [status, isRecentlyVerified]);

  // Clear cache (e.g., on logout or manual lock)
  const clearVerificationCache = useCallback(() => {
    lastVerifiedAt.current = null;
  }, []);

  return {
    status,
    loading,
    deviceId: getDeviceId(),
    checkPinStatus,
    setupPin,
    verifyPin,
    changePin,
    verifyFace,
    requireVerification,
    isRecentlyVerified,
    clearVerificationCache,
    isPinSet: status?.pin_set ?? false,
    isFaceEnabled: status?.face_enabled ?? false,
  };
}
