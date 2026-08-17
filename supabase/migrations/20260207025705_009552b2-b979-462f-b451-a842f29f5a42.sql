-- Performance indexes for City View / Explore feeds
-- These speed up queries like: visibility='public' ORDER BY created_at DESC / pounds_count DESC

CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc
  ON public.posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_visibility_created_at_desc
  ON public.posts (visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_visibility_pounds_desc
  ON public.posts (visibility, pounds_count DESC);
