import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { draftBrandProfileFromUrl } from '@/lib/ai/brand'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url } = await request.json().catch(() => ({}))
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'A website URL is required' }, { status: 400 })
  }

  try {
    const profile = await draftBrandProfileFromUrl(url)
    return NextResponse.json(profile)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read that website'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
