import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonError, readJson, requireUser } from '@/lib/api/session'

// Mints a one-time connect token for the user's brand and returns a t.me deep
// link. Opening it and tapping Start lets the webhook bind that chat.
export async function POST(request: Request) {
  const session = await requireUser()
  if (!session.ok) return session.response

  const { clientId } = await readJson(request)
  if (typeof clientId !== 'string' || !clientId) return jsonError('Missing clientId', 400)

  // Ownership: RLS only returns the signed-in user's brand.
  const { data: owned } = await session.supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!owned) return jsonError('Brand not found', 404)

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return jsonError('Telegram bot is not configured', 500)

  let username: string | null = null
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    const me = await meRes.json()
    username = me?.result?.username ?? null
  } catch {
    // fall through
  }
  if (!username) return jsonError('Could not reach Telegram', 502)

  const token = randomBytes(16).toString('hex')

  // The token column is server-only (column grants), so write it as admin.
  const { error } = await createAdminClient()
    .from('clients')
    .update({ telegram_connect_token: token, updated_at: new Date().toISOString() })
    .eq('id', owned.id)

  if (error) return jsonError(error.message, 500)

  return NextResponse.json({ link: `https://t.me/${username}?start=${token}`, botUsername: username })
}
