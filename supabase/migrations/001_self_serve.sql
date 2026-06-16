-- Self-serve multi-tenant migration
-- Run this in the Supabase SQL editor.

-- 1. Add user ownership to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. One profile per user
CREATE UNIQUE INDEX IF NOT EXISTS clients_user_id_key ON clients (user_id) WHERE user_id IS NOT NULL;

-- 3. Enable RLS on clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON clients;
DROP POLICY IF EXISTS "users_insert_own" ON clients;
DROP POLICY IF EXISTS "users_update_own" ON clients;

CREATE POLICY "users_select_own" ON clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own" ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own" ON clients FOR UPDATE USING (auth.uid() = user_id);

-- 4. Enable RLS on posts (reads scoped to own client; admin routes bypass via service role)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_posts" ON posts;

CREATE POLICY "users_select_own_posts" ON posts
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );
