import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { generateAndQueuePost } from '@/lib/ai/pipeline'
import { jsonError, readJson, requireUser } from '@/lib/api/session'
import { PUBLIC_CLIENT_COLUMNS, parseBrandInput } from '@/lib/clients'
import { DEFAULT_TIMEZONE } from '@/lib/time'
import type { Client } from '@/lib/types'

export const maxDuration = 60

export async function GET() {
  const session = await requireUser()
  if (!session.ok) return session.response

  const { data, error } = await session.supabase
    .from('clients')
    .select(PUBLIC_CLIENT_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) return jsonError(error.message, 500)
  return NextResponse.json(data)
}

// Creates the signed-in user's brand (one per account).
export async function POST(request: Request) {
  const session = await requireUser()
  if (!session.ok) return session.response
  const { supabase, user } = session

  const body = await readJson(request)
  const parsed = parseBrandInput(body, { partial: false })
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const { data, error } = await supabase
    .from('clients')
    .insert({
      user_id: user.id,
      content_pillars: [],
      posting_schedule: [],
      timezone: DEFAULT_TIMEZONE,
      is_active: true,
      ...parsed.values,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Already created (e.g. a retried request): hand back the existing brand
      // so onboarding can continue instead of dead-ending.
      const { data: existing } = await supabase.from('clients').select('id, name').maybeSingle()
      return NextResponse.json(
        { error: 'Your account already has a brand. Edit it in Settings.', id: existing?.id, name: existing?.name },
        { status: 409 }
      )
    }
    return jsonError(error.message, 500)
  }

  const client = data as Client

  // The sample draft takes 10-20s; don't make the browser wait for it.
  if (body.generate_sample === true) {
    waitUntil(
      generateAndQueuePost({ client, suppressTelegram: true, actor: 'onboarding' }).catch((err) =>
        console.error('Sample post generation failed:', err)
      )
    )
  }

  // Don't return token columns to the browser
  return NextResponse.json({ id: client.id, name: client.name }, { status: 201 })
}
