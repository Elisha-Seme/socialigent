import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerCallbackQuery, appUrl } from '@/lib/telegram/bot'
import { verifyWebhookSecret, parseCallbackData, type TelegramUpdate } from '@/lib/telegram/webhook'
import { saveTelegramPhoto, sendTyping, sendMessage } from '@/lib/telegram/photos'
import { runAgent } from '@/lib/telegram/agent'
import type { Client } from '@/lib/types'

export const maxDuration = 60

// Which brand this chat is bound to: the access-control gate for the bot.
async function findClientByChatId(chatId: string): Promise<Client | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .limit(1)
    .maybeSingle()
  return (data as Client) ?? null
}

// Telegram re-sends an update if it doesn't get a 2xx quickly, and an agent
// turn (several Claude calls, maybe an image) can take longer than that. So we
// acknowledge immediately and do the work after the response.
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

  waitUntil(
    handleUpdate(update).catch((err) => console.error('Telegram update failed:', err))
  )
  return NextResponse.json({ ok: true })
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {

  // ── 1. Callback query (inline button taps: approve / reject / edit) ─────────
  const callbackQuery = update.callback_query
  if (callbackQuery?.data) {
    const parsed = parseCallbackData(callbackQuery.data)
    if (!parsed) {
      await answerCallbackQuery(callbackQuery.id, 'Unknown action')
      return
    }

    const { action, postId } = parsed
    const supabase = createAdminClient()

    const { data: post } = await supabase
      .from('posts')
      .select('id, status, clients(telegram_chat_id)')
      .eq('id', postId)
      .maybeSingle()

    // Only the chat bound to the post's brand may act on it.
    const tappedFrom = String(callbackQuery.message?.chat.id ?? callbackQuery.from.id)
    const ownerChat = (post?.clients as unknown as { telegram_chat_id: string | null } | null)?.telegram_chat_id
    if (!post || !ownerChat || ownerChat !== tappedFrom) {
      await answerCallbackQuery(callbackQuery.id, 'Post not found')
      return
    }

    if (action === 'edit') {
      await answerCallbackQuery(callbackQuery.id, `Edit at: ${appUrl()}/posts/${postId}`)
      return
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const changedBy = callbackQuery.from.username ? `@${callbackQuery.from.username}` : callbackQuery.from.first_name

    // Only a still-pending post can be approved/rejected (no double taps).
    const { data: changed } = await supabase
      .from('posts')
      .update({
        status: newStatus,
        ...(action === 'reject' ? { rejection_reason: `Rejected via Telegram by ${changedBy}` } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('status', 'pending_approval')
      .select('id')

    if (!changed?.length) {
      await answerCallbackQuery(callbackQuery.id, `Post already ${post.status.replace('_', ' ')}`)
      return
    }

    await supabase.from('post_history').insert({
      post_id: postId,
      previous_status: 'pending_approval',
      new_status: newStatus,
      changed_by: `telegram:${changedBy}`,
      note: `${action === 'approve' ? 'Approved' : 'Rejected'} via Telegram button`,
    })

    await answerCallbackQuery(callbackQuery.id, action === 'approve' ? '✅ Post approved!' : '❌ Post rejected.')
    return
  }

  // ── 2. Regular messages ──────────────────────────────────────────────────────
  const message = update.message
  if (!message) return

  const chatId = String(message.chat.id)

  // ── 2·0 Deep-link connect: /start <token> binds this chat to a brand ────────
  const startMatch = message.text?.match(/^\/start\s+([a-f0-9]{16,64})$/)
  if (startMatch) {
    const supabase = createAdminClient()
    const { data: pending } = await supabase
      .from('clients')
      .select('id, name')
      .eq('telegram_connect_token', startMatch[1])
      .maybeSingle()

    if (!pending) {
      await sendMessage(chatId, '⚠️ That connect link is invalid or has already been used. Generate a fresh one from the dashboard.')
      return
    }

    // One chat drives one brand: release it from any other brand first. A new
    // binding starts a fresh agent memory so no other brand's context leaks in.
    await supabase
      .from('clients')
      .update({ telegram_chat_id: null, updated_at: new Date().toISOString() })
      .eq('telegram_chat_id', chatId)
      .neq('id', pending.id)
    await supabase.from('telegram_messages').delete().eq('chat_id', chatId)

    const { error } = await supabase
      .from('clients')
      .update({ telegram_chat_id: chatId, telegram_connect_token: null, updated_at: new Date().toISOString() })
      .eq('id', pending.id)

    await sendMessage(
      chatId,
      error
        ? '⚠️ Could not connect this chat. Generate a fresh link from the dashboard and try again.'
        : `✅ Connected to **${pending.name}**! You'll get post approvals here, and you can message me to create or manage posts.`
    )
    return
  }

  if (message.text?.trim() === '/start') {
    await sendMessage(chatId, 'Hi! To connect this chat to a brand, open the connect link from your Socialigent dashboard.')
    return
  }

  // Access control: only bound chats get AI responses
  const client = await findClientByChatId(chatId)
  if (!client) {
    await sendMessage(chatId, 'Sorry, this bot is private. Connect this chat from your Socialigent dashboard to use it.')
    return
  }

  // ── 2a. Replies to a post message: tag the post ID so the agent knows the
  // target and can decide what the user wants (publish, edit, regen, etc.) ────
  let replyPostId: string | null = null
  if (message.reply_to_message) {
    const parentText = message.reply_to_message.text ?? message.reply_to_message.caption ?? ''
    const postIdMatch = parentText.match(/\/posts\/([a-f0-9-]{36})/)
    if (postIdMatch) replyPostId = postIdMatch[1]
  }

  // ── 2b. AI agent: handles photos, text, and everything else ────────────────
  const isPhoto = !!message.photo?.length
  const hasText = !!(message.text ?? message.caption)
  if (!isPhoto && !hasText) return

  await sendTyping(chatId)

  let imageUrl: string | undefined
  if (isPhoto && message.photo) {
    // Telegram provides multiple sizes; the last entry is the largest
    const largest = message.photo[message.photo.length - 1]
    imageUrl = (await saveTelegramPhoto(largest.file_id, client.id)) ?? undefined
  }

  const userText = (message.text ?? message.caption ?? '').trim()
  const baseMessage = userText || (isPhoto ? '(photo)' : '')
  const annotated = replyPostId ? `[Replying to post ${replyPostId}] ${baseMessage}` : baseMessage

  try {
    const reply = await runAgent({ chatId, client, userMessage: annotated, imageUrl })
    await sendMessage(chatId, reply)
  } catch (err) {
    console.error('Agent error:', err)
    await sendMessage(chatId, 'Sorry, something went wrong on my end. Please try again.')
  }
}
