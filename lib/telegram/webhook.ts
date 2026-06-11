export interface TelegramCallbackQuery {
  id: string
  from: { id: number; first_name: string; username?: string }
  message?: {
    chat: { id: number }
    message_id: number
  }
  data?: string
}

export interface TelegramUpdate {
  update_id: number
  callback_query?: TelegramCallbackQuery
}

export function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) return false
  const header = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  return header === secret
}

export function parseCallbackData(data: string): { action: 'approve' | 'reject' | 'edit'; postId: string } | null {
  const parts = data.split(':')
  if (parts.length !== 2) return null
  const action = parts[0] as 'approve' | 'reject' | 'edit'
  const postId = parts[1]
  if (!['approve', 'reject', 'edit'].includes(action) || !postId) return null
  return { action, postId }
}
