-- Keep category mutations and their menu-item reassignment in one RLS-aware transaction.
CREATE OR REPLACE FUNCTION public.rename_venue_menu_category(
  p_venue_id UUID,
  p_current_name TEXT,
  p_next_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_next_name TEXT := btrim(p_next_name);
  v_sort_order INTEGER;
BEGIN
  IF p_venue_id IS NULL OR p_current_name IS NULL OR v_next_name = '' THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_venue_id::TEXT, 0));

  SELECT sort_order
  INTO v_sort_order
  FROM public.venue_menu_categories
  WHERE venue_id = p_venue_id
    AND name = p_current_name
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- The UI avoids no-op saves, but the RPC must be safe when called directly.
  IF p_current_name = v_next_name THEN
    RETURN TRUE;
  END IF;

  -- PostgreSQL's unique constraint is case-sensitive while the UI treats
  -- category names case-insensitively.
  IF EXISTS (
    SELECT 1
    FROM public.venue_menu_categories
    WHERE venue_id = p_venue_id
      AND lower(name) = lower(v_next_name)
      AND name <> p_current_name
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.venue_menu_categories (venue_id, name, sort_order)
  VALUES (p_venue_id, v_next_name, v_sort_order)
  ON CONFLICT (venue_id, name) DO NOTHING;

  UPDATE public.venue_menu_items
  SET category = v_next_name
  WHERE venue_id = p_venue_id
    AND category = p_current_name;

  DELETE FROM public.venue_menu_categories
  WHERE venue_id = p_venue_id
    AND name = p_current_name;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_venue_menu_category(
  p_venue_id UUID,
  p_category TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_venue_id IS NULL
    OR p_category IS NULL
    OR lower(p_category) = 'uncategorized' THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_venue_id::TEXT, 0));

  PERFORM 1
  FROM public.venue_menu_categories
  WHERE venue_id = p_venue_id
    AND name = p_category
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.venue_menu_categories (venue_id, name, sort_order)
  SELECT p_venue_id, 'Uncategorized', COUNT(*)::INTEGER
  FROM public.venue_menu_categories
  WHERE venue_id = p_venue_id
  ON CONFLICT (venue_id, name) DO NOTHING;

  UPDATE public.venue_menu_items
  SET category = 'Uncategorized'
  WHERE venue_id = p_venue_id
    AND category = p_category;

  DELETE FROM public.venue_menu_categories
  WHERE venue_id = p_venue_id
    AND name = p_category;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_venue_menu_category(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_venue_menu_category(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_venue_menu_category(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_venue_menu_category(UUID, TEXT) TO authenticated;
