import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Mints a one-time connect token for a client and returns a t.me deep link.
// The user opens the link, taps Start, and the webhook binds their chat ID.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId } = await request.json().catch(() => ({}))
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ error: 'Telegram bot is not configured' }, { status: 500 })
  }

  // Resolve the bot's username so we can build the deep link
  let username: string | null = null
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    const me = await meRes.json()
    username = me?.result?.username ?? null
  } catch {
    // fall through to error below
  }
  if (!username) {
    return NextResponse.json({ error: 'Could not reach Telegram' }, { status: 502 })
  }

  const token = randomBytes(16).toString('hex')

  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({ telegram_connect_token: token, updated_at: new Date().toISOString() })
    .eq('id', clientId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    link: `https://t.me/${username}?start=${token}`,
    botUsername: username,
  })
}
