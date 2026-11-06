import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// Signed OAuth `state` for the LinkedIn connect flow.
//
// The state binds the flow to the brand, the signed-in user, and a nonce that
// is also stored in an httpOnly cookie. The callback rejects anything that was
// forged, expired, started in another browser, or finished by another user.

export interface OAuthState {
  clientId: string
  userId: string
  nonce: string
  exp: number // epoch ms
}

export const OAUTH_NONCE_COOKIE = 'li_oauth_nonce'
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function newNonce(): string {
  return randomBytes(16).toString('base64url')
}

export function signState(payload: OAuthState, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

export function verifyState(state: string, secret: string, now: number = Date.now()): OAuthState | null {
  const [body, signature, extra] = state.split('.')
  if (!body || !signature || extra !== undefined) return null

  const expected = Buffer.from(sign(body, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<OAuthState>
    if (
      typeof payload.clientId !== 'string' ||
      typeof payload.userId !== 'string' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp < now
    ) {
      return null
    }
    return payload as OAuthState
  } catch {
    return null
  }
}
