
-- 1. Replace function with tolerant matching (case-insensitive city match; ignores missing state)
CREATE OR REPLACE FUNCTION public.get_driver_signup_ad(p_country text, p_state text, p_city text, p_suburb text)
 RETURNS TABLE(booking_id uuid, campaign_id uuid, headline text, description text, cta_text text, cta_url text, auto_details jsonb, media_url text, suburb_match integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT
      lower(trim(coalesce(p_country, ''))) AS country,
      lower(trim(coalesce(p_state, '')))   AS state,
      lower(trim(coalesce(p_city, '')))    AS city,
      NULLIF(lower(trim(coalesce(p_suburb, ''))), '') AS suburb
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
    -- City must match (either via target_locations or campaign.city fallback), case-insensitive
    AND (
      lower(coalesce(b.target_locations->>'city', c.city)) = p.city
      OR p.city = ''
    )
    -- Country: only enforce if both sides have a value
    AND (
      coalesce(b.target_locations->>'country', '') = ''
      OR p.country = ''
      OR lower(b.target_locations->>'country') = p.country
      -- tolerate ISO vs full name mismatch by also matching first 2 chars
      OR left(lower(b.target_locations->>'country'), 2) = left(p.country, 2)
    )
  ORDER BY suburb_match DESC,
           b.bid_amount DESC NULLS LAST,
           b.created_at ASC
  LIMIT 1
$function$;
