import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAndQueuePost } from '@/lib/ai/pipeline'
import { publishPost } from '@/lib/linkedin/publish'
import { HUMAN_WRITING_RULES, stripAiMarkers } from '@/lib/ai/style'
import { appUrl } from '@/lib/telegram/bot'
import { SUMMARY_PREFIX, stripSummaryPrefix, toConversation, type StoredMessage } from '@/lib/telegram/history'
import { describeTimeZone, formatInTimeZone, localTimeToUtc, safeTimeZone } from '@/lib/time'
import { CAPTION_MODEL } from '@/supabase/functions/_shared/content'
import type { Client } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── History compaction ──────────────────────────────────────────────────────
// When stored history grows past COMPACT_THRESHOLD_TOKENS, everything except
// the newest KEEP_RECENT_COUNT messages (including any earlier summary) is
// folded into one '[SUMMARY]' row. The loader puts that summary in the system
// prompt rather than the messages array.

const COMPACT_THRESHOLD_TOKENS = 3000 // ~12,000 chars
const KEEP_RECENT_COUNT = 10
const CHARS_PER_TOKEN = 4

async function compactHistoryIfNeeded(chatId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: allMessages } = await supabase
    .from('telegram_messages')
    .select('id, role, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  if (!allMessages || allMessages.length <= KEEP_RECENT_COUNT) return

  const totalChars = allMessages.reduce((sum, m) => sum + m.content.length, 0)
  if (totalChars / CHARS_PER_TOKEN <= COMPACT_THRESHOLD_TOKENS) return

  const toCompress = allMessages.slice(0, -KEEP_RECENT_COUNT)
  if (toCompress.length === 0) return

  const transcript = toCompress
    .map((m) =>
      m.content.startsWith(SUMMARY_PREFIX)
        ? `Earlier summary: ${stripSummaryPrefix(m.content)}`
        : `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    )
    .join('\n')

  let summaryText = ''
  try {
    const result = await anthropic.messages.create({
      model: CAPTION_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content:
            'Summarise the following conversation in 100-150 words. ' +
            'Preserve key decisions, any post IDs or actions taken, and important context. ' +
            'Write in third person, past tense.\n\n' +
            transcript,
        },
      ],
    })
    summaryText = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch {
    // Summarisation failed; keep the history and try again next turn.
    return
  }
  if (!summaryText) return

  await supabase
    .from('telegram_messages')
    .delete()
    .in(
      'id',
      toCompress.map((m) => m.id)
    )

  // Timestamp the summary just before the oldest kept message.
  const oldestKept = allMessages[allMessages.length - KEEP_RECENT_COUNT]?.created_at
  await supabase.from('telegram_messages').insert({
    chat_id: chatId,
    role: 'user',
    content: `${SUMMARY_PREFIX} ${summaryText}`,
    created_at: oldestKept
      ? new Date(new Date(oldestKept).getTime() - 1000).toISOString()
      : new Date().toISOString(),
  })
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'generate_post',
    description:
      'Generate a new LinkedIn post draft for this brand and send it to the approval queue. ' +
      'Use when the user asks to create a post, optionally on a specific topic and/or at a specific time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'Specific topic, angle, or instructions for the post (optional)',
        },
        scheduled_at: {
          type: 'string',
          description:
            'Optional publish time in ISO 8601 UTC, e.g. 2026-06-13T08:00:00Z. ' +
            "Omit to use the brand's next schedule slot.",
        },
      },
    },
  },
  {
    name: 'publish_now',
    description:
      'Publish a post to LinkedIn immediately, skipping the scheduled time. ' +
      'Works on pending, approved, or failed posts (asking to publish a pending post counts as approving it).',
    input_schema: {
      type: 'object' as const,
      required: ['post_id'],
      properties: {
        post_id: { type: 'string', description: 'Post ID (full UUID or the first 8 characters)' },
      },
    },
  },
  {
    name: 'list_posts',
    description: 'List recent posts for this brand.',
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
    name: 'get_post',
    description:
      'Fetch the full caption, status, and schedule of a specific post. ' +
      'Use this before rewriting a caption or when the user asks what a post says.',
    input_schema: {
      type: 'object' as const,
      required: ['post_id'],
      properties: {
        post_id: { type: 'string', description: 'Post ID (full UUID or the first 8 characters)' },
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
        post_id: { type: 'string', description: 'Post ID (full UUID or the first 8 characters)' },
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
    description: 'Reject a pending or approved post with an optional reason.',
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
    description: 'Change the scheduled publishing time of a post that has not been published yet.',
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

type ToolInput = Record<string, string | undefined>
type Admin = ReturnType<typeof createAdminClient>

// Colour dots matching the dashboard status palette (calendar legend)
const STATUS_EMOJI: Record<string, string> = {
  draft: '⚪',
  pending_approval: '🟡',
  approved: '🔵',
  publishing: '⏳',
  published: '🟢',
  rejected: '🔴',
  failed: '🔴',
}

const label = (status: string) => `${STATUS_EMOJI[status] ?? '⚪'} ${status.replace('_', ' ')}`

// The agent mostly sees 8-char short IDs (list_posts output). Resolve a
// prefix back to the full UUID, always scoped to this brand.
async function resolvePostId(supabase: Admin, clientId: string, idOrPrefix: string | undefined): Promise<string | null> {
  const clean = (idOrPrefix ?? '').trim().toLowerCase().replace(/[….]+$/, '')
  if (!/^[a-f0-9-]{4,36}$/.test(clean)) return null

  const { data } = await supabase
    .from('posts')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(200)

  return data?.find((p: { id: string }) => p.id.startsWith(clean))?.id ?? null
}

async function getOwnedPost(supabase: Admin, clientId: string, idOrPrefix: string | undefined) {
  const postId = await resolvePostId(supabase, clientId, idOrPrefix)
  if (!postId) return null
  const { data } = await supabase
    .from('posts')
    .select('id, caption, status, scheduled_at, published_at, image_url')
    .eq('id', postId)
    .eq('client_id', clientId)
    .maybeSingle()
  return data
}

const NOT_FOUND = 'Post not found. Use list_posts to check the ID.'

async function executeTool(name: string, input: ToolInput, client: Client, tz: string, imageUrl?: string): Promise<string> {
  const supabase = createAdminClient()
  const now = () => new Date().toISOString()

  switch (name) {
    case 'generate_post': {
      if (input.scheduled_at && Number.isNaN(Date.parse(input.scheduled_at))) {
        return 'That schedule time is not a valid ISO 8601 date.'
      }
      try {
        const post = await generateAndQueuePost({
          client,
          topic: input.topic,
          imageUrl,
          scheduledAt: input.scheduled_at ? new Date(input.scheduled_at).toISOString() : undefined,
          actor: 'telegram:agent',
        })
        return (
          `✅ Draft created (ID: ${post.id.slice(0, 8)})\n` +
          `Preview: "${post.caption.slice(0, 150)}…"\n\n` +
          `An approval message with Approve/Reject buttons has been sent. ` +
          `You can also review it at ${appUrl()}/posts/${post.id}`
        )
      } catch (err) {
        return `Failed to generate post: ${err instanceof Error ? err.message : 'unknown error'}`
      }
    }

    case 'list_posts': {
      const statusFilter = !input.status || input.status === 'all' ? null : input.status
      let query = supabase
        .from('posts')
        .select('id, caption, status, scheduled_at, created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(8)
      if (statusFilter) query = query.eq('status', statusFilter)

      const { data, error } = await query
      if (error) return 'Failed to fetch posts.'
      if (!data?.length) return 'No posts found.'

      return data
        .map((p) => {
          const preview = p.caption?.slice(0, 70) ?? '(no caption)'
          const when = formatInTimeZone(p.scheduled_at ?? p.created_at, tz)
          return `${label(p.status)}: ${preview}… (${when}) ID: ${p.id.slice(0, 8)}`
        })
        .join('\n')
    }

    case 'get_post': {
      const post = await getOwnedPost(supabase, client.id, input.post_id)
      if (!post) return NOT_FOUND
      const sched = post.scheduled_at ? formatInTimeZone(post.scheduled_at, tz) : 'not scheduled'
      return `Status: ${label(post.status)}\nScheduled: ${sched}\nImage: ${post.image_url ? 'yes' : 'no'}\n\nCaption:\n${post.caption}`
    }

    case 'update_caption': {
      if (!input.new_caption?.trim()) return 'The new caption is empty.'
      const post = await getOwnedPost(supabase, client.id, input.post_id)
      if (!post) return NOT_FOUND

      const { data } = await supabase
        .from('posts')
        .update({ caption: stripAiMarkers(input.new_caption.trim()), updated_at: now() })
        .eq('id', post.id)
        .in('status', ['pending_approval', 'draft'])
        .select('id')
      if (!data?.length) return `Can't edit this post: it is ${post.status.replace('_', ' ')}. Only pending posts can be edited.`
      return '✅ Caption updated.'
    }

    case 'approve_post': {
      const post = await getOwnedPost(supabase, client.id, input.post_id)
      if (!post) return NOT_FOUND

      const { data } = await supabase
        .from('posts')
        .update({ status: 'approved', updated_at: now() })
        .eq('id', post.id)
        .in('status', ['pending_approval', 'draft'])
        .select('id')
      if (!data?.length) return `Can't approve: the post is already ${post.status.replace('_', ' ')}.`

      await supabase.from('post_history').insert({
        post_id: post.id,
        previous_status: post.status,
        new_status: 'approved',
        changed_by: 'telegram:agent',
        note: 'Approved via Telegram conversation',
      })
      return '✅ Post approved. It will be published at its scheduled time.'
    }

    case 'reject_post': {
      const post = await getOwnedPost(supabase, client.id, input.post_id)
      if (!post) return NOT_FOUND

      const { data } = await supabase
        .from('posts')
        .update({
          status: 'rejected',
          rejection_reason: input.reason ?? 'Rejected via Telegram chat',
          updated_at: now(),
        })
        .eq('id', post.id)
        .in('status', ['pending_approval', 'draft', 'approved'])
        .select('id')
      if (!data?.length) return `Can't reject: the post is already ${post.status.replace('_', ' ')}.`

      await supabase.from('post_history').insert({
        post_id: post.id,
        previous_status: post.status,
        new_status: 'rejected',
        changed_by: 'telegram:agent',
        note: input.reason ? `Rejected: ${input.reason}` : 'Rejected via Telegram conversation',
      })
      return '❌ Post rejected.'
    }

    case 'reschedule_post': {
      if (!input.scheduled_at || Number.isNaN(Date.parse(input.scheduled_at))) {
        return 'That schedule time is not a valid ISO 8601 date.'
      }
      const post = await getOwnedPost(supabase, client.id, input.post_id)
      if (!post) return NOT_FOUND

      const scheduledAt = new Date(input.scheduled_at).toISOString()
      const { data } = await supabase
        .from('posts')
        .update({ scheduled_at: scheduledAt, updated_at: now() })
        .eq('id', post.id)
        .in('status', ['draft', 'pending_approval', 'approved', 'failed', 'rejected'])
        .select('id')
      if (!data?.length) return `Can't reschedule a post that is ${post.status.replace('_', ' ')}.`
      return `✅ Rescheduled to ${formatInTimeZone(scheduledAt, tz)}.`
    }

    case 'publish_now': {
      const postId = await resolvePostId(supabase, client.id, input.post_id)
      if (!postId) return NOT_FOUND

      const result = await publishPost(supabase, {
        postId,
        allowedFrom: ['pending_approval', 'approved', 'failed', 'draft'],
        actor: 'telegram:agent',
        storageBaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      })
      if (result.ok) {
        return `🚀 Published to LinkedIn just now (as ${result.postedAs === 'organization' ? 'the company page' : 'the personal profile'}).`
      }
      return result.code === 'linkedin_error' ? `❌ Publish failed: ${result.message}` : result.message
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
  imageUrl?: string // already uploaded to Storage
}): Promise<string> {
  const { chatId, client, userMessage, imageUrl } = opts
  const supabase = createAdminClient()
  const tz = safeTimeZone(client.timezone)

  await compactHistoryIfNeeded(chatId)

  // Newest-first so LIMIT keeps the most recent turns; summary loaded apart.
  const [{ data: summaryRow }, { data: recentRows }] = await Promise.all([
    supabase
      .from('telegram_messages')
      .select('content')
      .eq('chat_id', chatId)
      .like('content', `${SUMMARY_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('telegram_messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .not('content', 'like', `${SUMMARY_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(KEEP_RECENT_COUNT),
  ])

  const conversationSummary = summaryRow ? stripSummaryPrefix(summaryRow.content) : ''
  const recentHistory = toConversation((recentRows ?? []) as StoredMessage[])

  // Persist the incoming user message
  await supabase.from('telegram_messages').insert({
    chat_id: chatId,
    role: 'user',
    content: imageUrl ? `[Photo sent${userMessage ? ': ' + userMessage : ''}] Image stored at: ${imageUrl}` : userMessage,
  })

  const nineLocalInUtc = localTimeToUtc('09:00', tz)
  const systemPrompt = `You are a social media assistant for "${client.name}" on the Socialigent platform.

Brand profile:
• Brand voice: ${client.brand_voice}
• Content pillars: ${(client.content_pillars ?? []).join(', ') || 'general topics'}
• Posting schedule: ${
    client.posting_schedule?.length
      ? client.posting_schedule.map((s) => `${s.day} at ${s.time} UTC`).join(', ')
      : 'not configured'
  }

Your role:
- Help the user manage their LinkedIn content
- Generate posts on request (with or without a specific topic, optionally scheduled for a specific time via generate_post's scheduled_at)
- When a user sends a photo, use generate_post with the photo's image URL as context in the topic field
- List, approve, reject, or reschedule posts
- When the user says "post it now", "publish now", or similar, use publish_now: it publishes to LinkedIn immediately
- Answer social media strategy questions in the brand voice
- Be warm, concise, and practical: keep replies under 250 words unless listing posts
- Format for Telegram chat: short paragraphs, **bold** for key info, • bullets for lists. Never use markdown headers (#), tables, or code blocks
- When mentioning a post's status, prefix it with its colour dot: 🟢 published, 🔵 approved, 🟡 pending approval, 🔴 rejected/failed, ⚪ draft

Times: the user's timezone is ${describeTimeZone(tz)}. When they give a time in natural language ("tomorrow 9am", "Friday evening"), interpret it in that timezone and convert to ISO 8601 UTC for tool calls (today, 09:00 their time = ${nineLocalInUtc} UTC). Confirm scheduled times back to the user in their local time.

Replies to a post: when the user's message starts with "[Replying to post <id>]", they replied directly to that post's Telegram message: that post is the target. Read their intent from the words:
- "post it now", "publish", "send it" → publish_now
- "approve", "looks good", "yes" → approve_post
- "reject", "cancel", "drop it" → reject_post
- a date or time → reschedule_post
- "try again", "regenerate", "different angle", or feedback like "too formal" → reject_post with their feedback as the reason, then generate_post with the feedback in the topic
- requests to tweak ("shorter", "add a stat", "remove the last line") → get_post to read the current caption, rewrite it yourself, then update_caption
- a full block of text that reads like a caption (not a command) → update_caption with their text VERBATIM, do not rewrite it

When you write or rewrite a caption yourself (update_caption), it must sound like a real person typed it. Apply these rules to caption text:
${HUMAN_WRITING_RULES}

Post IDs: when referencing a post, use only the first 8 characters for readability (e.g. "abc12345").
Current time (UTC): ${new Date().toISOString()}${
    conversationSummary ? `\n\nEarlier conversation (summarised to save context):\n${conversationSummary}` : ''
  }`

  const currentMessages: Anthropic.MessageParam[] = [
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content: imageUrl
        ? `${userMessage ? userMessage + '\n\n' : ''}[The user sent a photo. It has already been uploaded to storage. Image URL: ${imageUrl}. Offer to create a LinkedIn post from it, or use generate_post with the URL as part of the topic.]`
        : userMessage,
    },
  ]

  // Agentic loop: keep calling Claude until it stops asking for tools.
  let finalText = ''
  for (let i = 0; i < 6; i++) {
    const result = await anthropic.messages.create({
      model: CAPTION_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    })

    const text = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (result.stop_reason !== 'tool_use') {
      finalText = text || 'Sorry, I could not process that request.'
      break
    }

    currentMessages.push({ role: 'assistant', content: result.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of result.content) {
      if (block.type === 'tool_use') {
        const output = await executeTool(block.name, block.input as ToolInput, client, tz, imageUrl)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: output })
      }
    }
    currentMessages.push({ role: 'user', content: toolResults })
  }

  if (!finalText) finalText = 'Done.'

  await supabase.from('telegram_messages').insert({
    chat_id: chatId,
    role: 'assistant',
    content: finalText,
  })

  return finalText
}
