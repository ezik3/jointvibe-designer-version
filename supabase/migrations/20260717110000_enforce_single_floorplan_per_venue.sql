-- Keep the newest floorplan for each venue before enforcing one tour per venue.
DO $$
DECLARE
  duplicate_floorplan RECORD;
BEGIN
  FOR duplicate_floorplan IN
    WITH ranked_floorplans AS (
      SELECT
        id,
        first_value(id) OVER (
          PARTITION BY venue_id
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS canonical_id
      FROM public.floorplans
    )
    SELECT id, canonical_id
    FROM ranked_floorplans
    WHERE id <> canonical_id
  LOOP
    UPDATE public.venue_tables
    SET floorplan_id = duplicate_floorplan.canonical_id
    WHERE floorplan_id = duplicate_floorplan.id;

    DELETE FROM public.floorplans
    WHERE id = duplicate_floorplan.id;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.floorplans'::regclass
      AND conname = 'floorplans_venue_id_key'
  ) THEN
    ALTER TABLE public.floorplans
      ADD CONSTRAINT floorplans_venue_id_key UNIQUE (venue_id);
  END IF;
END $$;
