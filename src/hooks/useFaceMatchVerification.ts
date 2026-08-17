import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FaceMatchResult {
  success: boolean;
  verified: boolean;
  extracted_name?: string;
  extracted_dob?: string;
  verified_age?: number;
  is_18_plus: boolean;
  is_21_plus: boolean;
  face_match_confidence: number;
  liveness_score: number;
  message: string;
}

interface EdgeFunctionError {
  function_name: string;
  http_status: number;
  error_body: string;
  timestamp: string;
}

export function useFaceMatchVerification() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<FaceMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<EdgeFunctionError | null>(null);

  const verifyFaceMatch = useCallback(async (
    userId: string,
    documentFrontUrl: string,
    selfieUrl: string,
    documentType: 'drivers_license' | 'passport' | 'age_card',
    extractedName?: string,
    extractedDob?: string,
    documentBackUrl?: string
  ): Promise<FaceMatchResult | null> => {
    setIsVerifying(true);
    setError(null);
    setLastError(null);

    const requestPayload = {
      user_id: userId,
      document_front_url: documentFrontUrl,
      document_back_url: documentBackUrl,
      selfie_url: selfieUrl,
      document_type: documentType,
      extracted_name: extractedName,
      extracted_dob: extractedDob
    };

    console.log('[useFaceMatchVerification] Starting face match verification');
    console.log('[useFaceMatchVerification] User ID:', userId);
    console.log('[useFaceMatchVerification] Document Type:', documentType);
    console.log('[useFaceMatchVerification] Document Front URL:', documentFrontUrl);
    console.log('[useFaceMatchVerification] Selfie URL:', selfieUrl?.substring(0, 100) + '...');
    console.log('[useFaceMatchVerification] Extracted Name:', extractedName || 'N/A');
    console.log('[useFaceMatchVerification] Extracted DOB:', extractedDob || 'N/A');
    console.log('[useFaceMatchVerification] Request Payload (truncated selfie):', JSON.stringify({
      ...requestPayload,
      selfie_url: selfieUrl?.substring(0, 50) + '...'
    }, null, 2));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const errorMsg = 'Not authenticated - no active session';
        console.error('[useFaceMatchVerification] ERROR:', errorMsg);
        setLastError({
          function_name: 'verify-identity',
          http_status: 401,
          error_body: errorMsg,
          timestamp: new Date().toISOString()
        });
        throw new Error(errorMsg);
      }

      console.log('[useFaceMatchVerification] Session found, calling verify-identity edge function...');
      const startTime = Date.now();

      const response = await supabase.functions.invoke('verify-identity', {
        body: requestPayload
      });

      const duration = Date.now() - startTime;
      console.log(`[useFaceMatchVerification] Edge function responded in ${duration}ms`);

      if (response.error) {
        const errorInfo: EdgeFunctionError = {
          function_name: 'verify-identity',
          http_status: response.error.status || 500,
          error_body: response.error.message || JSON.stringify(response.error),
          timestamp: new Date().toISOString()
        };
        console.error('[useFaceMatchVerification] Edge function ERROR:', errorInfo);
        setLastError(errorInfo);
        throw new Error(`Edge function failed: ${response.error.message}`);
      }

      console.log('[useFaceMatchVerification] Edge function SUCCESS response:', JSON.stringify(response.data, null, 2));

      const data = response.data as FaceMatchResult;
      setResult(data);

      if (data.verified) {
        console.log('[useFaceMatchVerification] ✅ FACE MATCH VERIFIED');
        console.log('[useFaceMatchVerification] Face match confidence:', data.face_match_confidence);
        console.log('[useFaceMatchVerification] Liveness score:', data.liveness_score);
        toast.success('Face verified successfully!');
      } else {
        console.log('[useFaceMatchVerification] ❌ FACE MATCH FAILED:', data.message);
        toast.error(data.message || 'Face verification failed');
      }

      return data;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to verify face';
      console.error('[useFaceMatchVerification] EXCEPTION:', errorMessage);
      setError(errorMessage);
      toast.error(`Face Match Error: ${errorMessage}`);
      return null;
    } finally {
      setIsVerifying(false);
      console.log('[useFaceMatchVerification] Verification complete');
    }
  }, []);

  return {
    verifyFaceMatch,
    isVerifying,
    result,
    error,
    lastError
  };
}
