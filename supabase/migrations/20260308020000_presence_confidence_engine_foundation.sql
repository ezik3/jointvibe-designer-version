-- Presence confidence scoring engine foundation (internal-only, venue-scoped).
-- Purpose:
-- - evaluate strength of venue-presence evidence for a specific patron
-- - keep confidence distinct from public/private visibility, moderation status, and intent signals
-- - provide a reusable, conservative operational primitive for future escalation/analytics features

CREATE OR REPLACE FUNCTION public.get_venue_patron_presence_confidence(
  p_venue_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  confidence_score INTEGER,
  confidence_band TEXT,
  primary_evidence TEXT,
  active_checkin_id UUID,
  active_checkin_at TIMESTAMPTZ,
  verification_state TEXT,
  checkin_entry_source TEXT,
  has_recent_staff_approval BOOLEAN,
  recent_inside_proof_count BIGINT,
  strongest_inside_proof_source TEXT,
  strongest_inside_proof_score INTEGER,
  strongest_inside_proof_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_score INTEGER := 0;

  v_checkin_id UUID;
  v_checkin_at TIMESTAMPTZ;
  v_verification_state TEXT;
  v_checkin_entry_source TEXT;

  v_has_recent_staff_approval BOOLEAN := false;
  v_inside_proof_count BIGINT := 0;
  v_strongest_inside_proof_source TEXT;
  v_strongest_inside_proof_score INTEGER;
  v_strongest_inside_proof_at TIMESTAMPTZ;

  v_confidence_band TEXT := 'very_low';
  v_primary_evidence TEXT := 'no_recent_evidence';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_venue_operational_access(p_venue_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view venue patron presence confidence';
  END IF;

  -- Active check-in evidence (visibility-independent).
  SELECT
    ci.id,
    ci.checked_in_at,
    ci.verification_state,
    ci.checkin_entry_source
  INTO
    v_checkin_id,
    v_checkin_at,
    v_verification_state,
    v_checkin_entry_source
  FROM public.check_ins ci
  WHERE ci.venue_id = p_venue_id
    AND ci.user_id = p_user_id
    AND ci.checked_out_at IS NULL
  ORDER BY ci.checked_in_at DESC
  LIMIT 1;

  IF v_checkin_id IS NOT NULL THEN
    v_score := v_score + 20;

    IF v_verification_state = 'approved' THEN
      v_score := v_score + 30;
    ELSIF v_verification_state = 'not_required' THEN
      v_score := v_score + 18;
    ELSIF v_verification_state = 'fallback_unverified' THEN
      v_score := v_score + 8;
    ELSIF v_verification_state IN ('pending', 'required') THEN
      v_score := v_score + 4;
    END IF;

    IF v_checkin_entry_source = 'staff_approval' THEN
      v_score := v_score + 22;
    ELSIF v_checkin_entry_source = 'self_checkin_open_entry' THEN
      v_score := v_score + 14;
    ELSIF v_checkin_entry_source = 'hybrid_fallback' THEN
      v_score := v_score + 6;
    END IF;
  END IF;

  -- Recent staff approval evidence (strong operational signal, independent of visibility).
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_entry_approvals ea
    WHERE ea.venue_id = p_venue_id
      AND ea.user_id = p_user_id
      AND ea.verification_state = 'approved'
      AND ea.approved_at >= (v_now - interval '24 hours')
  )
  INTO v_has_recent_staff_approval;

  IF v_has_recent_staff_approval THEN
    v_score := v_score + 18;
  END IF;

  -- Inside-proof evidence (transaction/POS/service/manual ops).
  SELECT COUNT(*)::BIGINT
  INTO v_inside_proof_count
  FROM public.venue_inside_proof_events e
  WHERE e.venue_id = p_venue_id
    AND e.user_id = p_user_id
    AND e.event_at >= (v_now - interval '24 hours');

  SELECT
    e.proof_source,
    e.confidence_score,
    e.event_at
  INTO
    v_strongest_inside_proof_source,
    v_strongest_inside_proof_score,
    v_strongest_inside_proof_at
  FROM public.venue_inside_proof_events e
  WHERE e.venue_id = p_venue_id
    AND e.user_id = p_user_id
    AND e.event_at >= (v_now - interval '24 hours')
  ORDER BY e.confidence_score DESC, e.event_at DESC
  LIMIT 1;

  IF v_strongest_inside_proof_score IS NOT NULL THEN
    -- Conservative contribution cap for this foundation slice.
    v_score := v_score + LEAST(30, GREATEST(0, ROUND(v_strongest_inside_proof_score * 0.30)::INTEGER));

    -- Bonus for multiple corroborating events.
    IF v_inside_proof_count >= 3 THEN
      v_score := v_score + 8;
    ELSIF v_inside_proof_count = 2 THEN
      v_score := v_score + 4;
    END IF;
  END IF;

  v_score := LEAST(100, GREATEST(0, v_score));

  v_confidence_band := CASE
    WHEN v_score >= 85 THEN 'high'
    WHEN v_score >= 60 THEN 'medium'
    WHEN v_score >= 35 THEN 'low'
    ELSE 'very_low'
  END;

  -- Primary evidence label for operator context.
  IF v_strongest_inside_proof_score IS NOT NULL AND v_strongest_inside_proof_score >= 80 THEN
    v_primary_evidence := 'transaction_or_pos_supported_proof';
  ELSIF v_has_recent_staff_approval OR v_checkin_entry_source = 'staff_approval' OR v_verification_state = 'approved' THEN
    v_primary_evidence := 'staff_approved_entry';
  ELSIF v_checkin_entry_source = 'hybrid_fallback' OR v_verification_state = 'fallback_unverified' THEN
    v_primary_evidence := 'fallback_unverified_presence';
  ELSIF v_checkin_id IS NOT NULL THEN
    v_primary_evidence := 'valid_checked_in_state';
  ELSE
    v_primary_evidence := 'weak_proximity_only';
  END IF;

  RETURN QUERY
  SELECT
    v_score,
    v_confidence_band,
    v_primary_evidence,
    v_checkin_id,
    v_checkin_at,
    v_verification_state,
    v_checkin_entry_source,
    v_has_recent_staff_approval,
    v_inside_proof_count,
    v_strongest_inside_proof_source,
    v_strongest_inside_proof_score,
    v_strongest_inside_proof_at,
    v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.get_venue_patron_presence_confidence(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_patron_presence_confidence(UUID, UUID) TO authenticated;
