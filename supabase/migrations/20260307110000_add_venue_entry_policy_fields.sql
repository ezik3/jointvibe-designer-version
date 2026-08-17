-- Foundation fields for future security-gated check-ins and hybrid entry models.
-- This migration is intentionally non-breaking: all fields are nullable for existing venues.

ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS minimum_entry_age INTEGER;

ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS entry_control_policy TEXT;

ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS security_operation_mode TEXT;

ALTER TABLE public.venues
ADD CONSTRAINT venues_minimum_entry_age_valid
CHECK (
  minimum_entry_age IS NULL
  OR (minimum_entry_age >= 0 AND minimum_entry_age <= 30)
);

ALTER TABLE public.venues
ADD CONSTRAINT venues_entry_control_policy_valid
CHECK (
  entry_control_policy IS NULL
  OR entry_control_policy IN ('open_entry', 'security_required', 'hybrid_entry')
);

ALTER TABLE public.venues
ADD CONSTRAINT venues_security_operation_mode_valid
CHECK (
  security_operation_mode IS NULL
  OR security_operation_mode IN ('always_active', 'scheduled', 'event_based')
);

CREATE INDEX IF NOT EXISTS idx_venues_entry_control_policy
ON public.venues (entry_control_policy);

