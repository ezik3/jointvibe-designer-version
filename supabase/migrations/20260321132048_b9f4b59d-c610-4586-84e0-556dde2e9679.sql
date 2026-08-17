
CREATE TABLE public.post_watch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  watch_time_ms integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.post_watch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own watch events"
  ON public.post_watch_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own watch events"
  ON public.post_watch_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_post_watch_events_post_id ON public.post_watch_events(post_id);
CREATE INDEX idx_post_watch_events_user_id ON public.post_watch_events(user_id);
