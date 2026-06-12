import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePostContent } from '@/lib/ai/claude'
import { generateImage } from '@/lib/ai/dalle'
import { storeImageFromUrl } from '@/lib/storage/images'
import { sendApprovalMessage } from '@/lib/telegram/bot'
import { nextSlotDate } from '@/lib/schedule'
import type { Client, Post } from '@/lib/types'

// Core generate-and-queue pipeline used by both the API route and the Telegram agent.
// If imageUrl is supplied (e.g. a photo the user sent), image generation is skipped.
// If suppressTelegram is true, no approval message is sent (caller handles messaging).
export async function generateAndQueuePost(opts: {
  client: Client
  topic?: string          // specific topic/instructions to guide Claude
  imageUrl?: string       // pre-uploaded image — skips DALL-E when provided
  suppressTelegram?: boolean
  scheduledAt?: string    // ISO datetime override — skips the schedule-slot lookup
}): Promise<Post> {
  const { client, topic, suppressTelegram = false, scheduledAt } = opts
  let { imageUrl } = opts

  const supabase = createAdminClient()

  // Recent captions for duplicate-topic guard
  const { data: recentPosts } = await supabase
    .from('posts')
    .select('caption')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const recentCaptions = (recentPosts ?? []).map((p) => p.caption)

  // Generate caption (+ image prompt for DALL-E if needed)
  const { caption, imagePrompt } = await generatePostContent(
    client,
    null,
    recentCaptions,
    topic
  )

  // Generate + store image from DALL-E (only when no image supplied and key exists)
  let imageError: string | null = null
  if (!imageUrl && process.env.OPENAI_API_KEY) {
    try {
      const tempUrl = await generateImage(imagePrompt)
      imageUrl = await storeImageFromUrl(tempUrl, client.id, randomUUID())
    } catch (err) {
      imageError = err instanceof Error ? err.message : 'image generation failed'
    }
  }

  // Insert post as pending_approval
  const { data: postData, error: insertError } = await supabase
    .from('posts')
    .insert({
      client_id: client.id,
      caption,
      image_prompt: imagePrompt,
      image_url: imageUrl ?? null,
      platform: 'linkedin',
      status: 'pending_approval',
      scheduled_at: scheduledAt ?? nextSlotDate(client.posting_schedule)?.toISOString() ?? null,
      error_message: imageError,
    })
    .select()
    .single()

  if (insertError) throw new Error(insertError.message)
  const post = postData as Post

  await supabase.from('post_history').insert({
    post_id: post.id,
    previous_status: 'draft',
    new_status: 'pending_approval',
    changed_by: 'pipeline',
    note: topic ? `Generated via Telegram agent (topic: "${topic}")` : 'Generated via pipeline',
  })

  if (!suppressTelegram) {
    await sendApprovalMessage(client, post)
  }

  return post
}
