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

    // Fetch the member's person ID — used as fallback author when the token
    // lacks w_organization_social (page posting requires LinkedIn approval).
    let personId: string | null = null
    try {
      const userinfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json()
        personId = userinfo.sub ?? null
      }
    } catch {
      // non-fatal — page posting may still work
    }

    // Auto-detect an admin'd company Page so the operator doesn't paste a Page ID.
    // Requires org scopes (rw_organization_admin) that are gated behind Community
    // Management API approval — until granted this returns 403 and we skip it,
    // so the code activates automatically once the scope is approved.
    let pageId: string | null = null
    try {
      const aclRes = await fetch(
        'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            'LinkedIn-Version': '202501',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
      if (aclRes.ok) {
        const acl = await aclRes.json()
        const target: string | undefined = acl?.elements?.[0]?.organizationalTarget
        // target looks like "urn:li:organization:12345678"
        const match = target?.match(/urn:li:organization:(\d+)/)
        if (match) pageId = match[1]
      }
    } catch {
      // non-fatal — fall back to personal profile / manual Page ID
    }

    const supabase = createAdminClient()
    const update: Record<string, unknown> = {
      linkedin_access_token: tokens.access_token,
      linkedin_token_expires_at: expiresAt,
      linkedin_person_id: personId,
      updated_at: new Date().toISOString(),
    }
    if (pageId) update.linkedin_page_id = pageId

    const { error: updateError } = await supabase
      .from('clients')
      .update(update)
      .eq('id', parsed.clientId)

    if (updateError) throw updateError

    return NextResponse.redirect(`${appUrl}/overview?linkedin_connected=1`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('LinkedIn callback error:', msg)
    return NextResponse.redirect(`${appUrl}/clients?linkedin_error=${encodeURIComponent(msg)}`)
  }
}
