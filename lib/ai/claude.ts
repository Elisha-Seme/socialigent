import Anthropic from '@anthropic-ai/sdk'
import type { Client } from '@/lib/types'

export interface GeneratedContent {
  caption: string
  imagePrompt: string
  captionVariations: string[]
}

export async function generatePostContent(
  client: Client,
  rejectionReason?: string | null,
  recentCaptions?: string[] | null
): Promise<GeneratedContent> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const pillars = client.content_pillars.length
    ? client.content_pillars.join(', ')
    : 'general industry topics'

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1536,
    system:
      'You are a social media content strategist. Respond ONLY with valid JSON — no markdown fences, no commentary. The JSON must have exactly these fields: "caption1", "caption2", "caption3", and "imagePrompt".',
    messages: [
      {
        role: 'user',
        content: `Write three different caption variations for one LinkedIn post for the brand below, along with a shared image prompt.

Brand: ${client.name}
Brand voice: ${client.brand_voice}
Content pillars: ${pillars}
${
  rejectionReason
    ? `\nCRITICAL FEEDBACK: A previous draft of this post was REJECTED for the following reason:\n"${rejectionReason}"\nMake sure to address this feedback and rewrite the captions accordingly.\n`
    : ''
}
${
  recentCaptions && recentCaptions.length > 0
    ? `\nDO NOT write about the same topics or themes as these recent posts:\n${recentCaptions
        .map((c, i) => `[Post ${i + 1}]: ${c.slice(0, 150)}...`)
        .join('\n')}\n`
    : ''
}
Requirements:
- caption1, caption2, caption3: three distinct LinkedIn-formatted captions, max 1200 characters, ends with 3-5 relevant hashtags. Use short paragraphs and a hook in the first line. No emojis overload (max 2-3).
- imagePrompt: a detailed DALL-E prompt for a professional landscape image to accompany the post. No text in the image. No brand logos.

Respond with JSON only: {"caption1": "...", "caption2": "...", "caption3": "...", "imagePrompt": "..."}`,
      },
    ],
  })

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  // Strip accidental markdown fences before parsing
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned)

  if (
    typeof parsed.caption1 !== 'string' ||
    typeof parsed.caption2 !== 'string' ||
    typeof parsed.caption3 !== 'string' ||
    typeof parsed.imagePrompt !== 'string'
  ) {
    throw new Error('Claude returned malformed content')
  }

  return {
    caption: parsed.caption1,
    imagePrompt: parsed.imagePrompt,
    captionVariations: [parsed.caption1, parsed.caption2, parsed.caption3],
  }
}
