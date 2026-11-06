// Supabase Edge Function: runs hourly via pg_cron.
// For each active brand with a posting slot in the next hour, drafts a post,
// queues it for approval, and sends it to the brand's Telegram chat.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.40'
import {
  CAPTION_MODEL,
  POST_SYSTEM_PROMPT,
  buildPostPrompt,
  isDraftingPaused,
  nextSlotDate,
  parsePostResponse,
} from '../_shared/content.ts'
import { generateImage } from '../_shared/image.ts'
import { buildApprovalMessage, telegramCall } from '../_shared/telegram.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || undefined
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://socialigent.vercel.app'

const SLOT_WINDOW_MS = 60 * 60 * 1000 // look one hour ahead (matches the cron)
const SLOT_TOLERANCE_MS = 15 * 60 * 1000
const CONCURRENCY = 4

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

interface ClientRow {
  id: string
  name: string
  brand_voice: string
  content_pillars: string[] | null
  posting_schedule: unknown
  telegram_chat_id: string | null
}

async function draftForClient(client: ClientRow, now: Date): Promise<string> {
  const nextSlot = nextSlotDate(client.posting_schedule, now)
  if (!nextSlot || nextSlot.getTime() > now.getTime() + SLOT_WINDOW_MS) return 'no_slot_due'

  // Already have a post for this slot?
  const { data: existing } = await supabase
    .from('posts')
    .select('id')
    .eq('client_id', client.id)
    .gte('scheduled_at', new Date(nextSlot.getTime() - SLOT_TOLERANCE_MS).toISOString())
    .lte('scheduled_at', new Date(nextSlot.getTime() + SLOT_TOLERANCE_MS).toISOString())
    .in('status', ['draft', 'pending_approval', 'approved', 'publishing', 'published'])
    .limit(1)
  if (existing?.length) return 'slot_filled'

  const { data: recent } = await supabase
    .from('posts')
    .select('caption, status, scheduled_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Nobody reviewed the last few drafts: stop spending on new ones.
  if (isDraftingPaused(recent ?? [], now)) return 'paused:unreviewed_drafts'

  const msg = await anthropic.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 1536,
    system: POST_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildPostPrompt(client, {
          recentCaptions: (recent ?? []).map((p: { caption: string }) => p.caption).filter(Boolean),
        }),
      },
    ],
  })
  const raw = msg.content.map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text ?? '' : '')).join('')
  const { captions, imagePrompt } = parsePostResponse(raw)

  // AI image (optional; failures never block the draft)
  let imageUrl: string | null = null
  let imageError: string | null = null
  if (OPENAI_API_KEY && imagePrompt) {
    try {
      const image = await generateImage({ apiKey: OPENAI_API_KEY, prompt: imagePrompt, model: IMAGE_MODEL })
      const path = `${client.id}/${crypto.randomUUID()}.${image.extension}`
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(path, image.bytes, { contentType: image.contentType, upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      imageUrl = supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl
    } catch (err) {
      imageError = err instanceof Error ? err.message : String(err)
    }
  }

  const { data: post, error: insertError } = await supabase
    .from('posts')
    .insert({
      client_id: client.id,
      caption: captions[0],
      caption_variations: captions,
      image_prompt: imagePrompt || null,
      image_url: imageUrl,
      platform: 'linkedin',
      status: 'pending_approval',
      scheduled_at: nextSlot.toISOString(),
      error_message: imageError,
    })
    .select('id, caption, image_url')
    .single()
  if (insertError || !post) throw new Error(`insert failed: ${insertError?.message}`)

  const { error: historyError } = await supabase.from('post_history').insert({
    post_id: post.id,
    previous_status: 'draft',
    new_status: 'pending_approval',
    changed_by: 'edge_function:generate-drafts',
    note: 'Generated for the next posting slot',
  })
  if (historyError) console.error('post_history insert failed:', historyError.message)

  if (BOT_TOKEN && client.telegram_chat_id) {
    const { method, body } = buildApprovalMessage({
      chatId: client.telegram_chat_id,
      brandName: client.name,
      post,
      appUrl: APP_URL,
    })
    await telegramCall(BOT_TOKEN, method, body)
  }

  return 'generated'
}

Deno.serve(async () => {
  const now = new Date()

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, brand_voice, content_pillars, posting_schedule, telegram_chat_id')
    .eq('is_active', true)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // Brands share popular slots (onboarding defaults to 06:00 UTC), so draft a
  // few at a time rather than one after another, and isolate failures.
  const results = await mapWithConcurrency((clients ?? []) as ClientRow[], CONCURRENCY, async (client) => {
    try {
      return { clientId: client.id, status: await draftForClient(client, now) }
    } catch (err) {
      return { clientId: client.id, status: `error: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  return new Response(JSON.stringify({ processed: results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
