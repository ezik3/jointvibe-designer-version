
-- 1. Vertical enum
DO $$ BEGIN
  CREATE TYPE public.advertiser_vertical AS ENUM ('real_estate', 'auto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Advertisers
ALTER TABLE public.advertisers
  ADD COLUMN IF NOT EXISTS advertiser_type public.advertiser_vertical NOT NULL DEFAULT 'real_estate';

-- 3. Campaigns
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type public.advertiser_vertical NOT NULL DEFAULT 'real_estate',
  ADD COLUMN IF NOT EXISTS auto_details jsonb;

ALTER TABLE public.ad_campaigns ALTER COLUMN property_address DROP NOT NULL;
ALTER TABLE public.ad_campaigns ALTER COLUMN property_type DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_ad_campaign_vertical()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.campaign_type = 'real_estate' THEN
    IF NEW.property_address IS NULL OR NEW.property_type IS NULL THEN
      RAISE EXCEPTION 'Real estate campaigns require property_address and property_type';
    END IF;
  ELSIF NEW.campaign_type = 'auto' THEN
    IF NEW.auto_details IS NULL
       OR COALESCE(NEW.auto_details->>'make','') = ''
       OR COALESCE(NEW.auto_details->>'model','') = '' THEN
      RAISE EXCEPTION 'Auto campaigns require auto_details.make and auto_details.model';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_ad_campaign_vertical ON public.ad_campaigns;
CREATE TRIGGER trg_validate_ad_campaign_vertical
  BEFORE INSERT OR UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.validate_ad_campaign_vertical();

-- 4. Bookings: structured target_locations
ALTER TABLE public.ad_bookings
  ADD COLUMN IF NOT EXISTS target_locations jsonb;

CREATE OR REPLACE FUNCTION public.normalize_target_locations()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  loc jsonb := NEW.target_locations;
  suburbs jsonb;
  norm_suburbs jsonb := '[]'::jsonb;
  s text;
BEGIN
  IF loc IS NULL THEN RETURN NEW; END IF;
  IF loc ? 'country' AND loc->>'country' IS NOT NULL THEN
    loc := jsonb_set(loc, '{country}', to_jsonb(lower(trim(loc->>'country'))));
  END IF;
  IF loc ? 'state' AND loc->>'state' IS NOT NULL THEN
    loc := jsonb_set(loc, '{state}', to_jsonb(lower(trim(loc->>'state'))));
  END IF;
  IF loc ? 'city' AND loc->>'city' IS NOT NULL THEN
    loc := jsonb_set(loc, '{city}', to_jsonb(lower(trim(loc->>'city'))));
  END IF;
  IF loc ? 'suburbs' THEN
    suburbs := loc->'suburbs';
    IF jsonb_typeof(suburbs) = 'array' THEN
      FOR s IN SELECT jsonb_array_elements_text(suburbs) LOOP
        IF length(trim(s)) > 0 THEN
          norm_suburbs := norm_suburbs || to_jsonb(lower(trim(s)));
        END IF;
      END LOOP;
      loc := jsonb_set(loc, '{suburbs}', norm_suburbs);
    END IF;
  END IF;
  NEW.target_locations := loc;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_normalize_target_locations ON public.ad_bookings;
CREATE TRIGGER trg_normalize_target_locations
  BEFORE INSERT OR UPDATE OF target_locations ON public.ad_bookings
  FOR EACH ROW EXECUTE FUNCTION public.normalize_target_locations();

-- 5. Analytics conversion columns
ALTER TABLE public.ad_analytics
  ADD COLUMN IF NOT EXISTS signups_started integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signups_completed integer NOT NULL DEFAULT 0;

-- 6. Public read for live auto campaigns
DROP POLICY IF EXISTS "Public can view live auto campaigns" ON public.ad_campaigns;
CREATE POLICY "Public can view live auto campaigns"
  ON public.ad_campaigns FOR SELECT
  USING (status = 'live' AND campaign_type = 'auto');

-- 7. Platform settings
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read platform settings" ON public.platform_settings;
CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings FOR SELECT USING (true);

INSERT INTO public.platform_settings(key, value)
VALUES ('auto_ads_one_per_suburb_per_day', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 8. Selection RPC
CREATE OR REPLACE FUNCTION public.get_driver_signup_ad(
  p_country text,
  p_state text,
  p_city text,
  p_suburb text
)
RETURNS TABLE (
  booking_id uuid,
  campaign_id uuid,
  headline text,
  description text,
  cta_text text,
  cta_url text,
  auto_details jsonb,
  media_url text,
  suburb_match int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      lower(trim(p_country)) AS country,
      lower(trim(p_state))   AS state,
      lower(trim(p_city))    AS city,
      NULLIF(lower(trim(p_suburb)), '') AS suburb
  )
  SELECT
    b.id AS booking_id,
    c.id AS campaign_id,
    c.headline,
    c.description,
    c.cta_text,
    c.cta_url,
    c.auto_details,
    COALESCE(
      (SELECT m.media_url FROM public.ad_media m
        WHERE m.campaign_id = c.id AND m.is_primary = true LIMIT 1),
      (SELECT m.media_url FROM public.ad_media m
        WHERE m.campaign_id = c.id ORDER BY m.sort_order ASC NULLS LAST LIMIT 1)
    ) AS media_url,
    CASE
      WHEN (SELECT suburb FROM params) IS NOT NULL
       AND b.target_locations->'suburbs' ? (SELECT suburb FROM params)
      THEN 1 ELSE 0
    END AS suburb_match
  FROM public.ad_bookings b
  JOIN public.ad_campaigns c ON c.id = b.campaign_id
  CROSS JOIN params p
  WHERE b.placement_type = 'driver_signup'
    AND b.payment_status = 'paid'
    AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
    AND c.campaign_type = 'auto'
    AND c.status = 'live'
    AND b.target_locations->>'country' = p.country
    AND b.target_locations->>'state'   = p.state
    AND b.target_locations->>'city'    = p.city
    AND (
      (p.suburb IS NOT NULL AND b.target_locations->'suburbs' ? p.suburb)
      OR COALESCE(jsonb_array_length(b.target_locations->'suburbs'), 0) = 0
    )
  ORDER BY suburb_match DESC,
           b.bid_amount DESC NULLS LAST,
           b.created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_signup_ad(text,text,text,text) TO anon, authenticated;
