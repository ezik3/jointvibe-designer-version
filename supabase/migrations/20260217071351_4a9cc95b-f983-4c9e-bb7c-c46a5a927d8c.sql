
-- Create live_streams table
CREATE TABLE public.live_streams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_user_id UUID NOT NULL,
  room_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Live Stream',
  city TEXT,
  country TEXT,
  venue_id UUID REFERENCES public.venues(id),
  status TEXT NOT NULL DEFAULT 'live',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  preview_image_url TEXT
);

-- Create live_stream_viewers table (heartbeat presence)
CREATE TABLE public.live_stream_viewers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stream_id, user_id)
);

-- Create live_chat_messages table
CREATE TABLE public.live_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_live_streams_status ON public.live_streams(status);
CREATE INDEX idx_live_streams_host ON public.live_streams(host_user_id);
CREATE INDEX idx_live_stream_viewers_stream ON public.live_stream_viewers(stream_id);
CREATE INDEX idx_live_chat_messages_stream ON public.live_chat_messages(stream_id, created_at);

-- Enable RLS
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_stream_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS for live_streams
CREATE POLICY "Anyone can view live streams" ON public.live_streams FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create streams" ON public.live_streams FOR INSERT WITH CHECK (auth.uid() = host_user_id);
CREATE POLICY "Hosts can update their streams" ON public.live_streams FOR UPDATE USING (auth.uid() = host_user_id);

-- RLS for live_stream_viewers
CREATE POLICY "Anyone can view viewers" ON public.live_stream_viewers FOR SELECT USING (true);
CREATE POLICY "Authenticated users can upsert presence" ON public.live_stream_viewers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their presence" ON public.live_stream_viewers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can remove their presence" ON public.live_stream_viewers FOR DELETE USING (auth.uid() = user_id);

-- RLS for live_chat_messages
CREATE POLICY "Anyone can view chat messages" ON public.live_chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send messages" ON public.live_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable Realtime on live_streams
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_streams;

-- Clean up existing is_live flags on posts
UPDATE public.posts SET is_live = false WHERE is_live = true;
