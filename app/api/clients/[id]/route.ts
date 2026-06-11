import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: { id: string } }

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient()
  const body = await request.json()

  const allowed = [
    'name',
    'brand_voice',
    'content_pillars',
    'linkedin_page_id',
    'telegram_chat_id',
    'posting_schedule',
    'is_active',
  ] as const

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { error } = await supabase.from('clients').delete().eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
