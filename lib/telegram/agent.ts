import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAndQueuePost } from '@/lib/ai/pipeline'
import type { Client } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── History compaction ──────────────────────────────────────────────────────
// Triggered when estimated token count of stored history exceeds COMPACT_THRESHOLD.
// Older messages are summarised into a single compact note, then deleted.
// The summary is stored with a '[SUMMARY]' prefix so the loader can inject it
// into the system prompt rather than the messages array (avoids role ordering issues).

const COMPACT_THRESHOLD_TOKENS = 3000  // ~12 000 chars estimated
const KEEP_RECENT_COUNT = 10           // always keep the N most recent messages
const CHARS_PER_TOKEN = 4              // rough estimate

async function compactHistoryIfNeeded(chatId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: allMessages } = await supabase
    .from('telegram_messages')
    .select('id, role, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  if (!allMessages || allMessages.length <= KEEP_RECENT_COUNT) return

  // Estimate total tokens (skip existing summary lines — already compact)
  const totalChars = allMessages.reduce((sum, m) =>
    m.content.startsWith('[SUMMARY]') ? sum : sum + m.content.length, 0)
  const estimatedTokens = totalChars / CHARS_PER_TOKEN

  if (estimatedTokens <= COMPACT_THRESHOLD_TOKENS) return

  // Split: messages to compress vs. recent tail to keep
  const toCompress = allMessages.filter(m => !m.content.startsWith('[SUMMARY]'))
    .slice(0, -KEEP_RECENT_COUNT)
  if (toCompress.length === 0) return

  // Ask Claude Haiku to summarise the older portion
  const transcript = toCompress
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  let summaryText = ''
  try {
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content:
          'Summarise the following conversation in 100–150 words. ' +
          'Preserve key decisions, any post IDs or actions taken, and important context. ' +
          'Write in third person, past tense.\n\n' + transcript,
      }],
    })
    summaryText = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
  } catch {
    // Summarisation failed — fall back to hard delete without a summary
  }

  // Delete the old messages
  const idsToDelete = toCompress.map(m => m.id)
  await supabase.from('telegram_messages').delete().in('id', idsToDelete)

  // Insert the compact summary (placed just before the kept tail)
  if (summaryText) {
    const oldestKeptTime = allMessages[allMessages.length - KEEP_RECENT_COUNT]?.created_at
    const summaryTime = oldestKeptTime
      ? new Date(new Date(oldestKeptTime).getTime() - 1000).toISOString()
      : new Date().toISOString()

    await supabase.from('telegram_messages').insert({
      chat_id: chatId,
      role: 'user',
      content: `[SUMMARY] ${summaryText}`,
      created_at: summaryTime,
    })
  }
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_post',
    description:
      'Generate a new LinkedIn post draft for this client and send it to the approval queue. ' +
      'Use when the user asks to create a post, optionally on a specific topic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'Specific topic, angle, or instructions for the post (optional)',
        },
      },
    },
  },
  {
    name: 'list_posts',
    description: 'List recent posts for this client.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['pending_approval', 'approved', 'published', 'rejected', 'failed', 'all'],
          description: 'Filter by status (default: all)',
        },
      },
    },
  },
  {
    name: 'update_caption',
    description: 'Replace the caption of a specific pending post.',
    input_schema: {
      type: 'object' as const,
      required: ['post_id', 'new_caption'],
      properties: {
        post_id: { type: 'string', description: 'Full post UUID' },
        new_caption: { type: 'string', description: 'Replacement caption text' },
      },
    },
  },
  {
    name: 'approve_post',
    description: 'Approve a pending post so it will be published at its scheduled time.',
    input_schema: {
      type: 'object' as const,
      required: ['post_id'],
      properties: {
        post_id: { type: 'string' },
      },
    },
  },
  {
    name: 'reject_post',
    description: 'Reject a pending post with an optional reason.',
    input_schema: {
      type: 'object' as const,
      required: ['post_id'],
      properties: {
        post_id: { type: 'string' },
        reason: { type: 'string', description: 'Why this post was rejected' },
      },
    },
  },
  {
    name: 'reschedule_post',
    description: 'Change the scheduled publishing time of a post.',
    input_schema: {
      type: 'object' as const,
      required: ['post_id', 'scheduled_at'],
      properties: {
        post_id: { type: 'string' },
        scheduled_at: {
          type: 'string',
          description: 'New datetime in ISO 8601 UTC format, e.g. 2026-06-13T08:00:00Z',
        },
      },
    },
  },
]

// ─── Tool executor ───────────────────────────────────────────────────────────

type ToolInput = Record<string, string>

async function executeTool(
  name: string,
  input: ToolInput,
  client: Client,
  imageUrl?: string
): Promise<string> {
  const supabase = createAdminClient()
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://socialigent.vercel.app').trim()

  switch (name) {
    case 'generate_post': {
      try {
        const post = await generateAndQueuePost({
          client,
          topic: input.topic,
          imageUrl,
          suppressTelegram: false, // sends approval message with buttons as a separate msg
        })
        return (
          `✅ Draft created (ID: ${post.id.slice(0, 8)}…)\n` +
          `Preview: "${post.caption.slice(0, 150)}…"\n\n` +
          `An approval message with Approve/Reject buttons has been sent. ` +
          `You can also review it at ${appUrl}/posts/${post.id}`
        )
      } catch (err) {
        return `Failed to generate post: ${err instanceof Error ? err.message : 'unknown error'}`
      }
    }

    case 'list_posts': {
      const statusFilter = !input.status || input.status === 'all' ? null : input.status
      let query = supabase
        .from('posts')
        .select('id, caption, status, scheduled_at, published_at, created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(8)
      if (statusFilter) query = query.eq('status', statusFilter)

      const { data, error } = await query
      if (error) return 'Failed to fetch posts.'
      if (!data?.length) return 'No posts found.'

      return data
        .map((p) => {
          const status = p.status.replace('_', ' ')
          const preview = p.caption?.slice(0, 70) ?? '(no caption)'
          const date = p.scheduled_at
            ? new Date(p.scheduled_at).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : new Date(p.created_at).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', month: 'short', day: 'numeric' })
          return `• [${status}] ${preview}… (${date}) — ID: ${p.id.slice(0, 8)}`
        })
        .join('\n')
    }

    case 'update_caption': {
      const { error } = await supabase
        .from('posts')
        .update({ caption: input.new_caption, updated_at: new Date().toISOString() })
        .eq('id', input.post_id)
        .eq('client_id', client.id)
        .in('status', ['pending_approval', 'draft'])

      if (error) return 'Failed to update caption. Make sure the post ID is correct and the post is still pending.'
      return '✅ Caption updated.'
    }

    case 'approve_post': {
      const { error } = await supabase
        .from('posts')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', input.post_id)
        .eq('client_id', client.id)
        .eq('status', 'pending_approval')

      if (error) return 'Failed to approve — post may already be approved or not found.'

      await supabase.from('post_history').insert({
        post_id: input.post_id,
        previous_status: 'pending_approval',
        new_status: 'approved',
        changed_by: 'telegram:agent',
        note: 'Approved via Telegram conversation',
      })
      return '✅ Post approved. It will be published at its scheduled time.'
    }

    case 'reject_post': {
      const { error } = await supabase
        .from('posts')
        .update({
          status: 'rejected',
          rejection_reason: input.reason ?? 'Rejected via Telegram chat',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.post_id)
        .eq('client_id', client.id)

      if (error) return 'Failed to reject post.'

      await supabase.from('post_history').insert({
        post_id: input.post_id,
        previous_status: 'pending_approval',
        new_status: 'rejected',
        changed_by: 'telegram:agent',
        note: input.reason ? `Rejected: ${input.reason}` : 'Rejected via Telegram conversation',
      })
      return '❌ Post rejected.'
    }

    case 'reschedule_post': {
      const { error } = await supabase
        .from('posts')
        .update({ scheduled_at: input.scheduled_at, updated_at: new Date().toISOString() })
        .eq('id', input.post_id)
        .eq('client_id', client.id)

      if (error) return 'Failed to reschedule.'

      const formatted = new Date(input.scheduled_at).toLocaleString('en-KE', {
        timeZone: 'Africa/Nairobi',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      return `✅ Rescheduled to ${formatted} EAT.`
    }

    default:
      return 'Unknown tool.'
  }
}

// ─── Main agent entry point ──────────────────────────────────────────────────

export async function runAgent(opts: {
  chatId: string
  client: Client
  userMessage: string
  imageUrl?: string  // already uploaded to Storage
}): Promise<string> {
  const { chatId, client, userMessage, imageUrl } = opts
  const supabase = createAdminClient()

  // Compact history if it has grown too large (summarises + deletes old messages)
  await compactHistoryIfNeeded(chatId)

  // Load recent history — pick up summary entry + last KEEP_RECENT_COUNT messages
  const { data: history } = await supabase
    .from('telegram_messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(KEEP_RECENT_COUNT + 2) // +2 to catch any summary entry

  // Separate summary (injected into system prompt) from real conversation messages
  let conversationSummary = ''
  const recentHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const msg of history ?? []) {
    if (msg.content.startsWith('[SUMMARY]')) {
      conversationSummary = msg.content.replace('[SUMMARY]', '').trim()
    } else {
      recentHistory.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
    }
  }

  // Persist incoming user message
  const userContent = imageUrl
    ? `[Photo sent${userMessage ? ': ' + userMessage : ''}] Image stored at: ${imageUrl}`
    : userMessage
  await supabase.from('telegram_messages').insert({
    chat_id: chatId,
    role: 'user',
    content: userContent,
  })

  const systemPrompt = `You are a social media assistant for "${client.name}" on the Socialigent platform.

Client profile:
• Brand voice: ${client.brand_voice}
• Content pillars: ${(client.content_pillars ?? []).join(', ') || 'general topics'}
• Posting schedule: ${
    client.posting_schedule?.length
      ? client.posting_schedule.map((s) => `${s.day} at ${s.time} UTC`).join(', ')
      : 'not configured'
  }

Your role:
- Help the client manage their LinkedIn content
- Generate posts on request (with or without a specific topic)
- When a user sends a photo, use generate_post with the photo's image URL as context in the topic field
- List, approve, reject, or reschedule posts
- Answer social media strategy questions in the client's brand voice
- Be warm, concise, and practical — keep replies under 250 words unless listing posts

Post IDs: when referencing a post, use only the first 8 characters for readability (e.g. "abc12345…").
Current time (UTC): ${new Date().toISOString()}${
    conversationSummary
      ? `\n\nEarlier conversation (summarised to save context):\n${conversationSummary}`
      : ''
  }`

  // Build message list for Claude
  const messages: Anthropic.MessageParam[] = [
    ...recentHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    {
      role: 'user',
      content: imageUrl
        ? `${userMessage ? userMessage + '\n\n' : ''}[The user sent a photo. It has already been uploaded to storage. Image URL: ${imageUrl} — offer to create a LinkedIn post from it, or use generate_post with the URL as part of the topic.]`
        : userMessage,
    },
  ]

  // Agentic loop: keep calling Claude until stop_reason is end_turn
  const currentMessages = [...messages]
  let finalText = ''

  for (let i = 0; i < 6; i++) { // safety limit — 6 tool calls max per turn
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    })

    if (result.stop_reason === 'end_turn') {
      finalText = result.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      break
    }

    if (result.stop_reason === 'tool_use') {
      currentMessages.push({ role: 'assistant', content: result.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of result.content) {
        if (block.type === 'tool_use') {
          const output = await executeTool(
            block.name,
            block.input as ToolInput,
            client,
            imageUrl
          )
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: output })
        }
      }
      currentMessages.push({ role: 'user', content: toolResults })
      continue
    }

    // Any other stop reason — extract text and break
    finalText = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || 'Sorry, I could not process that request.'
    break
  }

  if (!finalText) finalText = 'Done.'

  // Persist assistant response
  await supabase.from('telegram_messages').insert({
    chat_id: chatId,
    role: 'assistant',
    content: finalText,
  })

  return finalText
}
