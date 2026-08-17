-- Hybrid-entry fallback check-in foundation
-- Distinguishes staff-approved entry from hybrid fallback entry on check-ins.

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS verification_state TEXT,
  ADD COLUMN IF NOT EXISTS checkin_entry_source TEXT;

UPDATE public.check_ins
SET
  verification_state = COALESCE(verification_state, 'legacy_unknown'),
  checkin_entry_source = COALESCE(checkin_entry_source, 'legacy')
WHERE verification_state IS NULL
   OR checkin_entry_source IS NULL;

ALTER TABLE public.check_ins
  ALTER COLUMN verification_state SET NOT NULL,
  ALTER COLUMN checkin_entry_source SET NOT NULL;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_verification_state_valid
  CHECK (
    verification_state IN (
      'legacy_unknown',
      'not_required',
      'required',
      'pending',
      'approved',
      'denied',
      'manual_override',
      'fallback_unverified'
    )
  );

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_entry_source_valid
  CHECK (
    checkin_entry_source IN (
      'legacy',
      'self_checkin_open_entry',
      'staff_approval',
      'hybrid_fallback',
      'manual_override'
    )
  );

CREATE INDEX IF NOT EXISTS idx_check_ins_entry_source_active
  ON public.check_ins (venue_id, checkin_entry_source, checked_in_at DESC)
  WHERE checked_out_at IS NULL;
