import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { postId, caption, scheduledAt } = await request.json()

  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  const { data: post } = await supabase
    .from('posts')
    .select('status')
    .eq('id', postId)
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }
  if (post.status !== 'pending_approval' && post.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot approve a post with status "${post.status}"` },
      { status: 409 }
    )
  }

  const updates: Record<string, unknown> = {
    status: 'approved',
    updated_at: new Date().toISOString(),
  }
  if (typeof caption === 'string' && caption.trim()) {
    updates.caption = caption.trim()
  }
  if (typeof scheduledAt === 'string' && scheduledAt.trim()) {
    updates.scheduled_at = new Date(scheduledAt).toISOString()
  }

  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', postId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('post_history').insert({
    post_id: postId,
    previous_status: post.status,
    new_status: 'approved',
    changed_by: 'operator',
  })

  return NextResponse.json(data)
}
