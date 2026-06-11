import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerCallbackQuery } from '@/lib/telegram/bot'
import { verifyWebhookSecret, parseCallbackData, type TelegramUpdate } from '@/lib/telegram/webhook'

export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const callbackQuery = update.callback_query
  if (!callbackQuery?.data) {
    // Not a callback we care about — acknowledge silently
    return NextResponse.json({ ok: true })
  }

  const parsed = parseCallbackData(callbackQuery.data)
  if (!parsed) {
    await answerCallbackQuery(callbackQuery.id, 'Unknown action')
    return NextResponse.json({ ok: true })
  }

  const { action, postId } = parsed
  const supabase = createAdminClient()

  // Fetch post to validate it exists and is in pending_approval
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('id, status, caption, client_id')
    .eq('id', postId)
    .single()

  if (fetchError || !post) {
    await answerCallbackQuery(callbackQuery.id, 'Post not found')
    return NextResponse.json({ ok: true })
  }

  if (action === 'edit') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    await answerCallbackQuery(callbackQuery.id, `Edit at: ${appUrl}/posts/${postId}`)
    return NextResponse.json({ ok: true })
  }

  if (post.status !== 'pending_approval') {
    await answerCallbackQuery(callbackQuery.id, `Post already ${post.status}`)
    return NextResponse.json({ ok: true })
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  const changedBy = callbackQuery.from.username
    ? `@${callbackQuery.from.username}`
    : callbackQuery.from.first_name

  // Update post status
  const { error: updateError } = await supabase
    .from('posts')
    .update({
      status: newStatus,
      ...(action === 'reject' ? { rejection_reason: `Rejected via Telegram by ${changedBy}` } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)

  if (updateError) {
    await answerCallbackQuery(callbackQuery.id, 'Failed to update post')
    return NextResponse.json({ ok: true })
  }

  // Record history
  await supabase.from('post_history').insert({
    post_id: postId,
    previous_status: post.status,
    new_status: newStatus,
    changed_by: `telegram:${changedBy}`,
    note: `${action === 'approve' ? 'Approved' : 'Rejected'} via Telegram`,
  })

  const confirmText = action === 'approve' ? '✅ Post approved!' : '❌ Post rejected.'
  await answerCallbackQuery(callbackQuery.id, confirmText)

  return NextResponse.json({ ok: true })
}
