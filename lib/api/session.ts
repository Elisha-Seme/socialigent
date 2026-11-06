import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type SessionResult =
  | { ok: true; supabase: ServerClient; user: User }
  | { ok: false; response: NextResponse }

// Every API route starts here. The returned client runs as the signed-in
// user, so RLS limits every read and write to their own brand. Use it to
// prove ownership before touching the service-role client.
export async function requireUser(): Promise<SessionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, supabase, user }
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
