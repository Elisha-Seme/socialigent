-- Tenant isolation: every row is reachable only by the user who owns the
-- brand (clients.user_id). Server-side code (webhooks, cron, admin routes)
-- uses the service role, which bypasses RLS.
--
-- Replaces the single-tenant policies from 20250610000002 and the partial
-- self-serve policies from 20260616000001. Safe to re-run.

-- ─── 1. Drop every earlier policy ───────────────────────────────────────────
drop policy if exists "Authenticated users manage clients" on public.clients;
drop policy if exists "Authenticated users manage posts"   on public.posts;
drop policy if exists "Authenticated users view history"   on public.post_history;
drop policy if exists telegram_messages_auth               on public.telegram_messages;
drop policy if exists users_select_own                     on public.clients;
drop policy if exists users_insert_own                     on public.clients;
drop policy if exists users_update_own                     on public.clients;
drop policy if exists users_select_own_posts               on public.posts;
drop policy if exists "Authenticated upload for post images" on storage.objects;
-- …and this migration's own policies, so it can be re-applied cleanly
drop policy if exists clients_select_own        on public.clients;
drop policy if exists clients_insert_own        on public.clients;
drop policy if exists clients_update_own        on public.clients;
drop policy if exists clients_delete_own        on public.clients;
drop policy if exists posts_select_own          on public.posts;
drop policy if exists posts_insert_own          on public.posts;
drop policy if exists posts_update_own          on public.posts;
drop policy if exists posts_delete_own          on public.posts;
drop policy if exists post_history_select_own   on public.post_history;
drop policy if exists post_history_insert_own   on public.post_history;
drop policy if exists "Owners upload post images" on storage.objects;

alter table public.clients           enable row level security;
alter table public.posts             enable row level security;
alter table public.post_history      enable row level security;
alter table public.telegram_messages enable row level security;

-- ─── 2. Schema additions ────────────────────────────────────────────────────
-- Per-brand timezone for the Telegram agent (natural-language scheduling).
alter table public.clients add column if not exists timezone text not null default 'UTC';

-- 'publishing' is the lock state while a post is being sent to LinkedIn.
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check check (
  status in ('draft', 'pending_approval', 'approved', 'publishing', 'rejected', 'published', 'failed')
);

-- One Telegram chat drives exactly one brand.
create unique index if not exists clients_telegram_chat_id_key
  on public.clients (telegram_chat_id)
  where telegram_chat_id is not null;

create index if not exists idx_clients_user_id on public.clients (user_id);

-- ─── 3. clients: own row only ───────────────────────────────────────────────
create policy clients_select_own on public.clients
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy clients_insert_own on public.clients
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy clients_update_own on public.clients
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy clients_delete_own on public.clients
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Connection columns (LinkedIn tokens, Telegram binding) are written only by
-- the server through the OAuth callback and the Telegram connect flow.
revoke insert, update on public.clients from anon, authenticated;
grant insert (user_id, name, brand_voice, content_pillars, linkedin_page_id, posting_schedule, is_active, timezone)
  on public.clients to authenticated;
grant update (name, brand_voice, content_pillars, linkedin_page_id, posting_schedule, is_active, timezone, updated_at)
  on public.clients to authenticated;

-- ─── 4. posts: rows of an owned brand ───────────────────────────────────────
-- Users read, review (status/caption/schedule) and delete their own posts.
-- Posts are created and given images only by the server, so a user can never
-- point image_url at an arbitrary URL that the publisher would then fetch.
create policy posts_select_own on public.posts
  for select to authenticated
  using (client_id in (select id from public.clients where user_id = (select auth.uid())));

create policy posts_update_own on public.posts
  for update to authenticated
  using (client_id in (select id from public.clients where user_id = (select auth.uid())))
  with check (client_id in (select id from public.clients where user_id = (select auth.uid())));

create policy posts_delete_own on public.posts
  for delete to authenticated
  using (client_id in (select id from public.clients where user_id = (select auth.uid())));

revoke insert, update on public.posts from anon, authenticated;
grant update (caption, status, scheduled_at, rejection_reason, updated_at)
  on public.posts to authenticated;

-- ─── 5. post_history: read + append for owned posts ─────────────────────────
create policy post_history_select_own on public.post_history
  for select to authenticated
  using (post_id in (
    select p.id from public.posts p
    join public.clients c on c.id = p.client_id
    where c.user_id = (select auth.uid())
  ));

create policy post_history_insert_own on public.post_history
  for insert to authenticated
  with check (post_id in (
    select p.id from public.posts p
    join public.clients c on c.id = p.client_id
    where c.user_id = (select auth.uid())
  ));

-- ─── 6. telegram_messages: server only ──────────────────────────────────────
-- Agent memory is read and written by the webhook with the service role.
-- No policies + no grants = invisible to anon and authenticated users.
revoke all on public.telegram_messages from anon, authenticated;

-- ─── 7. Storage: server-only writes, no listing ─────────────────────────────
-- post-images is a public bucket: files are served by their public URL, which
-- doesn't consult RLS. Without a SELECT policy nobody can *list* the bucket
-- (which exposed every brand's folder and unapproved draft images), and
-- without an INSERT policy only the service role can upload.
drop policy if exists "Public read for post images" on storage.objects;
