import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAndQueuePost } from '@/lib/ai/pipeline'
import type { Client } from '@/lib/types'

export const maxDuration = 60

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { name, brand_voice } = body
  if (!name || !brand_voice) {
    return NextResponse.json(
      { error: 'name and brand_voice are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({
      name,
      brand_voice,
      content_pillars: body.content_pillars ?? [],
      linkedin_page_id: body.linkedin_page_id || null,
      telegram_chat_id: body.telegram_chat_id || null,
      posting_schedule: body.posting_schedule ?? [],
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Instant sample post (#5) — best-effort, never blocks client creation.
  if (body.generate_sample) {
    try {
      await generateAndQueuePost({ client: data as Client, suppressTelegram: true })
    } catch (err) {
      console.error('Sample post generation failed:', err)
    }
  }

  return NextResponse.json(data, { status: 201 })
}
