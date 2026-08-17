
-- Create post_tagged_users table for storing tagged friends on posts
CREATE TABLE public.post_tagged_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.post_tagged_users ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read tagged users
CREATE POLICY "Authenticated users can view tagged users"
  ON public.post_tagged_users FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Post author can insert tagged users (check post ownership)
CREATE POLICY "Post authors can tag users"
  ON public.post_tagged_users FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid())
  );

-- Post author can delete tagged users
CREATE POLICY "Post authors can remove tags"
  ON public.post_tagged_users FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid())
  );

-- Index for fast lookups by post_id
CREATE INDEX idx_post_tagged_users_post_id ON public.post_tagged_users(post_id);
