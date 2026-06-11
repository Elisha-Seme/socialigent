import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForToken, parseOAuthState } from '@/lib/linkedin/auth'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?linkedin_error=${error ?? 'missing_params'}`)
  }

  const parsed = parseOAuthState(state)
  if (!parsed) {
    return NextResponse.redirect(`${appUrl}/clients?linkedin_error=invalid_state`)
  }

  try {
    const tokens = await exchangeCodeForToken(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const supabase = createAdminClient()
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        linkedin_access_token: tokens.access_token,
        linkedin_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.clientId)

    if (updateError) throw updateError

    return NextResponse.redirect(`${appUrl}/clients/${parsed.clientId}?linkedin_connected=1`)
  } catch (err) {
    console.error('LinkedIn callback error:', err)
    return NextResponse.redirect(`${appUrl}/clients?linkedin_error=token_exchange_failed`)
  }
}
