import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishPost, type PublishFailureCode } from '@/lib/linkedin/publish'
import { jsonError, readJson, requireUser } from '@/lib/api/session'

export const maxDuration = 60

const STATUS_FOR: Record<PublishFailureCode, number> = {
  not_found: 404,
  not_publishable: 409,
  already_claimed: 409,
  not_connected: 400,
  token_expired: 400,
  invalid_image: 422,
  linkedin_error: 502,
}

export async function POST(request: Request) {
  const session = await requireUser()
  if (!session.ok) return session.response

  const { postId } = await readJson(request)
  if (typeof postId !== 'string' || !postId) return jsonError('Missing postId', 400)

  // Ownership: RLS only lets the user see their own brand's posts.
  const { data: owned } = await session.supabase.from('posts').select('id').eq('id', postId).maybeSingle()
  if (!owned) return jsonError('Post not found', 404)

  // The publish flow needs the LinkedIn token, so it runs with the service role.
  const result = await publishPost(createAdminClient(), {
    postId,
    allowedFrom: ['approved', 'failed'],
    actor: 'dashboard',
    storageBaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  })

  if (!result.ok) return jsonError(result.message, STATUS_FOR[result.code])
  return NextResponse.json({ ok: true, linkedInPostId: result.postUrn, postedAs: result.postedAs })
}
