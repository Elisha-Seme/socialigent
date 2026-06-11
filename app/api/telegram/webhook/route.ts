import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerCallbackQuery } from '@/lib/telegram/bot'
import { verifyWebhookSecret, parseCallbackData, type TelegramUpdate } from '@/lib/telegram/webhook'
import type { Post } from '@/lib/types'

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

  // Handle message reply-to-edit
  const message = update.message
  if (message?.reply_to_message) {
    const parentText = message.reply_to_message.text || message.reply_to_message.caption || ''
    const match = parentText.match(/\/posts\/([a-f0-9-]{36})/)
    if (match) {
      const postId = match[1]
      const supabase = createAdminClient()

      // Fetch the post
      const { data: post, error: fetchError } = await supabase
        .from('posts')
        .select('id, status, caption, client_id')
        .eq('id', postId)
        .single()

      if (!fetchError && post && post.status === 'pending_approval') {
        const newCaption = message.text?.trim()
        if (newCaption) {
          // Update post caption
          const { error: updateError } = await supabase
            .from('posts')
            .update({
              caption: newCaption,
              updated_at: new Date().toISOString(),
            })
            .eq('id', postId)

          if (!updateError) {
            const changedBy = message.from?.username
              ? `@${message.from.username}`
              : message.from?.first_name || 'Operator'

            await supabase.from('post_history').insert({
              post_id: postId,
              previous_status: post.status,
              new_status: post.status,
              changed_by: `telegram:${changedBy}`,
              note: `Caption edited via Telegram reply:\n"${newCaption.slice(0, 100)}..."`,
            })

            const botToken = process.env.TELEGRAM_BOT_TOKEN
            if (botToken) {
              const { data: postWithClient } = await supabase
                .from('posts')
                .select('*, clients(name)')
                .eq('id', postId)
                .single()
              
              const clientName = (postWithClient as Post & { clients: { name: string } | null })?.clients?.name || 'client'
              const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
              const updatedText =
                `📝 New post for ${clientName}\n\n` +
                newCaption.slice(0, 900) +
                `\n\n👉 ${appUrl}/posts/${post.id}`

              const isPhoto = !!message.reply_to_message.caption
              const method = isPhoto ? 'editMessageCaption' : 'editMessageText'

              const replyMarkup = {
                inline_keyboard: [
                  [
                    { text: '✅ Approve', callback_data: `approve:${post.id}` },
                    { text: '❌ Reject', callback_data: `reject:${post.id}` },
                    { text: '✏️ Edit', callback_data: `edit:${post.id}` },
                  ],
                ],
              }

              const body = isPhoto
                ? {
                    chat_id: message.chat.id,
                    message_id: message.reply_to_message.message_id,
                    caption: updatedText,
                    reply_markup: replyMarkup,
                  }
                : {
                    chat_id: message.chat.id,
                    message_id: message.reply_to_message.message_id,
                    text: updatedText,
                    reply_markup: replyMarkup,
                  }

              await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              }).catch(() => {})

              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: message.chat.id,
                  text: `✅ Caption updated successfully!`,
                  reply_to_message_id: message.message_id,
                }),
              }).catch(() => {})
            }
          }
        }
      }
      return NextResponse.json({ ok: true })
    }
  }

  const callbackQuery = update.callback_query
  if (!callbackQuery?.data) {
    // Not a callback we care about — acknowledge silently
    return NextResponse.json({ ok: true })
  }

  const parsed = parseCallbackData(callbackQuery.data)
  if (!parsed) {
    await answerCallbackQuery(callbackQuery.id, 'Unknown action')
    return NextResponse.json({ ok: true })
  }

  const { action, postId } = parsed
  const supabase = createAdminClient()

  // Fetch post to validate it exists and is in pending_approval
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('id, status, caption, client_id')
    .eq('id', postId)
    .single()

  if (fetchError || !post) {
    await answerCallbackQuery(callbackQuery.id, 'Post not found')
    return NextResponse.json({ ok: true })
  }

  if (action === 'edit') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
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

  // Update post status
  const { error: updateError } = await supabase
    .from('posts')
    .update({
      status: newStatus,
      ...(action === 'reject' ? { rejection_reason: `Rejected via Telegram by ${changedBy}` } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)

  if (updateError) {
    await answerCallbackQuery(callbackQuery.id, 'Failed to update post')
    return NextResponse.json({ ok: true })
  }

  // Record history
  await supabase.from('post_history').insert({
    post_id: postId,
    previous_status: post.status,
    new_status: newStatus,
    changed_by: `telegram:${changedBy}`,
    note: `${action === 'approve' ? 'Approved' : 'Rejected'} via Telegram`,
  })

  const confirmText = action === 'approve' ? '✅ Post approved!' : '❌ Post rejected.'
  await answerCallbackQuery(callbackQuery.id, confirmText)

  return NextResponse.json({ ok: true })
}
