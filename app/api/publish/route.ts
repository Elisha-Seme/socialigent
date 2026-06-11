import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishLinkedInPost } from '@/lib/linkedin/publish'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await request.json()
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  const admin = createAdminClient()

  const { data: post, error: postError } = await admin
    .from('posts')
    .select('*, clients(*)')
    .eq('id', postId)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  if (post.status !== 'approved') {
    return NextResponse.json({ error: `Post is ${post.status}, must be approved` }, { status: 400 })
  }

  const client = post.clients
  if (!client.linkedin_access_token || (!client.linkedin_page_id && !client.linkedin_person_id)) {
    return NextResponse.json({ error: 'Client LinkedIn not connected' }, { status: 400 })
  }

  // Check token expiry
  if (client.linkedin_token_expires_at) {
    const expiresAt = new Date(client.linkedin_token_expires_at)
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: 'LinkedIn token expired, reconnect in client settings' }, { status: 400 })
    }
  }

  // Mark as publishing to prevent double-publish
  await admin
    .from('posts')
    .update({ status: 'failed', error_message: 'Publishing in progress...', updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('status', 'approved')

  try {
    const { postId: linkedInPostId, postedAs } = await publishLinkedInPost({
      pageId: client.linkedin_page_id,
      personId: client.linkedin_person_id,
      token: client.linkedin_access_token,
      caption: post.caption,
      imageUrl: post.image_url,
    })

    const now = new Date().toISOString()
    await admin
      .from('posts')
      .update({
        status: 'published',
        linkedin_post_id: linkedInPostId,
        published_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq('id', postId)

    await admin.from('post_history').insert({
      post_id: postId,
      previous_status: 'approved',
      new_status: 'published',
      changed_by: `user:${user.id}`,
      note: `Published to LinkedIn as ${postedAs === 'organization' ? `page ${client.linkedin_page_id}` : 'personal profile'}`,
    })

    return NextResponse.json({ ok: true, linkedInPostId, postedAs })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    await admin
      .from('posts')
      .update({
        status: 'failed',
        error_message: message,
        retry_count: (post.retry_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)

    await admin.from('post_history').insert({
      post_id: postId,
      previous_status: 'approved',
      new_status: 'failed',
      changed_by: `user:${user.id}`,
      note: message,
    })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
