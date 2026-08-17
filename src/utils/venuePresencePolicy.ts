export type EntryControlPolicy = "open_entry" | "security_required" | "hybrid_entry";
export type SecurityOperationMode = "always_active" | "scheduled" | "event_based";

export type PresenceState =
  | "not_nearby"
  | "near_venue"
  | "at_venue_unverified"
  | "checked_in";

export type VerificationState =
  | "not_required"
  | "required"
  | "pending"
  | "approved"
  | "denied"
  | "manual_override"
  | "fallback_unverified";

export interface VenueEntryPolicy {
  minimumEntryAge?: number | null;
  entryControlPolicy?: string | null;
  securityOperationMode?: string | null;
}

export interface PresenceEvaluationInput {
  policy: VenueEntryPolicy;
  isWithinVenueRadius: boolean;
  isCheckedIn: boolean;
}

export interface PresenceEvaluation {
  presenceState: PresenceState;
  verificationState: VerificationState;
  canCheckInNow: boolean;
  canFallbackCheckIn: boolean;
  reasonCode:
    | "already_checked_in"
    | "outside_radius"
    | "open_entry_allowed"
    | "security_approval_required"
    | "hybrid_entry_unverified";
}

export function normalizeEntryControlPolicy(value?: string | null): EntryControlPolicy {
  if (value === "security_required" || value === "hybrid_entry") return value;
  return "open_entry";
}

export function normalizeSecurityOperationMode(value?: string | null): SecurityOperationMode {
  if (value === "scheduled" || value === "event_based") return value;
  return "always_active";
}

export function evaluatePresenceAndCheckInEligibility(
  input: PresenceEvaluationInput,
): PresenceEvaluation {
  const entryPolicy = normalizeEntryControlPolicy(input.policy.entryControlPolicy);
  const _securityMode = normalizeSecurityOperationMode(input.policy.securityOperationMode);

  if (input.isCheckedIn) {
    return {
      presenceState: "checked_in",
      verificationState: entryPolicy === "open_entry" ? "not_required" : "approved",
      canCheckInNow: false,
      canFallbackCheckIn: false,
      reasonCode: "already_checked_in",
    };
  }

  if (!input.isWithinVenueRadius) {
    return {
      presenceState: "not_nearby",
      verificationState: entryPolicy === "open_entry" ? "not_required" : "required",
      canCheckInNow: false,
      canFallbackCheckIn: false,
      reasonCode: "outside_radius",
    };
  }

  if (entryPolicy === "open_entry") {
    return {
      presenceState: "near_venue",
      verificationState: "not_required",
      canCheckInNow: true,
      canFallbackCheckIn: false,
      reasonCode: "open_entry_allowed",
    };
  }

  if (entryPolicy === "security_required") {
    return {
      presenceState: "at_venue_unverified",
      verificationState: "required",
      canCheckInNow: false,
      canFallbackCheckIn: false,
      reasonCode: "security_approval_required",
    };
  }

  return {
    presenceState: "at_venue_unverified",
    verificationState: "fallback_unverified",
    canCheckInNow: false,
    canFallbackCheckIn: true,
    reasonCode: "hybrid_entry_unverified",
  };
}
