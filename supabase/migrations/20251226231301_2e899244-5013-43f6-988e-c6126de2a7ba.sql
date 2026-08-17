-- Add is_live column to posts table to track if the user is broadcasting live
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false;

-- Create an index for efficient queries of live posts
CREATE INDEX IF NOT EXISTS idx_posts_is_live ON public.posts(is_live) WHERE is_live = true;

-- Enable realtime for posts table (if not already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;