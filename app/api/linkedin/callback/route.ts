import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForToken, oauthStateSecret } from '@/lib/linkedin/auth'
import { OAUTH_NONCE_COOKIE, verifyState } from '@/lib/linkedin/state'
import { LINKEDIN_VERSION } from '@/supabase/functions/_shared/linkedin'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').trim()

  const finish = (query: string) => {
    const response = NextResponse.redirect(`${appUrl}/overview?${query}`)
    response.cookies.set(OAUTH_NONCE_COOKIE, '', { path: '/api/linkedin', maxAge: 0 })
    return response
  }
  const fail = (reason: string) => finish(`linkedin_error=${encodeURIComponent(reason)}`)

  if (error || !code || !state) return fail(error ?? 'missing_params')

  // 1. The state must be ours, unexpired, and started in this browser…
  const parsed = verifyState(state, oauthStateSecret())
  if (!parsed) return fail('The connect link was invalid or expired. Please try again.')
  if (request.cookies.get(OAUTH_NONCE_COOKIE)?.value !== parsed.nonce) {
    return fail('Please start the LinkedIn connection from the dashboard in this browser.')
  }

  // 2. …and finished by the same signed-in user who started it.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== parsed.userId) {
    return fail('Please sign in to the account you started the connection from.')
  }

  try {
    const tokens = await exchangeCodeForToken(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Member ID: fallback author while page posting needs LinkedIn approval.
    let personId: string | null = null
    try {
      const userinfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userinfoRes.ok) personId = (await userinfoRes.json()).sub ?? null
    } catch {
      // non-fatal: page posting may still work
    }

    // Auto-detect an admin'd company Page. Needs org scopes gated behind
    // Community Management API approval; until then this 403s and is skipped.
    let pageId: string | null = null
    try {
      const aclRes = await fetch(
        'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            'LinkedIn-Version': LINKEDIN_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
      if (aclRes.ok) {
        const first = (await aclRes.json())?.elements?.[0]
        const target: string | undefined = first?.organization ?? first?.organizationalTarget
        const match = target?.match(/urn:li:organization:(\d+)/)
        if (match) pageId = match[1]
      }
    } catch {
      // non-fatal: fall back to personal profile / manual Page ID
    }

    const update: Record<string, unknown> = {
      linkedin_access_token: tokens.access_token,
      linkedin_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }
    // Don't wipe a known profile ID if /v2/userinfo had a hiccup.
    if (personId) update.linkedin_person_id = personId
    if (pageId) update.linkedin_page_id = pageId

    // Token columns are server-only, so write as admin, still pinned to the
    // brand this user owns.
    const { data: updated, error: updateError } = await createAdminClient()
      .from('clients')
      .update(update)
      .eq('id', parsed.clientId)
      .eq('user_id', user.id)
      .select('id')

    if (updateError) throw updateError
    if (!updated?.length) return fail('Brand not found for this account.')

    return finish('linkedin_connected=1')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('LinkedIn callback error:', msg)
    return fail(msg)
  }
}
