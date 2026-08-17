-- Create storage bucket for live videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'live-videos', 
  'live-videos', 
  true, 
  104857600, -- 100MB limit
  ARRAY['video/webm', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload videos
CREATE POLICY "Users can upload their own live videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'live-videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to live videos
CREATE POLICY "Live videos are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'live-videos');

-- Allow users to delete their own videos
CREATE POLICY "Users can delete their own live videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'live-videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add video_url column to posts if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'video_url'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN video_url TEXT;
  END IF;
END $$;