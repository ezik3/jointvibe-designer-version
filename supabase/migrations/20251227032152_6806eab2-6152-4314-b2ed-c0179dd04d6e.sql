-- Create storage bucket for venue assets if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-assets', 'venue-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to venue-assets bucket
CREATE POLICY "Authenticated users can upload venue assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'venue-assets');

-- Allow public access to read venue assets
CREATE POLICY "Public can view venue assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'venue-assets');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Authenticated users can delete venue assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'venue-assets');