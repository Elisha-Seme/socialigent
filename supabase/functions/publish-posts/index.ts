// Supabase Edge Function: runs every 15 minutes via pg_cron.
// 1. Recovers posts stuck in 'publishing' after a crash (and alerts).
// 2. Once a day, warns brands whose LinkedIn connection is about to expire.
// 3. Publishes approved posts whose scheduled time has passed.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { publishPost, recoverStalePublishing } from '../_shared/linkedin.ts'
import { escapeHtml, telegramCall } from '../_shared/telegram.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const APP_URL = (Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://socialigent.vercel.app').trim().replace(/\/$/, '')
const DAY_MS = 24 * 60 * 60 * 1000
const BATCH_SIZE = 10

async function alert(chatId: string | null, html: string) {
  if (!BOT_TOKEN || !chatId) return
  await telegramCall(BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
}

async function brandFor(clientId: string): Promise<{ name: string; telegram_chat_id: string | null } | null> {
  const { data } = await supabase.from('clients').select('name, telegram_chat_id').eq('id', clientId).maybeSingle()
  return data
}

// Daily at ~09:00 UTC: warn from 7 days before expiry until 7 days after.
async function alertExpiringTokens(now: Date) {
  const { data: clients } = await supabase
    .from('clients')
    .select('name, telegram_chat_id, linkedin_token_expires_at')
    .eq('is_active', true)
    .not('linkedin_token_expires_at', 'is', null)
    .not('telegram_chat_id', 'is', null)

  for (const client of clients ?? []) {
    const daysLeft = Math.ceil((new Date(client.linkedin_token_expires_at).getTime() - now.getTime()) / DAY_MS)
    if (daysLeft > 7 || daysLeft < -7) continue

    const when =
      daysLeft > 0
        ? `expires in <b>${daysLeft} day${daysLeft === 1 ? '' : 's'}</b>`
        : `<b>has expired</b>, so scheduled posts can't be published`
    await alert(
      client.telegram_chat_id,
      `⚠️ <b>LinkedIn connection</b> for <b>${escapeHtml(client.name)}</b> ${when}.\n\n👉 <a href="${APP_URL}/settings">Reconnect in Settings</a>`
    )
  }
}

Deno.serve(async () => {
  const now = new Date()
  const results: Array<{ postId: string; status: string }> = []

  // 1. Crash recovery: never auto-retry, the post may already be live.
  for (const row of await recoverStalePublishing(supabase)) {
    results.push({ postId: row.id, status: 'recovered_stale_publishing' })
    const brand = await brandFor(row.client_id)
    await alert(
      brand?.telegram_chat_id ?? null,
      `⚠️ <b>Publishing was interrupted</b> for <b>${escapeHtml(brand?.name ?? 'your brand')}</b>. Check LinkedIn before retrying: the post may already be live.\n\n👉 <a href="${APP_URL}/posts/${row.id}">View post</a>`
    )
  }

  // 2. Token expiry warning, once a day
  if (now.getUTCHours() === 9 && now.getUTCMinutes() < 15) {
    try {
      await alertExpiringTokens(now)
    } catch (err) {
      console.error('Token expiry check failed:', err)
    }
  }

  // 3. Publish due posts. publishPost() claims each row atomically, so
  // overlapping runs can't publish the same post twice. Only brands with a
  // live LinkedIn connection are selected: otherwise their stuck posts would
  // fill every batch and starve other brands (they get the expiry alert).
  const nowIso = now.toISOString()
  const { data: due, error } = await supabase
    .from('posts')
    .select('id, client_id, clients!inner(linkedin_access_token, linkedin_token_expires_at)')
    .eq('status', 'approved')
    .lte('scheduled_at', nowIso)
    .not('clients.linkedin_access_token', 'is', null)
    .or(`linkedin_token_expires_at.is.null,linkedin_token_expires_at.gt."${nowIso}"`, { referencedTable: 'clients' })
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  for (const post of due ?? []) {
    const outcome = await publishPost(supabase, {
      postId: post.id,
      allowedFrom: ['approved'],
      actor: 'edge_function:publish-posts',
      storageBaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    })

    if (outcome.ok) {
      results.push({ postId: post.id, status: 'published' })
      continue
    }

    results.push({ postId: post.id, status: `${outcome.code}: ${outcome.message}` })
    if (outcome.code === 'linkedin_error' || outcome.code === 'invalid_image') {
      const brand = await brandFor(post.client_id)
      await alert(
        brand?.telegram_chat_id ?? null,
        `⚠️ <b>Failed to publish</b> a post for <b>${escapeHtml(brand?.name ?? 'your brand')}</b>.\n\n<b>Error:</b> ${escapeHtml(outcome.message.slice(0, 500))}\n\n👉 <a href="${APP_URL}/posts/${post.id}">View post</a>`
      )
    }
  }

  return new Response(JSON.stringify({ processed: results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
