const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!
const REDIRECT_URI = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() + '/api/linkedin/callback'

const SCOPES = ['openid', 'profile', 'w_organization_social', 'rw_organization_admin']

export function buildOAuthUrl(clientId: string): string {
  const state = Buffer.from(JSON.stringify({ clientId })).toString('base64url')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: SCOPES.join(' '),
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`
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

export function parseOAuthState(state: string): { clientId: string } | null {
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString())
  } catch {
    return null
  }
}
