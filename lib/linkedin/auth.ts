import { OAUTH_STATE_TTL_MS, newNonce, signState } from '@/lib/linkedin/state'

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!
const REDIRECT_URI = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() + '/api/linkedin/callback'

// Default Tier "Share on LinkedIn" only. When Community Management API access
// is approved, add 'w_organization_social' here and have users reconnect.
const SCOPES = ['openid', 'profile', 'w_member_social']

// HMAC key for the OAuth state. A dedicated secret is preferred; the LinkedIn
// client secret is a server-only fallback so deploys work without a new env var.
export function oauthStateSecret(): string {
  const secret = (process.env.OAUTH_STATE_SECRET || CLIENT_SECRET || '').trim()
  if (!secret) throw new Error('OAUTH_STATE_SECRET (or LINKEDIN_CLIENT_SECRET) is not configured')
  return secret
}

export function buildOAuthUrl(opts: { clientId: string; userId: string }): { url: string; nonce: string } {
  const nonce = newNonce()
  const state = signState(
    { clientId: opts.clientId, userId: opts.userId, nonce, exp: Date.now() + OAUTH_STATE_TTL_MS },
    oauthStateSecret()
  )
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: SCOPES.join(' '),
  })
  return { url: `https://www.linkedin.com/oauth/v2/authorization?${params}`, nonce }
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LinkedIn token exchange failed: ${text}`)
  }
  return res.json()
}
