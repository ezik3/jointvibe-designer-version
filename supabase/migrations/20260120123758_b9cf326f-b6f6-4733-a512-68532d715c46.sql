-- Ensure the Top10 helper view does not run with definer privileges
DROP VIEW IF EXISTS public.top_users_by_pounds;

CREATE VIEW public.top_users_by_pounds
WITH (security_invoker = true)
AS
SELECT
  cp.id,
  cp.user_id,
  cp.display_name,
  cp.avatar_url,
  cp.location,
  COALESCE(COUNT(pp.id), 0)::int AS total_pounds
FROM public.customer_profiles cp
LEFT JOIN public.posts p
  ON p.user_id = cp.user_id
LEFT JOIN public.post_pounds pp
  ON pp.post_id = p.id
GROUP BY cp.id, cp.user_id, cp.display_name, cp.avatar_url, cp.location;