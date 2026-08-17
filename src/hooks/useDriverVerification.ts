import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type DriverMode = 'car' | 'motorcycle' | 'bicycle' | 'runner';

export interface DriverVerificationState {
  driversLicenseUrl: string | null;
  driversLicenseStatus: 'none' | 'pending' | 'verified' | 'rejected';
  idDocumentUrl: string | null;
  idDocumentType: 'drivers_license' | 'passport' | 'age_card' | null;
  idDocumentStatus: 'none' | 'pending' | 'verified' | 'rejected';
  is18Plus: boolean;
  /** OCR-extracted document number from signup verification (preferred prefill) */
  extractedDocumentNumber: string | null;
  /** OCR-extracted full name from signup verification */
  extractedName: string | null;
  /** OCR-extracted DOB from signup verification (ISO date string) */
  extractedDob: string | null;
  /** True when user has completed AWS face match + ID verification at signup */
  signupVerified: boolean;
  /** True when signup verification is awaiting review */
  signupPending: boolean;
}

const defaultState: DriverVerificationState = {
  driversLicenseUrl: null,
  driversLicenseStatus: 'none',
  idDocumentUrl: null,
  idDocumentType: null,
  idDocumentStatus: 'none',
  is18Plus: false,
  extractedDocumentNumber: null,
  extractedName: null,
  extractedDob: null,
  signupVerified: false,
  signupPending: false,
};

export function useDriverVerification() {
  const { user } = useAuth();
  const [state, setState] = useState<DriverVerificationState>(defaultState);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setState(defaultState);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Read both sources in parallel
    const [{ data: dp }, { data: uv }] = await Promise.all([
      supabase
        .from('driver_profiles')
        .select('drivers_license_url, drivers_license_status, id_document_url, id_document_type, id_document_status, is_18_plus')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('user_verification')
        .select('document_type, document_number, extracted_name, extracted_dob, document_status, overall_status, is_18_plus, document_front_url')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const dpAny = (dp ?? {}) as any;
    const uvAny = (uv ?? {}) as any;

    // Signup verification = central AWS Textract + Rekognition pipeline
    const signupOverall = (uvAny.overall_status ?? null) as
      | 'unverified'
      | 'pending'
      | 'verified'
      | 'rejected'
      | null;
    const signupVerified = signupOverall === 'verified';
    const signupPending = signupOverall === 'pending';

    // The signup ID document acts as a *driver's license* for tile-unlock purposes
    // ONLY when the user uploaded a real drivers_license at signup.
    const signupIsLicense = uvAny.document_type === 'drivers_license';

    // Effective license status — most permissive of the two sources
    let driversLicenseStatus: DriverVerificationState['driversLicenseStatus'] =
      (dpAny.drivers_license_status ?? 'none') as DriverVerificationState['driversLicenseStatus'];
    if (signupIsLicense && (signupVerified || signupPending)) {
      const fromSignup = signupVerified ? 'verified' : 'pending';
      // upgrade only — never downgrade an already-verified driver record
      if (driversLicenseStatus === 'none' || (driversLicenseStatus === 'pending' && fromSignup === 'verified')) {
        driversLicenseStatus = fromSignup;
      }
    }

    // Effective 18+/ID status — any verified/pending signup ID counts
    let idDocumentStatus: DriverVerificationState['idDocumentStatus'] =
      (dpAny.id_document_status ?? 'none') as DriverVerificationState['idDocumentStatus'];
    if (signupVerified || signupPending) {
      const fromSignup = signupVerified ? 'verified' : 'pending';
      if (idDocumentStatus === 'none' || (idDocumentStatus === 'pending' && fromSignup === 'verified')) {
        idDocumentStatus = fromSignup;
      }
    }

    setState({
      driversLicenseUrl: dpAny.drivers_license_url ?? uvAny.document_front_url ?? null,
      driversLicenseStatus,
      idDocumentUrl: dpAny.id_document_url ?? uvAny.document_front_url ?? null,
      idDocumentType: (dpAny.id_document_type ?? uvAny.document_type ?? null) as DriverVerificationState['idDocumentType'],
      idDocumentStatus,
      is18Plus: !!(dpAny.is_18_plus || uvAny.is_18_plus),
      extractedDocumentNumber: uvAny.document_number ?? null,
      extractedName: uvAny.extracted_name ?? null,
      extractedDob: uvAny.extracted_dob ?? null,
      signupVerified,
      signupPending,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Tile-unlock rules: pending or verified counts as "uploaded"
  const hasLicense = state.driversLicenseStatus === 'pending' || state.driversLicenseStatus === 'verified';
  // A verified/pending driver's license is the highest form of government photo ID and
  // also proves 18+ (you must be 18+ to hold a license in supported regions). It therefore
  // auto-unlocks bicycle / runner tiles without requiring a separate 18+ ID upload.
  const hasId18PlusViaIdDoc =
    (state.idDocumentStatus === 'pending' || state.idDocumentStatus === 'verified') && state.is18Plus;
  const hasId18Plus = hasLicense || hasId18PlusViaIdDoc;

  const requiresLicense = (modes: DriverMode[]) => modes.includes('car') || modes.includes('motorcycle');
  const requiresId = (modes: DriverMode[]) => modes.includes('bicycle') || modes.includes('runner');

  const canGoActive = (modes: DriverMode[]) => {
    if (modes.length === 0) return false;
    if (requiresLicense(modes) && !hasLicense) return false;
    if (requiresId(modes) && !hasId18Plus) return false;
    return true;
  };

  return {
    state,
    loading,
    refresh,
    hasLicense,
    hasId18Plus,
    requiresLicense,
    requiresId,
    canGoActive,
  };
}
