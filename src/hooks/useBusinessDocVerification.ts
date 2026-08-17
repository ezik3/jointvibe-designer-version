import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BusinessDocVerificationResult {
  success: boolean;
  status: 'approved' | 'needs_review' | 'rejected';
  extracted: {
    business_name?: string;
    address?: string;
    city?: string;
    issue_date?: string;
    account_number?: string;
  };
  matching: {
    address_match_score: number;
    business_name_match_score: number;
    venue_address: string;
    venue_name: string;
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

export function useBusinessDocVerification() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<BusinessDocVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<EdgeFunctionError | null>(null);

  const verifyBusinessDocument = useCallback(async (
    venueId: string,
    documentUrl: string,
    documentType: 'utility_bill' | 'business_registration' | 'liquor_license' | 'lease_agreement' | 'tax_certificate'
  ): Promise<BusinessDocVerificationResult | null> => {
    setIsVerifying(true);
    setError(null);
    setLastError(null);

    const requestPayload = {
      venue_id: venueId,
      document_url: documentUrl,
      document_type: documentType
    };

    console.log('[useBusinessDocVerification] Starting business doc verification');
    console.log('[useBusinessDocVerification] Venue ID:', venueId);
    console.log('[useBusinessDocVerification] Document Type:', documentType);
    console.log('[useBusinessDocVerification] Document URL:', documentUrl);
    console.log('[useBusinessDocVerification] Request Payload:', JSON.stringify(requestPayload, null, 2));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const errorMsg = 'Not authenticated - no active session';
        console.error('[useBusinessDocVerification] ERROR:', errorMsg);
        setLastError({
          function_name: 'verify-business-docs',
          http_status: 401,
          error_body: errorMsg,
          timestamp: new Date().toISOString()
        });
        throw new Error(errorMsg);
      }

      console.log('[useBusinessDocVerification] Session found, calling verify-business-docs edge function...');
      const startTime = Date.now();

      const response = await supabase.functions.invoke('verify-business-docs', {
        body: requestPayload
      });

      const duration = Date.now() - startTime;
      console.log(`[useBusinessDocVerification] Edge function responded in ${duration}ms`);

      if (response.error) {
        const errorInfo: EdgeFunctionError = {
          function_name: 'verify-business-docs',
          http_status: response.error.status || 500,
          error_body: response.error.message || JSON.stringify(response.error),
          timestamp: new Date().toISOString()
        };
        console.error('[useBusinessDocVerification] Edge function ERROR:', errorInfo);
        setLastError(errorInfo);
        throw new Error(`Edge function failed: ${response.error.message}`);
      }

      console.log('[useBusinessDocVerification] Edge function SUCCESS response:', JSON.stringify(response.data, null, 2));

      const data = response.data as BusinessDocVerificationResult;
      setResult(data);

      if (data.status === 'approved') {
        console.log('[useBusinessDocVerification] ✅ DOCUMENT APPROVED');
        toast.success('Document verified successfully!');
      } else if (data.status === 'needs_review') {
        console.log('[useBusinessDocVerification] ⏳ NEEDS REVIEW');
        toast.info('Document submitted for review');
      } else {
        console.log('[useBusinessDocVerification] ❌ VERIFICATION FAILED:', data.failure_reason);
        toast.error(data.failure_reason || 'Verification failed');
      }

      return data;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to verify document';
      console.error('[useBusinessDocVerification] EXCEPTION:', errorMessage);
      setError(errorMessage);
      toast.error(`Business Doc Verification Error: ${errorMessage}`);
      return null;
    } finally {
      setIsVerifying(false);
      console.log('[useBusinessDocVerification] Verification complete');
    }
  }, []);

  return {
    verifyBusinessDocument,
    isVerifying,
    result,
    error,
    lastError
  };
}
