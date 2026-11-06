import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/session'
import { buildOAuthUrl } from '@/lib/linkedin/auth'
import { OAUTH_NONCE_COOKIE, OAUTH_STATE_TTL_MS } from '@/lib/linkedin/state'

// Starts the LinkedIn connect flow for the signed-in user's brand.
export async function GET(request: NextRequest) {
  const session = await requireUser()
  if (!session.ok) return session.response

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  // Ownership: RLS only returns the user's own brand.
  const { data: owned } = await session.supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!owned) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const { url, nonce } = buildOAuthUrl({ clientId: owned.id, userId: session.user.id })

  // The callback must see this same nonce, which ties the flow to this browser.
  const response = NextResponse.redirect(url)
  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/linkedin',
    maxAge: OAUTH_STATE_TTL_MS / 1000,
  })
  return response
}
