
-- Create public ad-media bucket if missing
insert into storage.buckets (id, name, public)
values ('ad-media', 'ad-media', true)
on conflict (id) do update set public = true;

-- Public can read
drop policy if exists "Public can read ad-media" on storage.objects;
create policy "Public can read ad-media"
  on storage.objects for select
  using (bucket_id = 'ad-media');

-- Authenticated users can upload to ad-media
drop policy if exists "Authenticated can upload ad-media" on storage.objects;
create policy "Authenticated can upload ad-media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ad-media');

-- Authenticated can update/delete their own files
drop policy if exists "Owner can update ad-media" on storage.objects;
create policy "Owner can update ad-media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'ad-media' and owner = auth.uid());

drop policy if exists "Owner can delete ad-media" on storage.objects;
create policy "Owner can delete ad-media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ad-media' and owner = auth.uid());

-- Null out broken blob: URLs so UI falls back to placeholder
update public.ad_media
   set media_url = ''
 where media_url like 'blob:%';
