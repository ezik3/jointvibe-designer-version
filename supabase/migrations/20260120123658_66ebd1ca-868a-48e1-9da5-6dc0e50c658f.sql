-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS idx_post_pounds_post_id ON public.post_pounds (post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_venues_approval_vibe ON public.venues (approval_status, vibe_score DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_user_created ON public.customer_notifications (user_id, created_at DESC);

-- Fast Top10: aggregate in DB instead of N+1 client queries
CREATE OR REPLACE VIEW public.top_users_by_pounds AS
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