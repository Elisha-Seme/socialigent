insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true);

create policy "Public read for post images"
  on storage.objects for select using (bucket_id = 'post-images');

create policy "Authenticated upload for post images"
  on storage.objects for insert
  with check (bucket_id = 'post-images' and auth.role() = 'authenticated');
