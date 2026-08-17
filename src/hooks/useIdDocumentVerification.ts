import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface IdVerificationResult {
  success: boolean;
  status: 'approved' | 'needs_review' | 'failed';
  extracted: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    document_number?: string;
    expiry_date?: string;
    country?: string;
    address?: string;
    gender?: string;
  };
  computed: {
    age?: number;
    is_18_plus: boolean;
    is_21_plus: boolean;
    is_expired: boolean;
  };
  confidence: number;
  failure_reason?: string;
  message: string;
}

interface EdgeFunctionError {
  function_name: string;
  http_status: number;
  error_body: string;
  timestamp: string;
}

export function useIdDocumentVerification() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<IdVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<EdgeFunctionError | null>(null);

  const verifyIdDocument = useCallback(async (
    userId: string,
    documentFrontUrl: string,
    documentType: 'drivers_license' | 'passport' | 'age_card',
    documentBackUrl?: string
  ): Promise<IdVerificationResult | null> => {
    setIsVerifying(true);
    setError(null);
    setLastError(null);

    const requestPayload = {
      user_id: userId,
      document_front_url: documentFrontUrl,
      document_back_url: documentBackUrl,
      document_type: documentType
    };

    console.log('[useIdDocumentVerification] Starting ID verification');
    console.log('[useIdDocumentVerification] User ID:', userId);
    console.log('[useIdDocumentVerification] Document Type:', documentType);
    console.log('[useIdDocumentVerification] Front URL:', documentFrontUrl);
    console.log('[useIdDocumentVerification] Back URL:', documentBackUrl || 'N/A');
    console.log('[useIdDocumentVerification] Request Payload:', JSON.stringify(requestPayload, null, 2));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const errorMsg = 'Not authenticated - no active session';
        console.error('[useIdDocumentVerification] ERROR:', errorMsg);
        setLastError({
          function_name: 'verify-id-document',
          http_status: 401,
          error_body: errorMsg,
          timestamp: new Date().toISOString()
        });
        throw new Error(errorMsg);
      }

      console.log('[useIdDocumentVerification] Session found, calling verify-id-document edge function...');
      const startTime = Date.now();

      const response = await supabase.functions.invoke('verify-id-document', {
        body: requestPayload
      });

      const duration = Date.now() - startTime;
      console.log(`[useIdDocumentVerification] Edge function responded in ${duration}ms`);

      if (response.error) {
        const errorInfo: EdgeFunctionError = {
          function_name: 'verify-id-document',
          http_status: response.error.status || 500,
          error_body: response.error.message || JSON.stringify(response.error),
          timestamp: new Date().toISOString()
        };
        console.error('[useIdDocumentVerification] Edge function ERROR:', errorInfo);
        setLastError(errorInfo);
        throw new Error(`Edge function failed: ${response.error.message}`);
      }

      console.log('[useIdDocumentVerification] Edge function SUCCESS response:', JSON.stringify(response.data, null, 2));

      const data = response.data as IdVerificationResult;
      setResult(data);

      if (data.status === 'approved') {
        console.log('[useIdDocumentVerification] ✅ ID APPROVED');
        toast.success('ID verified successfully!');
      } else if (data.status === 'needs_review') {
        console.log('[useIdDocumentVerification] ⏳ NEEDS REVIEW');
        toast.info('Document submitted for review');
      } else {
        console.log('[useIdDocumentVerification] ❌ VERIFICATION FAILED:', data.failure_reason);
        toast.error(data.failure_reason || 'Verification failed');
      }

      return data;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to verify document';
      console.error('[useIdDocumentVerification] EXCEPTION:', errorMessage);
      setError(errorMessage);
      toast.error(`ID Verification Error: ${errorMessage}`);
      return null;
    } finally {
      setIsVerifying(false);
      console.log('[useIdDocumentVerification] Verification complete');
    }
  }, []);

  return {
    verifyIdDocument,
    isVerifying,
    result,
    error,
    lastError
  };
}
