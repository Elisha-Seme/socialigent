import { createAdminClient } from '@/lib/supabase/admin'
import { generatePostContent } from '@/lib/ai/claude'
import { generateAndStoreImage } from '@/lib/storage/images'
import { sendApprovalMessage } from '@/lib/telegram/bot'
import { nextSlotDate } from '@/lib/schedule'
import type { Client, Post } from '@/lib/types'

// The one generate-and-queue pipeline, used by the dashboard, the Telegram
// agent, and onboarding. Callers must already have checked that the acting
// user owns `client`; this runs with the service role.
//
// - imageUrl: a pre-uploaded image (e.g. a Telegram photo); skips AI images.
// - regenerate: an existing rejected post to rewrite in place, feeding its
//   rejection reason back into the prompt.
export async function generateAndQueuePost(opts: {
  client: Client
  topic?: string
  imageUrl?: string
  suppressTelegram?: boolean
  scheduledAt?: string
  regenerate?: Post
  actor?: string
}): Promise<Post> {
  const { client, topic, suppressTelegram = false, scheduledAt, regenerate, actor = 'pipeline' } = opts
  const supabase = createAdminClient()

  // Duplicate-topic guard: recent captions, excluding the post being rewritten
  let recentQuery = supabase
    .from('posts')
    .select('caption')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(5)
  if (regenerate) recentQuery = recentQuery.neq('id', regenerate.id)
  const { data: recentPosts } = await recentQuery
  const recentCaptions = (recentPosts ?? []).map((p) => p.caption).filter(Boolean)

  const { caption, imagePrompt, captionVariations } = await generatePostContent(client, {
    topic,
    recentCaptions,
    rejectionReason: regenerate?.rejection_reason ?? null,
  })

  // Image failures never block the post; it just goes out text-only.
  let imageUrl = opts.imageUrl ?? null
  let imageError: string | null = null
  if (!imageUrl) {
    try {
      imageUrl = await generateAndStoreImage(imagePrompt, client.id)
    } catch (err) {
      imageError = err instanceof Error ? err.message : 'image generation failed'
    }
  }

  if (regenerate) {
    const { data, error } = await supabase
      .from('posts')
      .update({
        caption,
        caption_variations: captionVariations,
        image_prompt: imagePrompt || null,
        image_url: imageUrl ?? regenerate.image_url,
        status: 'pending_approval',
        rejection_reason: null,
        error_message: imageError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', regenerate.id)
      .eq('status', regenerate.status)
      .select()
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('The post changed while it was being regenerated. Refresh and try again.')

    await supabase.from('post_history').insert({
      post_id: regenerate.id,
      previous_status: regenerate.status,
      new_status: 'pending_approval',
      changed_by: actor,
      note: regenerate.rejection_reason
        ? `Regenerated using the rejection feedback: "${regenerate.rejection_reason}"`
        : 'Regenerated',
    })

    const post = data as Post
    if (!suppressTelegram) await sendApprovalMessage(client, post)
    return post
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      client_id: client.id,
      caption,
      caption_variations: captionVariations,
      image_prompt: imagePrompt || null,
      image_url: imageUrl,
      platform: 'linkedin',
      status: 'pending_approval',
      scheduled_at: scheduledAt ?? nextSlotDate(client.posting_schedule)?.toISOString() ?? null,
      error_message: imageError,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  const post = data as Post

  await supabase.from('post_history').insert({
    post_id: post.id,
    previous_status: 'draft',
    new_status: 'pending_approval',
    changed_by: actor,
    note: topic ? `Generated (topic: "${topic}")` : 'Generated',
  })

  if (!suppressTelegram) await sendApprovalMessage(client, post)
  return post
}
