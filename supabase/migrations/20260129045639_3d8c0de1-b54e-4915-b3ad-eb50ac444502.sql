-- Migration 1: User Follows Table
CREATE TABLE public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_user_follows_follower ON public.user_follows(follower_id);
CREATE INDEX idx_user_follows_following ON public.user_follows(following_id);

-- RLS Policies
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

-- Anyone can view follows
CREATE POLICY "Anyone can view follows" ON public.user_follows
  FOR SELECT USING (true);

-- Users can follow anyone
CREATE POLICY "Users can follow" ON public.user_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Users can unfollow
CREATE POLICY "Users can unfollow" ON public.user_follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_follows;

-- Migration 2: Venue Activity Scores
CREATE TABLE public.venue_activity_scores (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  activity_score numeric NOT NULL DEFAULT 0,
  check_ins_1h int NOT NULL DEFAULT 0,
  posts_1h int NOT NULL DEFAULT 0,
  live_streams int NOT NULL DEFAULT 0,
  live_viewers int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.venue_activity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view venue activity" ON public.venue_activity_scores
  FOR SELECT USING (true);

CREATE POLICY "System can insert activity" ON public.venue_activity_scores
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update activity" ON public.venue_activity_scores
  FOR UPDATE USING (true);

-- Migration 3: Content Metrics Enhancement
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS share_count int DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS save_count int DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_engagement ON public.posts(pounds_count DESC, comments_count DESC, created_at DESC);