
-- Create storage buckets for avatars and backgrounds
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('backgrounds', 'backgrounds', true) ON CONFLICT (id) DO NOTHING;

-- Avatars policies
CREATE POLICY "Users can upload avatars" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Users can update avatars" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete avatars" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars');

-- Backgrounds policies
CREATE POLICY "Users can upload backgrounds" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'backgrounds');

CREATE POLICY "Users can update backgrounds" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'backgrounds');

CREATE POLICY "Anyone can view backgrounds" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'backgrounds');

CREATE POLICY "Users can delete backgrounds" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'backgrounds');

-- Add shared_post_id column to posts table for share feature
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS shared_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;
