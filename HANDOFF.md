# Socialigent — Agent Handoff Document

> **Audience:** Any AI coding agent (or human developer) picking up this project.
> **Status as of 2026-06-11:** v1 is COMPLETE and LIVE in production. The full pipeline works end-to-end and has been verified with a real LinkedIn post.

---

## 1. What this project is

**Socialigent** is a multi-client social media management agent. The operator (Elisha, a solo founder) manages multiple client brands. For each client, the system:

1. **Generates** LinkedIn posts automatically on a schedule — captions written by Claude (Anthropic API), images by DALL-E 3 (not yet active, no OpenAI key).
2. **Routes for approval** via two channels: a web dashboard and a Telegram bot (@SocialiGent_bot) with inline Approve/Reject/Edit buttons.
3. **Publishes** approved posts to LinkedIn automatically when their scheduled slot arrives, or manually via a button.

The operator's daily workflow is: receive a Telegram message with a draft → tap ✅ Approve → the post goes live at its scheduled time. That's it.

---

## 2. Live URLs and accounts

| Thing | Value |
|---|---|
| Production app | https://socialigent.vercel.app |
| GitHub repo | https://github.com/Elisha-Seme/socialigent (public — NEVER commit secrets) |
| Vercel project | `socialigent` under elishaseme99-gmailcoms-projects (auto-deploys from master) |
| Supabase project ref | `qdpgfyfrpzrqwpzcuyju` (https://qdpgfyfrpzrqwpzcuyju.supabase.co) |
| Supabase owner account | semeellisha29@gmail.com (NOT the user's main email) |
| Dashboard login | elishaseme99@gmail.com / password is known to the user |
| Telegram bot | @SocialiGent_bot |
| Operator's Telegram chat ID | 716420092 |
| LinkedIn app client ID | 77k80qpfar8snm |
| LinkedIn Company Page ID | 127924150 (Socialigent page) |
| Privacy policy | https://socialigent.vercel.app/privacy (required by LinkedIn dev portal) |

**All secrets live in `.env.local` in the project root** (gitignored). Read that file for: Supabase keys, Anthropic API key, LinkedIn client secret, Telegram bot token + webhook secret, and the Supabase Management API access token (`SUPABASE_ACCESS_TOKEN`).

---

## 3. Tech stack

- **Next.js 14** (App Router, NOT 15 — params are not Promises) + TypeScript + Tailwind v3 (HSL CSS variables, NOT v4 oklch)
- **UI:** shadcn/ui components hand-written on Radix primitives (`components/ui/`) — do NOT run `npx shadcn add`, it generates incompatible Tailwind-v4/Base-UI components
- **Supabase:** Postgres + Auth (email/password) + Storage (`post-images` public bucket) + Edge Functions (Deno)
- **AI:** `claude-haiku-4-5-20251001` for captions, `dall-e-3` at 1792x1024 for images (inactive — no key yet)
- **APIs:** LinkedIn (ugcPosts v2, OAuth 2.0), Telegram Bot API
- **Hosting:** Vercel (hobby plan), GitHub master branch auto-deploys

---

## 4. How to access the Supabase database (IMPORTANT)

The Supabase project belongs to a DIFFERENT account (semeellisha29@gmail.com) than the user's CLI login, so `supabase link` / `supabase db push` FAIL with privilege errors. **Use the Management API instead:**

```bash
# Run arbitrary SQL (the access token is in .env.local as SUPABASE_ACCESS_TOKEN)
curl -s -X POST "https://api.supabase.com/v1/projects/qdpgfyfrpzrqwpzcuyju/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM clients;"}'
```

The CLI DOES work for Edge Functions and secrets when you pass the token as an env var:

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy publish-posts --project-ref qdpgfyfrpzrqwpzcuyju
SUPABASE_ACCESS_TOKEN=<token> npx supabase secrets set KEY=value --project-ref qdpgfyfrpzrqwpzcuyju
```

Direct Postgres connections (port 5432) time out — do not attempt psql.

---

## 5. Database schema

Migrations live in `supabase/migrations/` (already applied to production — they are the source of truth).

**`clients`** — one row per client brand
- `id` uuid PK, `name` text, `brand_voice` text, `content_pillars` text[]
- `linkedin_page_id` text (the company page numeric ID, e.g. 127924150)
- `linkedin_person_id` text (member's personal ID from /v2/userinfo `sub` — fallback author)
- `linkedin_access_token` text, `linkedin_token_expires_at` timestamptz (~2 month TTL)
- `telegram_chat_id` text, `posting_schedule` jsonb (array of `{day, time}` in UTC), `is_active` bool

**`posts`**
- `id` uuid PK, `client_id` FK, `caption` text, `image_prompt` text, `image_url` text
- `platform` ('linkedin'), `status`: `draft | pending_approval | approved | rejected | published | failed`
- `scheduled_at`, `published_at`, `linkedin_post_id`, `rejection_reason`, `error_message`, `retry_count`

**`post_history`** — audit trail of every status transition (`previous_status`, `new_status`, `changed_by`, `note`)

**Storage:** `post-images` public bucket, path `{clientId}/{fileId}.png`

**RLS:** single-tenant — all tables allow `authenticated` role full access; webhooks/Edge Functions use service role.

**Cron (pg_cron, jobs visible via `SELECT * FROM cron.job`):**
- `generate-drafts-hourly` (`0 * * * *`) → POSTs to Edge Function `generate-drafts`
- `publish-posts-15min` (`*/15 * * * *`) → POSTs to Edge Function `publish-posts`

---

## 6. Codebase map

```
app/
  (dashboard)/            # auth-protected route group: overview, clients CRUD, posts list/detail
  login/  auth/callback/  privacy/
  api/
    generate/             # orchestrates: Claude caption → (DALL-E image) → insert post → Telegram notify
    approve/  reject/     # status transitions + history
    publish/              # manual publish, org→person fallback
    linkedin/oauth/ + callback/   # OAuth; callback also fetches /v2/userinfo for person ID
    telegram/webhook/     # handles bot button taps; verifies X-Telegram-Bot-Api-Secret-Token
    clients/ + clients/[id]/
lib/
  supabase/  (client, server, middleware, admin)   # @supabase/ssr pattern
  ai/        (claude.ts, dalle.ts)
  linkedin/  (auth.ts, publish.ts)                 # publish tries page, falls back to person
  telegram/  (bot.ts, webhook.ts)
  schedule.ts  types.ts
components/   (ui/, layout/, clients/, posts/)
supabase/
  migrations/             # applied; keep in sync with prod
  functions/              # Deno Edge Functions (excluded from Next tsconfig)
middleware.ts             # auth gate; exclusions: login|privacy|auth/callback|api/telegram/webhook|api/linkedin/callback
```

---

## 7. Critical gotchas (hard-won lessons — do not relearn these)

1. **Vercel env vars:** `vercel env add KEY production <<< "value"` adds a TRAILING NEWLINE that breaks OAuth (`invalid_client`). Always use `printf "value" | vercel env add KEY production`. All current vars are clean.
2. **LinkedIn page posting is gated.** The app only has Default Tier "Share on LinkedIn" (`w_member_social` = personal posting). Posting as the Company Page (`urn:li:organization`) needs `w_organization_social`, which requires **Community Management API** approval — the request button is currently grayed out in the LinkedIn dev portal. The code already handles this: it tries the page first, catches 403 ACCESS_DENIED, and posts as the personal profile (`urn:li:person:{linkedin_person_id}`). When approval is granted: add `w_organization_social` back to `SCOPES` in `lib/linkedin/auth.ts`, redeploy, user clicks Reconnect.
3. **OAuth scopes currently:** `openid profile w_member_social`. Adding unauthorized scopes makes LinkedIn show "Bummer, something went wrong" with no useful detail.
4. **DALL-E URLs expire in 1 hour** — `lib/storage/images.ts` downloads and re-uploads to Supabase Storage immediately. Never store the raw OpenAI URL.
5. **Telegram bots can't message first** — the user must /start the bot before it can send. Already done for chat 716420092; new clients' contacts must do the same.
6. **Edge Functions are Deno:** `npm:` import specifiers, `Deno.env.get()`. They are excluded from the root tsconfig — `npx tsc --noEmit` ignores them, so review them manually after edits.
7. **shadcn CLI is poisoned** for this repo (generates Tailwind v4 components). Write new UI components by hand following the existing patterns in `components/ui/`.
8. **LinkedIn API calls** need `LinkedIn-Version: 202501` and `X-Restli-Protocol-Version: 2.0.0` headers.
9. **Approve ≠ publish.** Approval marks content ready; actual publishing happens via the manual button or the 15-min cron once `scheduled_at` has passed. This is intentional design.

---

## 8. What's NOT done / improvement roadmap

### Missing config (no code needed)
- `OPENAI_API_KEY` — user will add later; image generation activates automatically (code already checks for the key and degrades gracefully to text-only).
- Community Management API approval from LinkedIn (see gotcha #2).

### High-priority improvements (best next batch)
1. **Toast notifications** for approve/reject/generate/publish actions (no feedback currently).
2. **Loading states** — Generate takes 10–15s with no progress indicator.
3. **Editable caption** on the post detail page before approving (the Telegram "Edit" button links there, but there's no edit field — it's a dead end).
4. **Regenerate button** on rejected posts, feeding the rejection reason back into the Claude prompt.
5. **Failure alerts via Telegram** — when cron publishing fails, the user only finds out by checking the dashboard.

### Medium priority
6. Content calendar view (weekly/monthly grid of scheduled+published posts).
7. Manual date/time picker for scheduling individual posts.
8. Multiple caption variations per generation, pick-best UX.
9. Duplicate-topic guard: include recent post topics in the generation prompt to avoid repetition.
10. Status timeline on post detail page (render `post_history` — data is already recorded).
11. Mobile responsiveness (sidebar → drawer; approvals often happen on phone).
12. LinkedIn token expiry Telegram alert 7 days before (~2-month token TTL; dashboard shows a warning <14 days but nobody looks at dashboards).

### Future
13. More platforms: Meta Graph API (FB/IG), X. `posts.platform` column already exists.
14. Post analytics (impressions/reactions) — blocked on the same LinkedIn API tier as page posting.
15. Telegram reply-to-edit (reply to the bot's draft message with replacement caption text).
16. Multi-operator support (real multi-tenancy — currently single-tenant RLS).

---

## 9. How to verify the system is healthy

```bash
# 1. Build passes
npx tsc --noEmit && npx next build

# 2. Cron jobs active (via Management API SQL):
#    SELECT jobid, jobname, schedule, active FROM cron.job;
#    Expect: generate-drafts-hourly, publish-posts-15min, both active=true

# 3. Recent cron executions:
#    SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

# 4. Telegram webhook registered:
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
#    Expect url = https://socialigent.vercel.app/api/telegram/webhook

# 5. End-to-end: dashboard → client → Generate Post → Telegram message arrives →
#    tap Approve → post status becomes approved → Publish button → live on LinkedIn
```

## 10. Deploy commands

```bash
# Web app (or just push to master — GitHub integration auto-deploys)
vercel --prod

# Edge Functions
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy <name> --project-ref qdpgfyfrpzrqwpzcuyju

# Schema changes: run SQL via Management API (section 4), then add a matching
# file to supabase/migrations/ so the repo stays the source of truth.
```
