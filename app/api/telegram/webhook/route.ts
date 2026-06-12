import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerCallbackQuery } from '@/lib/telegram/bot'
import { verifyWebhookSecret, parseCallbackData, type TelegramUpdate } from '@/lib/telegram/webhook'
import { saveTelegramPhoto, sendTyping, sendMessage } from '@/lib/telegram/photos'
import { runAgent } from '@/lib/telegram/agent'
import { generateAndQueuePost } from '@/lib/ai/pipeline'
import type { Client } from '@/lib/types'

const REGEN_KEYWORDS = [
  'try again', 'regenerate', 'redo', 'new version', 'different', 'rewrite',
  'another one', 'remix', 'change it', 'try something else', 'start over',
]

function isRegenRequest(text: string): boolean {
  const lower = text.toLowerCase()
  return REGEN_KEYWORDS.some(k => lower.includes(k))
}

export const maxDuration = 60

// Find which client owns this chat ID — the access control gate.
async function findClientByChatId(chatId: string): Promise<Client | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .single()
  return (data as Client) ?? null
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 1. Callback query (inline button taps: approve / reject / edit) ─────────
  const callbackQuery = update.callback_query
  if (callbackQuery?.data) {
    const parsed = parseCallbackData(callbackQuery.data)
    if (!parsed) {
      await answerCallbackQuery(callbackQuery.id, 'Unknown action')
      return NextResponse.json({ ok: true })
    }

    const { action, postId } = parsed
    const supabase = createAdminClient()

    const { data: post } = await supabase
      .from('posts')
      .select('id, status, caption, client_id')
      .eq('id', postId)
      .single()

    if (!post) {
      await answerCallbackQuery(callbackQuery.id, 'Post not found')
      return NextResponse.json({ ok: true })
    }

    if (action === 'edit') {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://socialigent.vercel.app').trim()
      await answerCallbackQuery(callbackQuery.id, `Edit at: ${appUrl}/posts/${postId}`)
      return NextResponse.json({ ok: true })
    }

    if (post.status !== 'pending_approval') {
      await answerCallbackQuery(callbackQuery.id, `Post already ${post.status}`)
      return NextResponse.json({ ok: true })
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const changedBy = callbackQuery.from.username
      ? `@${callbackQuery.from.username}`
      : callbackQuery.from.first_name

    await supabase
      .from('posts')
      .update({
        status: newStatus,
        ...(action === 'reject' ? { rejection_reason: `Rejected via Telegram by ${changedBy}` } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)

    await supabase.from('post_history').insert({
      post_id: postId,
      previous_status: post.status,
      new_status: newStatus,
      changed_by: `telegram:${changedBy}`,
      note: `${action === 'approve' ? 'Approved' : 'Rejected'} via Telegram button`,
    })

    await answerCallbackQuery(
      callbackQuery.id,
      action === 'approve' ? '✅ Post approved!' : '❌ Post rejected.'
    )
    return NextResponse.json({ ok: true })
  }

  // ── 2. Regular messages ──────────────────────────────────────────────────────
  const message = update.message
  if (!message) return NextResponse.json({ ok: true })

  const chatId = String(message.chat.id)

  // Access control — only registered chats get AI responses
  const client = await findClientByChatId(chatId)
  if (!client) {
    // Send one polite rejection — don't respond to unknown chats again
    await sendMessage(chatId, 'Sorry, this bot is private. Contact the operator to get access.')
    return NextResponse.json({ ok: true })
  }

  // ── 2a. Reply-to-post shortcut (fast path — edit or regenerate) ─────────────
  if (message.reply_to_message) {
    const parentText =
      message.reply_to_message.text ?? message.reply_to_message.caption ?? ''
    const postIdMatch = parentText.match(/\/posts\/([a-f0-9-]{36})/)

    if (postIdMatch) {
      const postId = postIdMatch[1]
      const newText = message.text?.trim()

      if (newText) {
        const supabase = createAdminClient()
        const { data: post } = await supabase
          .from('posts')
          .select('id, status')
          .eq('id', postId)
          .single()

        if (post) {
          const changedBy = `telegram:${message.from?.username ?? message.from?.first_name ?? 'user'}`

          // Regenerate path: reply contains regeneration keywords
          if (isRegenRequest(newText)) {
            await sendTyping(chatId)

            // Reject the old post with the feedback as reason (if still pending)
            if (post.status === 'pending_approval') {
              await supabase
                .from('posts')
                .update({ status: 'rejected', rejection_reason: newText, updated_at: new Date().toISOString() })
                .eq('id', postId)

              await supabase.from('post_history').insert({
                post_id: postId,
                previous_status: post.status,
                new_status: 'rejected',
                changed_by: changedBy,
                note: `Rejected for regeneration: "${newText}"`,
              })
            }

            try {
              const newPost = await generateAndQueuePost({
                client,
                topic: newText,
                suppressTelegram: false,
              })
              await sendMessage(
                chatId,
                `🔄 Regenerated! New draft created (ID: ${newPost.id.slice(0, 8)}…)\n\nAn approval message has been sent.`,
              )
            } catch (err) {
              await sendMessage(
                chatId,
                `❌ Regeneration failed: ${err instanceof Error ? err.message : 'unknown error'}`,
              )
            }
            return NextResponse.json({ ok: true })
          }

          // Edit path: update caption in-place
          if (post.status === 'pending_approval') {
            await supabase
              .from('posts')
              .update({ caption: newText, updated_at: new Date().toISOString() })
              .eq('id', postId)

            await supabase.from('post_history').insert({
              post_id: postId,
              previous_status: post.status,
              new_status: post.status,
              changed_by: changedBy,
              note: `Caption edited via Telegram reply`,
            })

            await sendMessage(chatId, '✅ Caption updated!')
            return NextResponse.json({ ok: true })
          }
        }
      }
      // No text or post not pending — fall through to agent
    }
  }

  // ── 2b. AI agent — handles photos, text, and everything else ────────────────
  const isPhoto = !!message.photo?.length
  const hasText = !!(message.text ?? message.caption)

  // Ignore unsupported types (stickers, voice, etc.)
  if (!isPhoto && !hasText) return NextResponse.json({ ok: true })

  // Signal to the user that we're working
  await sendTyping(chatId)

  // If a photo was sent, upload it to Storage first
  let imageUrl: string | undefined
  if (isPhoto && message.photo) {
    // Telegram provides multiple sizes; last entry is highest resolution
    const largest = message.photo[message.photo.length - 1]
    const uploaded = await saveTelegramPhoto(largest.file_id, client.id)
    imageUrl = uploaded ?? undefined
  }

  const userText = (message.text ?? message.caption ?? '').trim()

  try {
    const reply = await runAgent({
      chatId,
      client,
      userMessage: userText || (isPhoto ? '(photo)' : ''),
      imageUrl,
    })
    await sendMessage(chatId, reply)
  } catch (err) {
    console.error('Agent error:', err)
    await sendMessage(chatId, 'Sorry, something went wrong on my end. Please try again.')
  }

  return NextResponse.json({ ok: true })
}
