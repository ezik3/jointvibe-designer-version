-- Speed up feed + City View public posts queries (order by created_at, filter visibility)
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON public.posts (created_at DESC);

-- Partial index for the most common City View query
CREATE INDEX IF NOT EXISTS idx_posts_public_created_at_desc ON public.posts (created_at DESC)
WHERE visibility = 'public';

-- Optional helper index if filtering by visibility in other queries
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON public.posts (visibility);
