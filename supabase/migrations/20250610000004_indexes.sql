create index idx_posts_client_id on public.posts(client_id);
create index idx_posts_status on public.posts(status);
create index idx_posts_scheduled_at on public.posts(scheduled_at);
create index idx_posts_created_at on public.posts(created_at desc);
create index idx_post_history_post_id on public.post_history(post_id);
