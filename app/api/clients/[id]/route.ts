import { NextResponse } from 'next/server'
import { jsonError, readJson, requireUser } from '@/lib/api/session'
import { PUBLIC_CLIENT_COLUMNS, parseBrandInput } from '@/lib/clients'

type Params = { params: { id: string } }

// All three handlers run as the signed-in user, so RLS limits them to their
// own brand.

export async function GET(_request: Request, { params }: Params) {
  const session = await requireUser()
  if (!session.ok) return session.response

  const { data } = await session.supabase
    .from('clients')
    .select(PUBLIC_CLIENT_COLUMNS)
    .eq('id', params.id)
    .maybeSingle()

  if (!data) return jsonError('Brand not found', 404)
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireUser()
  if (!session.ok) return session.response

  const parsed = parseBrandInput(await readJson(request), { partial: true })
  if (!parsed.ok) return jsonError(parsed.error, 400)

  const { data, error } = await session.supabase
    .from('clients')
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(PUBLIC_CLIENT_COLUMNS)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('Brand not found', 404)
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireUser()
  if (!session.ok) return session.response

  const { data, error } = await session.supabase.from('clients').delete().eq('id', params.id).select('id')

  if (error) return jsonError(error.message, 500)
  if (!data?.length) return jsonError('Brand not found', 404)
  return NextResponse.json({ success: true })
}
