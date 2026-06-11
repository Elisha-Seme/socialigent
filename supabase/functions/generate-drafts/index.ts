// Supabase Edge Function — runs hourly via cron
// Checks each active client's posting schedule and generates posts when a slot is upcoming.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.40'
import OpenAI from 'npm:openai@4'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const openai = Deno.env.get('OPENAI_API_KEY')
  ? new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })
  : null

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function nextSlotDate(schedule: Array<{ day: string; time: string }>, from: Date): Date | null {
  if (!schedule.length) return null
  const fromDay = from.getDay()
  const fromMinutes = from.getHours() * 60 + from.getMinutes()
  let best: Date | null = null

  for (const slot of schedule) {
    const slotDay = DAYS.indexOf(slot.day)
    if (slotDay === -1) continue
    const [h, m] = slot.time.split(':').map(Number)
    const slotMinutes = h * 60 + m

    let daysAhead = slotDay - fromDay
    if (daysAhead < 0 || (daysAhead === 0 && slotMinutes <= fromMinutes)) {
      daysAhead += 7
    }

    const candidate = new Date(from)
    candidate.setDate(candidate.getDate() + daysAhead)
    candidate.setHours(h, m, 0, 0)

    if (!best || candidate < best) best = candidate
  }
  return best
}

Deno.serve(async (_req) => {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour ahead

  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .eq('is_active', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: Array<{ clientId: string; status: string }> = []

  for (const client of clients ?? []) {
    if (!client.posting_schedule?.length) continue

    const nextSlot = nextSlotDate(client.posting_schedule, now)
    if (!nextSlot || nextSlot > windowEnd) continue

    // Check if there's already a post scheduled for this slot
    const slotStart = new Date(nextSlot.getTime() - 15 * 60 * 1000).toISOString()
    const slotEnd = new Date(nextSlot.getTime() + 15 * 60 * 1000).toISOString()

    const { data: existing } = await supabase
      .from('posts')
      .select('id')
      .eq('client_id', client.id)
      .gte('scheduled_at', slotStart)
      .lte('scheduled_at', slotEnd)
      .in('status', ['draft', 'pending_approval', 'approved', 'published'])
      .limit(1)

    if (existing?.length) {
      results.push({ clientId: client.id, status: 'slot_filled' })
      continue
    }

    // Generate content with Claude
    const prompt = `You are a LinkedIn content strategist. Generate a LinkedIn post for this brand.
Brand: ${client.name}
Voice: ${client.brand_voice}
Content pillars: ${(client.content_pillars ?? []).join(', ')}

Respond ONLY with a JSON object like this (no markdown fences):
{"caption":"...","imagePrompt":"..."}`

    let caption = ''
    let imagePrompt = ''
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      const parsed = JSON.parse(cleaned)
      caption = parsed.caption ?? ''
      imagePrompt = parsed.imagePrompt ?? ''
    } catch (err) {
      results.push({ clientId: client.id, status: `claude_error: ${err}` })
      continue
    }

    // Generate image with DALL-E if available
    let imageUrl: string | null = null
    if (openai && imagePrompt) {
      try {
        const imgRes = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          size: '1792x1024',
          quality: 'standard',
          n: 1,
        })
        const tempUrl = imgRes.data[0].url
        if (tempUrl) {
          // Download and re-upload to Supabase Storage
          const imgFetch = await fetch(tempUrl)
          const buffer = await imgFetch.arrayBuffer()
          const { randomUUID } = crypto
          const fileId = randomUUID()
          const { data: upload, error: uploadError } = await supabase.storage
            .from('post-images')
            .upload(`${client.id}/${fileId}.png`, buffer, { contentType: 'image/png', upsert: false })

          if (!uploadError && upload) {
            const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(upload.path)
            imageUrl = publicUrl
          }
        }
      } catch {
        // Image generation failed — continue with text-only post
      }
    }

    // Insert post
    const { data: post, error: insertError } = await supabase
      .from('posts')
      .insert({
        client_id: client.id,
        caption,
        image_prompt: imagePrompt || null,
        image_url: imageUrl,
        platform: 'linkedin',
        status: 'pending_approval',
        scheduled_at: nextSlot.toISOString(),
      })
      .select()
      .single()

    if (insertError || !post) {
      results.push({ clientId: client.id, status: `insert_error: ${insertError?.message}` })
      continue
    }

    await supabase.from('post_history').insert({
      post_id: post.id,
      previous_status: null,
      new_status: 'pending_approval',
      changed_by: 'edge_function:generate-drafts',
    })

    // Send Telegram notification if configured
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (botToken && client.telegram_chat_id) {
      const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''
      const msgCaption =
        `📝 New post for ${client.name}\n\n${caption.slice(0, 900)}\n\n👉 ${appUrl}/posts/${post.id}`
      const replyMarkup = {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `approve:${post.id}` },
          { text: '❌ Reject', callback_data: `reject:${post.id}` },
          { text: '✏️ Edit', callback_data: `edit:${post.id}` },
        ]],
      }
      const endpoint = imageUrl ? 'sendPhoto' : 'sendMessage'
      const body = imageUrl
        ? { chat_id: client.telegram_chat_id, photo: imageUrl, caption: msgCaption, reply_markup: replyMarkup }
        : { chat_id: client.telegram_chat_id, text: msgCaption, reply_markup: replyMarkup }
      await fetch(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {})
    }

    results.push({ clientId: client.id, status: 'generated' })
  }

  return new Response(JSON.stringify({ processed: results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
