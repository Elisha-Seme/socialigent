import { buildApprovalMessage, telegramCall } from '@/supabase/functions/_shared/telegram'
import type { Client, Post } from '@/lib/types'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://socialigent.vercel.app').trim().replace(/\/$/, '')
}

// Sends a post to the brand's Telegram chat with Approve/Reject/Edit buttons.
// Non-fatal: returns false if Telegram isn't configured or the send fails.
export async function sendApprovalMessage(
  client: Pick<Client, 'name' | 'telegram_chat_id'>,
  post: Pick<Post, 'id' | 'caption' | 'image_url'>
): Promise<boolean> {
  if (!BOT_TOKEN || !client.telegram_chat_id) return false

  const { method, body } = buildApprovalMessage({
    chatId: client.telegram_chat_id,
    brandName: client.name,
    post,
    appUrl: appUrl(),
  })
  return telegramCall(BOT_TOKEN, method, body)
}

export async function answerCallbackQuery(callbackQueryId: string, text: string) {
  if (!BOT_TOKEN) return
  await telegramCall(BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text })
}
