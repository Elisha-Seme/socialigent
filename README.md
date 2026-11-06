# Socialigent

Self-serve LinkedIn assistant. Claude drafts each post in your brand voice, you approve it in Telegram (or the dashboard), and it publishes on your schedule.

Live at https://socialigent.vercel.app. For architecture, production access and gotchas, read [HANDOFF.md](HANDOFF.md).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind v3 + hand-written shadcn components · Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron) · Anthropic Claude · LinkedIn Posts API · Telegram Bot API · optional OpenAI image generation.

## Develop

```bash
npm install
cp .env.example .env.local   # then fill in values (see HANDOFF.md §2)
npm run dev                  # http://localhost:3000
```

## Check

```bash
npm test            # unit tests (Vitest): publish lock, LinkedIn escaping, OAuth state, schedule, parsing
npx tsc --noEmit    # app type-check
npm run lint
npm run build
# Edge Functions (Deno) are outside the Next type-check:
cd supabase/functions && npx deno@2 check --no-lock --node-modules-dir=none generate-drafts/index.ts publish-posts/index.ts
```

## Layout

| Path | What lives there |
|---|---|
| `app/` | Landing page, auth, onboarding, dashboard (`(dashboard)/`), API routes (`api/`) |
| `lib/` | Server helpers: Supabase clients, AI pipeline, Telegram agent, LinkedIn OAuth, timezones |
| `supabase/functions/_shared/` | Import-free modules shared by Next **and** the Deno Edge Functions (writing rules, schedule, LinkedIn publishing + lock, image generation, Telegram messages) |
| `supabase/functions/` | `generate-drafts` (hourly) and `publish-posts` (every 15 min) |
| `supabase/migrations/` | Schema + RLS, source of truth for production |
| `tests/` | Vitest suites |
