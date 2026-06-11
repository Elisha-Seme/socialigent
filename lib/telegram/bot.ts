import type { Client, Post } from '@/lib/types'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

// Sends a post to the client's Telegram chat with Approve/Reject buttons.
// Non-fatal: returns false if Telegram isn't configured or the send fails.
export async function sendApprovalMessage(client: Client, post: Post): Promise<boolean> {
  if (!BOT_TOKEN || !client.telegram_chat_id) return false

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const caption =
    `📝 New post for ${client.name}\n\n` +
    post.caption.slice(0, 900) +
    `\n\n👉 ${appUrl}/posts/${post.id}`

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve:${post.id}` },
        { text: '❌ Reject', callback_data: `reject:${post.id}` },
        { text: '✏️ Edit', callback_data: `edit:${post.id}` },
      ],
    ],
  }

  try {
    const endpoint = post.image_url ? 'sendPhoto' : 'sendMessage'
    const body = post.image_url
      ? {
          chat_id: client.telegram_chat_id,
          photo: post.image_url,
          caption,
          reply_markup: replyMarkup,
        }
      : {
          chat_id: client.telegram_chat_id,
          text: caption,
          reply_markup: replyMarkup,
        }

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string) {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch(() => {})
}
