import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VerificationData {
  id: string;
  user_id: string;
  document_type: 'drivers_license' | 'passport' | 'age_card' | null;
  document_front_url: string | null;
  document_back_url: string | null;
  extracted_name: string | null;
  extracted_dob: string | null;
  selfie_url: string | null;
  face_match_confidence: number | null;
  liveness_score: number | null;
  document_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  face_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  overall_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  is_age_verified: boolean;
  is_18_plus: boolean;
  is_21_plus: boolean;
  verified_age: number | null;
  rejection_reason: string | null;
}

export function useVerificationStatus() {
  const [verification, setVerification] = useState<VerificationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVerification = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setVerification(null);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('user_verification')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      setVerification(data as VerificationData | null);
    } catch (err) {
      console.error('Error fetching verification:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createVerification = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_verification')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      setVerification(data as VerificationData);
      return data;
    } catch (err) {
      console.error('Error creating verification:', err);
      throw err;
    }
  }, []);

  const updateVerification = useCallback(async (updates: Partial<VerificationData>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_verification')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      setVerification(data as VerificationData);
      return data;
    } catch (err) {
      console.error('Error updating verification:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchVerification();
  }, [fetchVerification]);

  const isVerified = verification?.overall_status === 'verified';
  const isPending = verification?.overall_status === 'pending';
  const isRejected = verification?.overall_status === 'rejected';
  const canAccess18Plus = verification?.is_18_plus === true;
  const canAccess21Plus = verification?.is_21_plus === true;

  return {
    verification,
    isLoading,
    error,
    isVerified,
    isPending,
    isRejected,
    canAccess18Plus,
    canAccess21Plus,
    fetchVerification,
    createVerification,
    updateVerification
  };
}
