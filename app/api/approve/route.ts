import { NextResponse } from 'next/server'
import { jsonError, readJson, requireUser } from '@/lib/api/session'

export async function POST(request: Request) {
  const session = await requireUser()
  if (!session.ok) return session.response
  const { supabase } = session

  const { postId, caption, scheduledAt } = await readJson(request)
  if (typeof postId !== 'string' || !postId) return jsonError('postId is required', 400)

  if (scheduledAt !== undefined && (typeof scheduledAt !== 'string' || Number.isNaN(Date.parse(scheduledAt)))) {
    return jsonError('scheduledAt must be a valid date', 400)
  }

  // RLS: only finds posts of the signed-in user's brand
  const { data: post } = await supabase.from('posts').select('status').eq('id', postId).maybeSingle()
  if (!post) return jsonError('Post not found', 404)
  if (post.status !== 'pending_approval' && post.status !== 'draft') {
    return jsonError(`Cannot approve a post that is ${post.status.replace('_', ' ')}`, 409)
  }

  const updates: Record<string, unknown> = { status: 'approved', updated_at: new Date().toISOString() }
  if (typeof caption === 'string' && caption.trim()) updates.caption = caption.trim()
  if (typeof scheduledAt === 'string') updates.scheduled_at = new Date(scheduledAt).toISOString()

  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId)
    .eq('status', post.status)
    .select()
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('This post changed in the meantime. Refresh and try again.', 409)

  await supabase.from('post_history').insert({
    post_id: postId,
    previous_status: post.status,
    new_status: 'approved',
    changed_by: 'dashboard',
  })

  return NextResponse.json(data)
}
