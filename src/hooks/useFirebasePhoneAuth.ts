import { useState, useCallback, useRef } from 'react';
// Type-only imports are erased at compile time — zero runtime cost.
import type { RecaptchaVerifier, ConfirmationResult } from 'firebase/auth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Firebase SDK (~100-150 KB) is dynamically imported the first time
 * sendOTP() is called — i.e. when the user submits their phone number.
 * The VerifyPhone page renders with zero Firebase overhead.
 */
export function useFirebasePhoneAuth() {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef    = useRef<RecaptchaVerifier | null>(null);

  /** Dynamically load Firebase Auth and the app's auth instance. */
  const getFirebaseAuth = useCallback(async () => {
    const { firebaseAuth } = await import('@/lib/firebase');
    return firebaseAuth;
  }, []);

  /** Create a fresh invisible reCAPTCHA verifier every time. */
  const createFreshRecaptcha = useCallback(async () => {
    // Always destroy any previous verifier so we never reuse a stale token.
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch { /* ignore */ }
      recaptchaRef.current = null;
      console.log('[Firebase] Previous reCAPTCHA cleared');
    }

    const [{ RecaptchaVerifier: RV }, auth] = await Promise.all([
      import('firebase/auth'),
      getFirebaseAuth(),
    ]);

    const verifier = new RV(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => { console.log('[Firebase] reCAPTCHA solved'); },
      'expired-callback': () => {
        console.warn('[Firebase] reCAPTCHA expired');
        recaptchaRef.current = null;
      },
    });

    await verifier.render();
    console.log('[Firebase] Fresh reCAPTCHA rendered');
    recaptchaRef.current = verifier;
    return verifier;
  }, [getFirebaseAuth]);

  const sendOTP = useCallback(async (phoneNumber: string) => {
    setLoading(true);
    setError(null);
    try {
      const verifier = await createFreshRecaptcha();

      const [{ signInWithPhoneNumber }, auth] = await Promise.all([
        import('firebase/auth'),
        getFirebaseAuth(),
      ]);

      console.log('[Firebase] Calling signInWithPhoneNumber for', phoneNumber);
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      console.log('[Firebase] confirmationResult received:', !!confirmation);

      confirmationRef.current = confirmation;
      // Only advance UI after we have a real confirmationResult
      setCodeSent(true);
    } catch (err: any) {
      console.error('[Firebase] sendOTP error:', err?.code, err?.message, err);
      setError(err.message || 'Failed to send verification code');
      // Clean up so next attempt gets a fresh verifier
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch { /* ignore */ }
        recaptchaRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  }, [createFreshRecaptcha, getFirebaseAuth]);

  const verifyOTP = useCallback(async (code: string, phoneNumber: string) => {
    if (!confirmationRef.current) {
      setError('No verification in progress. Please request a new code.');
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      await confirmationRef.current.confirm(code);

      // OTP verified — tell Supabase to mark the phone as verified.
      const { error: fnError } = await supabase.functions.invoke(
        'confirm-phone-verified',
        { body: { phone_number: phoneNumber } },
      );
      if (fnError) throw fnError;

      setVerified(true);
      return true;
    } catch (err: any) {
      console.error('Firebase verifyOTP error:', err);
      setError(err.message || 'Invalid verification code');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetState = useCallback(() => {
    setCodeSent(false);
    setVerified(false);
    setError(null);
    confirmationRef.current = null;
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch { /* ignore */ }
      recaptchaRef.current = null;
    }
  }, []);

  return { sendOTP, verifyOTP, resetState, loading, error, codeSent, verified };
}
