-- Conversation memory for the Telegram AI agent.
-- Stores the last N messages per chat so Claude can maintain context across turns.
create table if not exists telegram_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    text not null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz default now()
);

create index if not exists telegram_messages_chat_created
  on telegram_messages (chat_id, created_at desc);

alter table telegram_messages enable row level security;

create policy telegram_messages_auth
  on telegram_messages for all to authenticated using (true);
