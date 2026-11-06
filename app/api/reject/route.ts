import { NextResponse } from 'next/server'
import { jsonError, readJson, requireUser } from '@/lib/api/session'

export async function POST(request: Request) {
  const session = await requireUser()
  if (!session.ok) return session.response
  const { supabase } = session

  const { postId, reason } = await readJson(request)
  if (typeof postId !== 'string' || !postId) return jsonError('postId is required', 400)
  const note = typeof reason === 'string' && reason.trim() ? reason.trim() : null

  // RLS: only finds posts of the signed-in user's brand
  const { data: post } = await supabase.from('posts').select('status').eq('id', postId).maybeSingle()
  if (!post) return jsonError('Post not found', 404)
  if (post.status !== 'pending_approval' && post.status !== 'draft') {
    return jsonError(`Cannot reject a post that is ${post.status.replace('_', ' ')}`, 409)
  }

  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'rejected', rejection_reason: note, updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('status', post.status)
    .select()
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('This post changed in the meantime. Refresh and try again.', 409)

  await supabase.from('post_history').insert({
    post_id: postId,
    previous_status: post.status,
    new_status: 'rejected',
    changed_by: 'dashboard',
    note,
  })

  return NextResponse.json(data)
}
