export const PUSH_CREDITS_CHECKOUT_STORAGE_KEY = "jointvibe-push-credits-checkout";
export const VIBE_CREDITS_CHECKOUT_STORAGE_KEY = "jointvibe-vibe-credits-checkout";

export interface VenueCreditCheckoutState {
  venueId: string;
  reachTier: string;
  expectedCredits: number;
  balanceBeforeCheckout: number | null;
}

export function saveVenueCreditCheckoutState(
  storageKey: string,
  state: VenueCreditCheckoutState,
) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Checkout can still continue when browser storage is unavailable.
  }
}

export function getVenueCreditCheckoutState(storageKey: string): VenueCreditCheckoutState | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;

    const state = JSON.parse(raw) as Partial<VenueCreditCheckoutState>;
    if (
      typeof state.venueId !== "string" ||
      typeof state.reachTier !== "string" ||
      typeof state.expectedCredits !== "number" ||
      !Number.isFinite(state.expectedCredits) ||
      state.expectedCredits <= 0 ||
      (state.balanceBeforeCheckout !== null &&
        (typeof state.balanceBeforeCheckout !== "number" || !Number.isFinite(state.balanceBeforeCheckout)))
    ) {
      return null;
    }

    return state as VenueCreditCheckoutState;
  } catch {
    return null;
  }
}

export function clearVenueCreditCheckoutState(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Nothing to clear when browser storage is unavailable.
  }
}
