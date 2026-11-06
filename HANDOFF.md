# Socialigent: Agent Handoff Document

> **Audience:** any AI coding agent (or developer) picking up this project.
> **Status as of 2026-11-06:** live in production as a **self-serve, one-brand-per-account** product. Tenant isolation, the LinkedIn Posts API migration, and the publish lock shipped on this date.

---

## 1. What this project is

**Socialigent** is a self-serve LinkedIn assistant. Each account owns exactly one brand (`clients` row). For that brand the system:

1. **Drafts** posts an hour before each posting slot: three caption variations by Claude, plus an optional AI image.
2. **Routes for approval** to the brand's Telegram chat (inline Approve / Reject / Edit buttons, plus a chat agent that understands "make it shorter", "post it now", "move it to Friday") and to the web dashboard.
3. **Publishes** approved posts to LinkedIn when their slot arrives (cron), or immediately on request.

Signup is open (`/signup` → `/onboard`). Onboarding drafts a brand profile from the user's website, sets a schedule, captures the browser timezone, and generates a sample post.

---

## 2. Live URLs and accounts

| Thing | Value |
|---|---|
| Production app | https://socialigent.vercel.app |
| GitHub repo | https://github.com/Elisha-Seme/socialigent (public, NEVER commit secrets) |
| Vercel project | `socialigent` under elishaseme99-gmailcoms-projects (auto-deploys from master) |
| Supabase project ref | `qdpgfyfrpzrqwpzcuyju` |
| Supabase owner account | semeellisha29@gmail.com (NOT the user's main email) |
| Telegram bot | @SocialiGent_bot, webhook `/api/telegram/webhook` |
| LinkedIn app client ID | 77k80qpfar8snm (Default Tier, "Share on LinkedIn" only) |
| Privacy policy | https://socialigent.vercel.app/privacy (required by LinkedIn) |

Secrets live in `.env.local` (gitignored); `.env.example` lists every variable. Vercel production has the same set except `SUPABASE_ACCESS_TOKEN`. `OPENAI_API_KEY` is **not set anywhere**, so images are off. `OAUTH_STATE_SECRET` is optional (falls back to `LINKEDIN_CLIENT_SECRET`).

---

## 3. Tech stack

- **Next.js 14** App Router (params are NOT Promises) + TypeScript + Tailwind v3 (HSL CSS variables)
- **UI:** hand-written shadcn components on Radix (`components/ui/`). Do NOT run `npx shadcn add` (it generates Tailwind v4 / Base UI code). Icons: lucide-react. Motion: framer-motion.
- **Supabase:** Postgres + Auth (email/password) + Storage (`post-images`, public) + Edge Functions (Deno) + pg_cron/pg_net
- **AI:** `claude-haiku-4-5-20251001` (constant `CAPTION_MODEL` in `_shared/content.ts`); images via OpenAI `gpt-image-2` when `OPENAI_API_KEY` is set (`OPENAI_IMAGE_MODEL` overrides)
- **LinkedIn:** versioned REST APIs, `/rest/posts` + `/rest/images`, `LinkedIn-Version: 202610`
- **Tests:** Vitest (`npm test`)

---

## 4. How to access the Supabase database (IMPORTANT)

The project belongs to a different account than the local Supabase CLI login, so `supabase link` / `db push` fail. Use the **Management API**:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/qdpgfyfrpzrqwpzcuyju/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "select * from pg_policies where schemaname = $$public$$;"}'
```

The CLI works for Edge Functions and secrets when given the token:

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy publish-posts --project-ref qdpgfyfrpzrqwpzcuyju
SUPABASE_ACCESS_TOKEN=<token> npx supabase secrets set KEY=value --project-ref qdpgfyfrpzrqwpzcuyju
```

Direct Postgres connections (port 5432) time out. There is no `supabase_migrations` table in prod: migrations were applied by hand through the API.

---

## 5. Data model and security

Migrations in `supabase/migrations/` are the source of truth and match production as of `20261106000001_tenant_isolation.sql`.

**`clients`** (one per auth user, unique `user_id`): `name`, `brand_voice`, `content_pillars[]`, `posting_schedule` (jsonb `[{day, time}]`, UTC), `timezone` (IANA, used by the Telegram agent), `is_active` (false = no auto-drafting), `linkedin_page_id`, `linkedin_person_id`, `linkedin_access_token`, `linkedin_token_expires_at` (~2 months), `telegram_chat_id` (unique), `telegram_connect_token`.

**`posts`**: `status` ∈ `draft | pending_approval | approved | publishing | rejected | published | failed`; `caption`, `caption_variations[]`, `image_prompt`, `image_url`, `scheduled_at`, `published_at`, `linkedin_post_id`, `rejection_reason`, `error_message`, `retry_count`.

**`post_history`**: every status change (`previous_status` NOT NULL, `new_status`, `changed_by`, `note`).

**`telegram_messages`**: agent memory per chat; `[SUMMARY]` rows hold compacted history.

**RLS (owner-only):**
- `clients`: select/insert/update/delete only where `user_id = auth.uid()`. **Column grants**: users may write only `name, brand_voice, content_pillars, linkedin_page_id, posting_schedule, is_active, timezone` (+`user_id` on insert, `updated_at` on update). LinkedIn tokens and Telegram binding are written only by the server (service role) in the OAuth callback and the connect flow.
- `posts`: users can select/delete their brand's posts and update only `caption, status, scheduled_at, rejection_reason, updated_at`. Inserts and `image_url` are server-only, and `publishPost()` additionally refuses any image outside `post-images/{client_id}/` in this project. `post_history`: select + insert for owned posts.
- `telegram_messages`: no access for `anon`/`authenticated`; service role only.
- Storage `post-images`: public bucket, so files load by public URL. No SELECT policy (the bucket can't be listed) and no INSERT policy (only the service role uploads).

**Server rule:** every API route calls `requireUser()` (`lib/api/session.ts`), proves ownership with the user-session client (RLS), and only then uses the service-role client (`createAdminClient`) for token-bearing work.

**Cron (pg_cron → pg_net → Edge Functions):** `generate-drafts-hourly` (`0 * * * *`) and `publish-posts-15min` (`*/15 * * * *`).

---

## 6. Codebase map

```
app/
  page.tsx                  # landing page (InteractivePipeline demo in components/landing)
  (dashboard)/              # overview, posts, posts/[id], calendar, settings (auth + onboarding gate in layout)
  login/ signup/ onboard/ privacy/ auth/callback/
  api/
    generate/               # new draft for the brand, or regenerate a rejected post
    approve/ reject/        # status transitions (optimistic: only if status unchanged)
    publish/                # manual publish → publishPost()
    clients/ clients/[id]/  # brand create/read/update/delete (validated by lib/clients.ts)
    clients/draft/          # brand profile from a website
    linkedin/oauth|callback # signed state + nonce cookie + same-user check
    telegram/connect|webhook
lib/
  api/session.ts            # requireUser(), jsonError(), readJson()
  ai/                       # claude.ts (captions), pipeline.ts (the one generate pipeline), brand.ts, style.ts
  linkedin/                 # auth.ts (OAuth), state.ts (HMAC state), publish.ts (re-export)
  telegram/                 # agent.ts (tools + loop), history.ts, bot.ts, photos.ts, webhook.ts
  storage/images.ts  time.ts  clients.ts  schedule.ts  types.ts
supabase/functions/
  _shared/                  # IMPORT-FREE modules used by BOTH Next and Deno:
    content.ts              #   writing rules, stripAiMarkers, schedule, drafting-paused rule, prompt + parser
    linkedin.ts             #   Little Text escaping, Posts/Images API, publishPost() lock, stale recovery
    image.ts                #   OpenAI gpt-image generation (base64 → bytes)
    telegram.ts             #   approval message builder, telegramCall, escapeHtml
  generate-drafts/  publish-posts/
tests/                      # Vitest: publish lock (incl. concurrency), escaping, OAuth state, schedule, parsing, timezones
```

---

## 7. Critical gotchas (do not relearn these)

1. **Shared modules must stay import-free.** Next imports `@/supabase/functions/_shared/x`, Deno imports `../_shared/x.ts`. A relative import inside `_shared` breaks one of the two. Type-check Deno with `cd supabase/functions && npx deno@2 check --no-lock --node-modules-dir=none generate-drafts/index.ts publish-posts/index.ts`.
2. **LinkedIn versions expire.** `LINKEDIN_VERSION = '202610'` sunsets 2027-10-15; older versions return `426 NONEXISTENT_VERSION`. Bump it yearly.
3. **Captions are Little Text.** `/rest/posts` `commentary` needs reserved characters escaped and hashtags as `{hashtag|\#|tag}`. `toLittleText()` does this; never send raw captions.
4. **Publishing always goes through `publishPost()`.** It claims the row (`status → publishing` only if unchanged), so overlapping cron runs or a double-click can't double-post. A crash leaves `publishing`; `recoverStalePublishing()` marks it `failed` after 10 minutes and alerts the user. It never auto-retries, because the post may already be live.
5. **LinkedIn page posting is gated.** Only `w_member_social` is granted. Page posting needs `w_organization_social` (Community Management API approval). Until then, `publishToLinkedIn()` gets a 403 for the page and posts as the member (`urn:li:person:{linkedin_person_id}`). When approved, add the scope in `lib/linkedin/auth.ts` and have users reconnect.
6. **Adding unauthorized OAuth scopes** makes LinkedIn show "Bummer, something went wrong" with no detail.
7. **Images:** DALL-E 3 (removed 2026-05-12) and gpt-image-1 (removed 2026-10-23) are gone. GPT image models return base64 only; `generateImage()` returns bytes for direct upload. Check OpenAI's deprecations page before changing models.
8. **Vercel env vars:** `vercel env add KEY production <<< "value"` adds a trailing newline that breaks OAuth. Use `printf "value" | vercel env add KEY production`.
9. **Telegram bots can't message first.** Users connect with the dashboard's deep link (`/start <token>`). One chat drives one brand; connecting a chat elsewhere releases it from the old brand and clears that chat's agent memory.
10. **Auto-drafting pauses itself** when the last 3 drafts sat unreviewed past their slot (`isDraftingPaused`). The overview shows a banner; reviewing any draft resumes it.
11. **Approve ≠ publish.** Approval marks a post ready; the 15-minute cron publishes it once `scheduled_at` has passed (or the user publishes now).
12. **Schema changes:** run SQL through the Management API, then add the same SQL as a migration file so the repo stays the source of truth. Check `pg_policies` before assuming what production looks like.

---

## 8. Not done / next steps

- `OPENAI_API_KEY` for AI images (code is ready; set it in Vercel **and** as a Supabase secret).
- Community Management API approval for Company Page posting.
- `/api/clients/draft` fetches any URL the user gives it; add private-IP/redirect guards (SSRF hardening).
- Edge Functions accept any valid project JWT (including the public anon key); consider a shared-secret header from the cron jobs.
- More platforms (Meta, X): `posts.platform` exists; previews already render.
- Post analytics: blocked on the same LinkedIn API tier.

---

## 9. How to verify the system is healthy

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build

# Cron jobs active, and recent runs (Management API SQL):
#   select jobid, jobname, schedule, active from cron.job;
#   select * from cron.job_run_details order by start_time desc limit 10;

# RLS matches the migration:
#   select tablename, policyname, cmd from pg_policies where schemaname in ('public','storage');

# Telegram webhook:
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"   # url = …/api/telegram/webhook
```

## 10. Deploy

```bash
git push origin master        # Vercel auto-deploys the app
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy generate-drafts --project-ref qdpgfyfrpzrqwpzcuyju
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy publish-posts  --project-ref qdpgfyfrpzrqwpzcuyju
# Schema: run the migration SQL via the Management API (section 4).
```
