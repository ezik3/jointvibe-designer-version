-- Venue patron incident timeline foundation (internal-only).
-- Aggregates venue-scoped operational history for authorized staff/security use.

CREATE OR REPLACE FUNCTION public.get_venue_patron_incident_timeline(
  p_venue_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  timeline_id TEXT,
  occurred_at TIMESTAMPTZ,
  event_family TEXT,
  event_type TEXT,
  source_table TEXT,
  source_id UUID,
  actor_user_id UUID,
  actor_display_name TEXT,
  summary TEXT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_venue_operational_access(p_venue_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view patron incident timeline';
  END IF;

  RETURN QUERY
  WITH timeline_rows AS (
    SELECT
      'checkin:' || ci.id::text AS timeline_id,
      ci.checked_in_at AS occurred_at,
      'presence'::TEXT AS event_family,
      'checkin'::TEXT AS event_type,
      'check_ins'::TEXT AS source_table,
      ci.id AS source_id,
      NULL::UUID AS actor_user_id,
      NULL::TEXT AS actor_display_name,
      CASE
        WHEN ci.checkin_entry_source = 'hybrid_fallback' THEN 'Fallback check-in recorded'
        WHEN ci.checkin_entry_source = 'staff_approval' THEN 'Staff-approved check-in recorded'
        ELSE 'Check-in recorded'
      END AS summary,
      jsonb_build_object(
        'verification_state', ci.verification_state,
        'checkin_entry_source', ci.checkin_entry_source,
        'visibility', ci.visibility
      ) AS details
    FROM public.check_ins ci
    WHERE ci.venue_id = p_venue_id
      AND ci.user_id = p_user_id

    UNION ALL

    SELECT
      'checkout:' || ci.id::text,
      ci.checked_out_at,
      'presence'::TEXT,
      'checkout'::TEXT,
      'check_ins'::TEXT,
      ci.id,
      NULL::UUID,
      NULL::TEXT,
      'Checkout recorded'::TEXT,
      jsonb_build_object(
        'checkin_entry_source', ci.checkin_entry_source,
        'checked_in_at', ci.checked_in_at
      )
    FROM public.check_ins ci
    WHERE ci.venue_id = p_venue_id
      AND ci.user_id = p_user_id
      AND ci.checked_out_at IS NOT NULL

    UNION ALL

    SELECT
      'visibility:' || ci.id::text,
      ci.visibility_selected_at,
      'presence'::TEXT,
      'visibility_selection'::TEXT,
      'check_ins'::TEXT,
      ci.id,
      ci.user_id AS actor_user_id,
      cp.display_name AS actor_display_name,
      CASE
        WHEN ci.visibility_selection_status = 'defaulted_private' THEN 'Visibility defaulted to private'
        WHEN ci.visibility = 'public' THEN 'Visibility set to public'
        ELSE 'Visibility set to private'
      END,
      jsonb_build_object(
        'visibility', ci.visibility,
        'visibility_selection_status', ci.visibility_selection_status,
        'visibility_selection_source', ci.visibility_selection_source
      )
    FROM public.check_ins ci
    LEFT JOIN public.customer_profiles cp
      ON cp.user_id = ci.user_id
    WHERE ci.venue_id = p_venue_id
      AND ci.user_id = p_user_id
      AND ci.visibility_selected_at IS NOT NULL

    UNION ALL

    SELECT
      'approval:' || ea.id::text,
      COALESCE(ea.approved_at, ea.created_at),
      'approval'::TEXT,
      'entry_approval'::TEXT,
      'venue_entry_approvals'::TEXT,
      ea.id,
      ea.approved_by_user_id,
      actor_cp.display_name,
      CASE
        WHEN ea.verification_state = 'denied' THEN 'Entry approval denied'
        ELSE 'Entry approval recorded'
      END,
      jsonb_build_object(
        'verification_state', ea.verification_state,
        'approval_source', ea.approval_source,
        'presence_state_before', ea.presence_state_before,
        'presence_state_after', ea.presence_state_after,
        'notes', ea.notes,
        'metadata', ea.metadata
      )
    FROM public.venue_entry_approvals ea
    LEFT JOIN public.customer_profiles actor_cp
      ON actor_cp.user_id = ea.approved_by_user_id
    WHERE ea.venue_id = p_venue_id
      AND ea.user_id = p_user_id

    UNION ALL

    SELECT
      'moderation:' || me.id::text,
      me.created_at,
      'moderation'::TEXT,
      me.action_type,
      'venue_patron_moderation_events'::TEXT,
      me.id,
      me.actor_user_id,
      actor_cp.display_name,
      CASE me.action_type
        WHEN 'set_banned' THEN 'Venue ban applied'
        WHEN 'set_kicked_out_tonight' THEN 'Kicked out tonight applied'
        WHEN 'set_deal_suppressed' THEN 'Deal suppression applied'
        WHEN 'set_allowed' THEN 'Patron reset to allowed'
        ELSE 'Moderation action recorded'
      END,
      jsonb_build_object(
        'caution_category', me.caution_category,
        'reason_note', me.reason_note,
        'internal_note', me.internal_note,
        'trigger_type', me.trigger_type,
        'status_expires_at', me.status_expires_at,
        'metadata', me.metadata
      )
    FROM public.venue_patron_moderation_events me
    LEFT JOIN public.customer_profiles actor_cp
      ON actor_cp.user_id = me.actor_user_id
    WHERE me.venue_id = p_venue_id
      AND me.user_id = p_user_id

    UNION ALL

    SELECT
      'caution_alert:' || cae.id::text,
      cae.created_at,
      'caution'::TEXT,
      'caution_alert'::TEXT,
      'venue_caution_alert_events'::TEXT,
      cae.id,
      cae.created_by_user_id,
      actor_cp.display_name,
      'Caution threshold alert triggered'::TEXT,
      jsonb_build_object(
        'caution_category', cae.caution_category,
        'trigger_type', cae.trigger_type,
        'incident_count', cae.incident_count,
        'minimum_threshold', cae.minimum_threshold,
        'status', cae.status,
        'event_source', cae.event_source,
        'event_metadata', cae.event_metadata,
        'acknowledged_at', cae.acknowledged_at
      )
    FROM public.venue_caution_alert_events cae
    LEFT JOIN public.customer_profiles actor_cp
      ON actor_cp.user_id = cae.created_by_user_id
    WHERE cae.venue_id = p_venue_id
      AND cae.user_id = p_user_id

    UNION ALL

    SELECT
      'inside_proof:' || ipe.id::text,
      COALESCE(ipe.event_at, ipe.created_at),
      'inside_proof'::TEXT,
      'inside_proof_event'::TEXT,
      'venue_inside_proof_events'::TEXT,
      ipe.id,
      ipe.created_by_user_id,
      actor_cp.display_name,
      'Inside-proof event recorded'::TEXT,
      jsonb_build_object(
        'proof_source', ipe.proof_source,
        'confidence_level', ipe.confidence_level,
        'confidence_score', ipe.confidence_score,
        'source_table', ipe.source_table,
        'source_record_id', ipe.source_record_id,
        'metadata', ipe.metadata
      )
    FROM public.venue_inside_proof_events ipe
    LEFT JOIN public.customer_profiles actor_cp
      ON actor_cp.user_id = ipe.created_by_user_id
    WHERE ipe.venue_id = p_venue_id
      AND ipe.user_id = p_user_id

    UNION ALL

    SELECT
      'oplog:' || ol.id::text,
      ol.created_at,
      'audit'::TEXT,
      ol.action_type,
      'venue_operational_action_logs'::TEXT,
      ol.id,
      ol.actor_user_id,
      actor_cp.display_name,
      'Operational action logged'::TEXT,
      jsonb_build_object(
        'action_source', ol.action_source,
        'idempotency_key', ol.idempotency_key,
        'metadata', ol.metadata
      )
    FROM public.venue_operational_action_logs ol
    LEFT JOIN public.customer_profiles actor_cp
      ON actor_cp.user_id = ol.actor_user_id
    WHERE ol.venue_id = p_venue_id
      AND ol.target_user_id = p_user_id
  )
  SELECT
    tr.timeline_id,
    tr.occurred_at,
    tr.event_family,
    tr.event_type,
    tr.source_table,
    tr.source_id,
    tr.actor_user_id,
    tr.actor_display_name,
    tr.summary,
    tr.details
  FROM timeline_rows tr
  WHERE tr.occurred_at IS NOT NULL
  ORDER BY tr.occurred_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 300));
END;
$$;

REVOKE ALL ON FUNCTION public.get_venue_patron_incident_timeline(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_patron_incident_timeline(UUID, UUID, INTEGER) TO authenticated;
