create extension if not exists "uuid-ossp";

create table public.clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  brand_voice text not null,
  content_pillars text[] not null default '{}',
  linkedin_page_id text,
  linkedin_access_token text,
  linkedin_token_expires_at timestamptz,
  telegram_chat_id text,
  posting_schedule jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.clients(id) on delete cascade,
  caption text not null,
  image_prompt text,
  image_url text,
  platform text not null default 'linkedin',
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','rejected','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  linkedin_post_id text,
  rejection_reason text,
  error_message text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_history (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.posts(id) on delete cascade,
  previous_status text not null,
  new_status text not null,
  changed_by text,
  note text,
  created_at timestamptz not null default now()
);
