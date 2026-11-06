// Telegram message helpers shared by the Next.js app and the Deno Edge
// Functions. Import-free on purpose (see content.ts).

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function telegramCall(
  botToken: string,
  method: string,
  body: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

// Photo captions are capped at 1024 characters; text messages at 4096.
const PHOTO_CAPTION_BUDGET = 760
const TEXT_BUDGET = 3500

function trimTo(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

// The approval message every generator sends. The webhook relies on the
// "/posts/<uuid>" link to recognise replies to this message, so keep it.
export function buildApprovalMessage(opts: {
  chatId: string
  brandName: string
  post: { id: string; caption: string; image_url: string | null }
  appUrl: string
}): { method: 'sendPhoto' | 'sendMessage'; body: Record<string, unknown> } {
  const { chatId, brandName, post } = opts
  const appUrl = opts.appUrl.trim().replace(/\/$/, '')
  const header = `📝 New post for ${brandName}: 🟡 awaiting your approval`
  const link = `👉 ${appUrl}/posts/${post.id}`

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve:${post.id}` },
        { text: '❌ Reject', callback_data: `reject:${post.id}` },
        { text: '✏️ Edit', callback_data: `edit:${post.id}` },
      ],
    ],
  }

  if (post.image_url) {
    return {
      method: 'sendPhoto',
      body: {
        chat_id: chatId,
        photo: post.image_url,
        caption: `${header}\n\n${trimTo(post.caption, PHOTO_CAPTION_BUDGET)}\n\n${link}`,
        reply_markup: replyMarkup,
      },
    }
  }

  return {
    method: 'sendMessage',
    body: {
      chat_id: chatId,
      text: `${header}\n\n${trimTo(post.caption, TEXT_BUDGET)}\n\n${link}`,
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    },
  }
}
