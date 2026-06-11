import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildOAuthUrl } from '@/lib/linkedin/auth'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  const url = buildOAuthUrl(clientId)
  return NextResponse.redirect(url)
}
