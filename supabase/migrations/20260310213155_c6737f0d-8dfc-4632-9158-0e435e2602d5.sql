
-- ============================================================
-- 1. Backfill: Insert owner rows into employee_venue_links
--    for all approved venues where the owner doesn't have one
-- ============================================================
INSERT INTO public.employee_venue_links (user_id, venue_id, role, is_active, permissions, hired_date)
SELECT
  v.owner_user_id,
  v.id,
  'owner',
  true,
  '{"accept_payments":true,"create_orders":true,"manage_tables":true,"view_reports":true,"manage_staff":true,"manage_menu":true,"process_refunds":true}'::jsonb,
  v.created_at::date
FROM public.venues v
WHERE v.approval_status = 'approved'
  AND v.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_venue_links evl
    WHERE evl.venue_id = v.id AND evl.user_id = v.owner_user_id
  );

-- ============================================================
-- 2. Trigger: Auto-insert owner into employee_venue_links
--    when a venue is approved
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_insert_venue_owner_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when approval_status changes to 'approved'
  IF NEW.approval_status = 'approved'
     AND (OLD.approval_status IS DISTINCT FROM 'approved')
     AND NEW.owner_user_id IS NOT NULL
  THEN
    INSERT INTO public.employee_venue_links (user_id, venue_id, role, is_active, permissions, hired_date)
    VALUES (
      NEW.owner_user_id,
      NEW.id,
      'owner',
      true,
      '{"accept_payments":true,"create_orders":true,"manage_tables":true,"view_reports":true,"manage_staff":true,"manage_menu":true,"process_refunds":true}'::jsonb,
      CURRENT_DATE
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_insert_venue_owner ON public.venues;
CREATE TRIGGER trg_auto_insert_venue_owner
  AFTER UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_insert_venue_owner_on_approval();

-- Also handle INSERT (venue created already approved)
DROP TRIGGER IF EXISTS trg_auto_insert_venue_owner_on_insert ON public.venues;
CREATE TRIGGER trg_auto_insert_venue_owner_on_insert
  AFTER INSERT ON public.venues
  FOR EACH ROW
  WHEN (NEW.approval_status = 'approved' AND NEW.owner_user_id IS NOT NULL)
  EXECUTE FUNCTION public.auto_insert_venue_owner_on_approval();

-- ============================================================
-- 3. Permission RPC functions used by VenueOperationsDashboard
--    Owner + manager/admin roles get full access
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_approve_venue_entry(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_venue_links
    WHERE venue_id = p_venue_id
      AND user_id = auth.uid()
      AND is_active = true
      AND role IN ('owner', 'manager', 'admin', 'security')
  )
  OR EXISTS (
    SELECT 1 FROM public.venues
    WHERE id = p_venue_id AND owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_venue_patron_moderation(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_venue_links
    WHERE venue_id = p_venue_id
      AND user_id = auth.uid()
      AND is_active = true
      AND role IN ('owner', 'manager', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.venues
    WHERE id = p_venue_id AND owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_venue_caution_preferences(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_venue_links
    WHERE venue_id = p_venue_id
      AND user_id = auth.uid()
      AND is_active = true
      AND role IN ('owner', 'manager', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.venues
    WHERE id = p_venue_id AND owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_venue_internal_patrons(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_venue_links
    WHERE venue_id = p_venue_id
      AND user_id = auth.uid()
      AND is_active = true
      AND role IN ('owner', 'manager', 'admin', 'security', 'staff')
  )
  OR EXISTS (
    SELECT 1 FROM public.venues
    WHERE id = p_venue_id AND owner_user_id = auth.uid()
  );
$$;

-- ============================================================
-- 4. Notification RPCs (stubs that return empty/work for owners)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_venue_staff_operational_notifications(
  p_venue_id uuid,
  p_include_read boolean DEFAULT false,
  p_limit integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_authorized boolean;
BEGIN
  -- Check authorization
  SELECT EXISTS (
    SELECT 1 FROM public.employee_venue_links
    WHERE venue_id = p_venue_id AND user_id = auth.uid() AND is_active = true
      AND role IN ('owner', 'manager', 'admin', 'security', 'staff')
  ) OR EXISTS (
    SELECT 1 FROM public.venues WHERE id = p_venue_id AND owner_user_id = auth.uid()
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to view operational notifications';
  END IF;

  -- Return empty array - notifications table may not exist yet
  RETURN '[]'::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_venue_staff_operational_notification_read(
  p_notification_id uuid,
  p_read boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Stub: notification tables will be created in a future migration
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_venue_staff_operational_notifications_read(
  p_venue_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Stub: notification tables will be created in a future migration
  NULL;
END;
$$;
