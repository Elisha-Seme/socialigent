alter table public.clients enable row level security;
alter table public.posts enable row level security;
alter table public.post_history enable row level security;

-- Operator can do everything (single-tenant: any authenticated user = operator)
create policy "Authenticated users manage clients"
  on public.clients for all using (auth.role() = 'authenticated');

create policy "Authenticated users manage posts"
  on public.posts for all using (auth.role() = 'authenticated');

create policy "Authenticated users view history"
  on public.post_history for all using (auth.role() = 'authenticated');
