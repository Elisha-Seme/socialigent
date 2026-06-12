import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

// Download a photo from Telegram and upload it to Supabase Storage.
// Returns the public URL, or null if anything fails.
export async function saveTelegramPhoto(
  fileId: string,
  clientId: string
): Promise<string | null> {
  try {
    // Step 1: resolve the file path
    const fileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    )
    if (!fileRes.ok) return null
    const fileJson = await fileRes.json()
    const filePath: string = fileJson.result?.file_path
    if (!filePath) return null

    // Step 2: download the binary
    const dlRes = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
    )
    if (!dlRes.ok) return null
    const buffer = await dlRes.arrayBuffer()

    // Step 3: upload to Supabase Storage
    const ext = filePath.split('.').pop() ?? 'jpg'
    const path = `${clientId}/${randomUUID()}.${ext}`
    const supabase = createAdminClient()
    const { data, error } = await supabase.storage
      .from('post-images')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: false })

    if (error || !data) return null

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(data.path)

    return publicUrl
  } catch {
    return null
  }
}

// Sends a "typing…" indicator so the user knows the bot is working.
export async function sendTyping(chatId: number | string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => {})
}

// Send a plain text message to a chat.
export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {})
}
