import Anthropic from '@anthropic-ai/sdk'
import {
  CAPTION_MODEL,
  POST_SYSTEM_PROMPT,
  buildPostPrompt,
  parsePostResponse,
} from '@/supabase/functions/_shared/content'
import type { Client } from '@/lib/types'

export interface GeneratedContent {
  caption: string
  imagePrompt: string
  captionVariations: string[]
}

export async function generatePostContent(
  client: Pick<Client, 'name' | 'brand_voice' | 'content_pillars'>,
  opts: { rejectionReason?: string | null; recentCaptions?: string[] | null; topic?: string | null } = {}
): Promise<GeneratedContent> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 1536,
    system: POST_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPostPrompt(client, opts) }],
  })

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  const { captions, imagePrompt } = parsePostResponse(text)
  return { caption: captions[0], imagePrompt, captionVariations: captions }
}
