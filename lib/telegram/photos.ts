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

// Convert the agent's markdown-ish output to Telegram HTML so **bold** etc.
// render properly instead of showing raw asterisks.
function toTelegramHtml(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return html
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_m, code) => `<pre>${code.trim()}</pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '<i>$1</i>')
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^[-*]\s+/gm, '• ')
}

// Send a message to a chat, rendering markdown as Telegram HTML.
// Falls back to plain text if Telegram rejects the markup.
export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  const endpoint = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: toTelegramHtml(text),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    if (res.ok) return

    // Malformed HTML (unbalanced markers etc.) — resend as plain text
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch {
    // network failure — nothing more we can do
  }
}
