import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ReferralCode {
  id: string;
  code: string;
  owner_type: 'user' | 'venue';
  owner_id: string;
  is_active: boolean;
  created_at: string;
}

const REFERRAL_STORAGE_KEY = 'jv_referral_code';
const PRODUCTION_URL = 'https://www.jointvibe.app';

export const useReferralCode = () => {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [loading, setLoading] = useState(true);

  // Capture referral code from URL and store in localStorage
  const captureReferralFromURL = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    
    if (ref && ref.startsWith('JV-')) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
      return ref;
    }
    return null;
  }, []);

  // Get stored referral code
  const getStoredReferral = useCallback(() => {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  }, []);

  // Clear stored referral after use
  const clearStoredReferral = useCallback(() => {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  }, []);

  // Fetch user's own referral code
  const fetchUserReferralCode = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('owner_type', 'user')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching referral code:', error);
        setLoading(false);
        return null;
      }

      if (data) {
        setReferralCode(data as ReferralCode);
      }
      setLoading(false);
      return data as ReferralCode | null;
    } catch (error) {
      console.error('Error fetching referral code:', error);
      setLoading(false);
      return null;
    }
  }, [user]);

  // Copy referral link to clipboard
  const copyReferralLink = useCallback(async () => {
    if (!referralCode) return false;
    
    const link = `${PRODUCTION_URL}/?ref=${referralCode.code}`;
    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch (error) {
      console.error('Failed to copy:', error);
      return false;
    }
  }, [referralCode]);

  // Get full referral link
  const getReferralLink = useCallback(() => {
    if (!referralCode) return '';
    return `${PRODUCTION_URL}/?ref=${referralCode.code}`;
  }, [referralCode]);

  // Validate a referral code
  const validateReferralCode = useCallback(async (code: string) => {
    try {
      const { data, error } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) {
        return { valid: false, code: null };
      }

      return { valid: true, code: data as ReferralCode };
    } catch (error) {
      console.error('Error validating referral code:', error);
      return { valid: false, code: null };
    }
  }, []);

  useEffect(() => {
    // Try to capture from URL on mount
    captureReferralFromURL();
    
    // Fetch user's referral code if logged in
    if (user) {
      fetchUserReferralCode();
    } else {
      setLoading(false);
    }
  }, [user, captureReferralFromURL, fetchUserReferralCode]);

  return {
    referralCode,
    loading,
    captureReferralFromURL,
    getStoredReferral,
    clearStoredReferral,
    fetchUserReferralCode,
    copyReferralLink,
    getReferralLink,
    validateReferralCode
  };
};
