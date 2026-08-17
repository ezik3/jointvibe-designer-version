-- Add view count to posts for tracking video views
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;

-- Create index for sorting by views
CREATE INDEX IF NOT EXISTS idx_posts_view_count ON public.posts(view_count DESC);

-- Enable any authenticated user to increment view count on public posts
CREATE POLICY "Anyone can increment view count on public posts" 
ON public.posts 
FOR UPDATE 
USING (visibility = 'public')
WITH CHECK (visibility = 'public');