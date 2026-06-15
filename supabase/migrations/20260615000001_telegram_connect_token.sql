-- One-time token for the Telegram deep-link connect flow.
-- The operator generates a token, the user opens t.me/<bot>?start=<token>,
-- and the webhook binds their chat_id to this client, then clears the token.
alter table clients add column if not exists telegram_connect_token text;
create unique index if not exists clients_telegram_connect_token_idx
  on clients (telegram_connect_token)
  where telegram_connect_token is not null;
