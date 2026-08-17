-- Checked-in visibility foundation
-- Adds explicit visibility selection metadata so checked-in presence can be
-- public/private independently from verification and presence state.

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS visibility_selection_status TEXT,
  ADD COLUMN IF NOT EXISTS visibility_selection_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visibility_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visibility_selection_source TEXT;

ALTER TABLE public.check_ins
  ALTER COLUMN visibility_selection_status SET DEFAULT 'selected';

UPDATE public.check_ins
SET
  visibility_selection_status = COALESCE(visibility_selection_status, 'selected'),
  visibility_selected_at = COALESCE(visibility_selected_at, checked_in_at),
  visibility_selection_source = COALESCE(visibility_selection_source, 'legacy')
WHERE visibility_selection_status IS NULL
   OR visibility_selected_at IS NULL
   OR visibility_selection_source IS NULL;

ALTER TABLE public.check_ins
  ALTER COLUMN visibility_selection_status SET NOT NULL;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_visibility_selection_status_valid
  CHECK (visibility_selection_status IN ('pending', 'selected', 'defaulted_private'));

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_visibility_selection_source_valid
  CHECK (
    visibility_selection_source IS NULL
    OR visibility_selection_source IN (
      'legacy',
      'self_checkin_open_entry',
      'staff_approval',
      'user_prompt',
      'timeout_default',
      'manual_override'
    )
  );

CREATE INDEX IF NOT EXISTS idx_check_ins_visibility_pending
  ON public.check_ins (visibility_selection_status, visibility_selection_deadline)
  WHERE checked_out_at IS NULL;
