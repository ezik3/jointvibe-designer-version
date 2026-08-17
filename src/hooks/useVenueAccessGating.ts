import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface VenueAccessResult {
  canAccess: boolean;
  reason?: string;
  requiredAge?: number;
}

export function useVenueAccessGating() {
  const { user } = useAuth();
  const [isVerified, setIsVerified] = useState(false);
  const [is18Plus, setIs18Plus] = useState(false);
  const [is21Plus, setIs21Plus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasIdVerification, setHasIdVerification] = useState(false);

  // Fetch user's verification status
  const fetchVerificationStatus = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_verification')
        .select('overall_status, is_18_plus, is_21_plus, is_age_verified, document_status')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching verification:', error);
      }

      if (data) {
        setIsVerified(data.overall_status === 'verified');
        setIs18Plus(data.is_18_plus || false);
        setIs21Plus(data.is_21_plus || false);
        setHasIdVerification(data.document_status === 'verified');
      }
    } catch (error) {
      console.error('Verification fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchVerificationStatus();
  }, [fetchVerificationStatus]);

  /**
   * Check if user can access a specific venue based on age requirements
   * @param venueId - The venue ID to check access for
   * @returns VenueAccessResult indicating if access is allowed and why not if denied
   */
  const checkVenueAccess = useCallback(async (venueId: string): Promise<VenueAccessResult> => {
    if (!user) {
      return { canAccess: false, reason: 'Please log in to access this venue' };
    }

    try {
      // Fetch venue's age requirements
      const { data: venue, error } = await supabase
        .from('venues')
        .select('requires_id_verification, name')
        .eq('id', venueId)
        .single();

      if (error) {
        console.error('Error fetching venue:', error);
        return { canAccess: true }; // Default to allowing access if venue fetch fails
      }

      // If venue doesn't require ID verification, allow access
      if (!venue?.requires_id_verification) {
        return { canAccess: true };
      }

      // Venue requires ID verification
      if (!hasIdVerification) {
        return { 
          canAccess: false, 
          reason: `${venue.name} requires age verification. Please verify your ID to access this venue.`,
          requiredAge: 18
        };
      }

      // Check age requirements (default to 18+ for venues requiring verification)
      if (!is18Plus) {
        return { 
          canAccess: false, 
          reason: `You must be 18 or older to access ${venue.name}`,
          requiredAge: 18
        };
      }

      return { canAccess: true };
    } catch (error) {
      console.error('Error checking venue access:', error);
      return { canAccess: true }; // Default to allowing on error
    }
  }, [user, hasIdVerification, is18Plus]);

  /**
   * Check if user can access 18+ content
   */
  const canAccess18Plus = useCallback((): boolean => {
    return isVerified && is18Plus && hasIdVerification;
  }, [isVerified, is18Plus, hasIdVerification]);

  /**
   * Check if user can access 21+ content (alcohol venues in US)
   */
  const canAccess21Plus = useCallback((): boolean => {
    return isVerified && is21Plus && hasIdVerification;
  }, [isVerified, is21Plus, hasIdVerification]);

  /**
   * Check if user has facial recognition for wallet security
   * (Can be done without ID)
   */
  const hasFacialRecognition = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase
        .from('user_verification')
        .select('face_status, selfie_url')
        .eq('user_id', user.id)
        .single();

      if (error) return false;
      return data?.face_status === 'verified' && !!data?.selfie_url;
    } catch {
      return false;
    }
  }, [user]);

  return {
    isLoading,
    isVerified,
    is18Plus,
    is21Plus,
    hasIdVerification,
    checkVenueAccess,
    canAccess18Plus,
    canAccess21Plus,
    hasFacialRecognition,
    refetch: fetchVerificationStatus
  };
}