import { isSafeInternalRedirect } from '@/components/Auth/authNavigation';

const ONBOARDING_RETURN_KEY = 'jointvibe-venue-onboarding-return';
const ONBOARDING_RETURN_TTL_MS = 24 * 60 * 60 * 1000;

interface VenueOnboardingReturn {
  destination: string;
  ownerUserId: string;
  expiresAt: number;
}

const readStoredReturn = (): VenueOnboardingReturn | null => {
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_RETURN_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<VenueOnboardingReturn>;
    if (
      typeof stored.destination !== 'string'
      || typeof stored.ownerUserId !== 'string'
      || typeof stored.expiresAt !== 'number'
    ) {
      return null;
    }

    return stored as VenueOnboardingReturn;
  } catch {
    return null;
  }
};

export const rememberVenueOnboardingReturn = (destination: string, ownerUserId: string) => {
  if (!ownerUserId || !isSafeInternalRedirect(destination) || typeof window === 'undefined') return;

  try {
    const stored: VenueOnboardingReturn = {
      destination,
      ownerUserId,
      expiresAt: Date.now() + ONBOARDING_RETURN_TTL_MS,
    };
    window.sessionStorage.setItem(ONBOARDING_RETURN_KEY, JSON.stringify(stored));
  } catch {
    // The onboarding flow remains usable when session storage is unavailable.
  }
};

export const consumeVenueOnboardingReturn = (ownerUserId: string | undefined, fallback = '/venue/home') => {
  if (!ownerUserId || typeof window === 'undefined') return fallback;

  try {
    const stored = readStoredReturn();
    window.sessionStorage.removeItem(ONBOARDING_RETURN_KEY);

    if (
      !stored
      || stored.ownerUserId !== ownerUserId
      || stored.expiresAt < Date.now()
      || !isSafeInternalRedirect(stored.destination)
    ) {
      return fallback;
    }

    return stored.destination;
  } catch {
    return fallback;
  }
};
