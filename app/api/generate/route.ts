import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePostContent } from '@/lib/ai/claude'
import { generateImage } from '@/lib/ai/dalle'
import { storeImageFromUrl } from '@/lib/storage/images'
import { sendApprovalMessage } from '@/lib/telegram/bot'
import { nextSlotDate } from '@/lib/schedule'
import type { Client, Post } from '@/lib/types'

export const maxDuration = 120

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured in .env.local' },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const { clientId } = await request.json()

  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }

  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (clientError || !clientData) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }
  const client = clientData as Client

  // 1. Generate caption + image prompt with Claude
  const { caption, imagePrompt } = await generatePostContent(client)

  // 2. Generate image with DALL-E and store it permanently (URL expires in 1h).
  //    Image failures don't block the post — it just goes out without one.
  let imageUrl: string | null = null
  let imageError: string | null = null
  if (process.env.OPENAI_API_KEY) {
    try {
      const tempUrl = await generateImage(imagePrompt)
      imageUrl = await storeImageFromUrl(tempUrl, client.id, randomUUID())
    } catch (error) {
      imageError = error instanceof Error ? error.message : 'image generation failed'
    }
  }

  // 3. Insert the post as pending approval
  const { data: postData, error: insertError } = await supabase
    .from('posts')
    .insert({
      client_id: client.id,
      caption,
      image_prompt: imagePrompt,
      image_url: imageUrl,
      platform: 'linkedin',
      status: 'pending_approval',
      scheduled_at: nextSlotDate(client.posting_schedule)?.toISOString() ?? null,
      error_message: imageError,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }
  const post = postData as Post

  await supabase.from('post_history').insert({
    post_id: post.id,
    previous_status: 'draft',
    new_status: 'pending_approval',
    changed_by: 'operator',
    note: 'Generated manually from dashboard',
  })

  // 4. Notify via Telegram (non-fatal if unconfigured)
  const telegramSent = await sendApprovalMessage(client, post)

  return NextResponse.json({ ...post, telegram_sent: telegramSent }, { status: 201 })
}
