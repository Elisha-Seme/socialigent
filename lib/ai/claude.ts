import Anthropic from '@anthropic-ai/sdk'
import type { Client } from '@/lib/types'

export interface GeneratedContent {
  caption: string
  imagePrompt: string
}

export async function generatePostContent(client: Client): Promise<GeneratedContent> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const pillars = client.content_pillars.length
    ? client.content_pillars.join(', ')
    : 'general industry topics'

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:
      'You are a social media content strategist. Respond ONLY with valid JSON — no markdown fences, no commentary. The JSON must have exactly two string fields: "caption" and "imagePrompt".',
    messages: [
      {
        role: 'user',
        content: `Write one LinkedIn post for the brand below.

Brand: ${client.name}
Brand voice: ${client.brand_voice}
Content pillars: ${pillars}

Requirements:
- caption: LinkedIn-formatted, max 1200 characters, ends with 3-5 relevant hashtags. Use short paragraphs and a hook in the first line. No emojis overload (max 2-3).
- imagePrompt: a detailed DALL-E prompt for a professional landscape image to accompany the post. No text in the image. No brand logos.

Respond with JSON only: {"caption": "...", "imagePrompt": "..."}`,
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

  if (typeof parsed.caption !== 'string' || typeof parsed.imagePrompt !== 'string') {
    throw new Error('Claude returned malformed content')
  }

  return { caption: parsed.caption, imagePrompt: parsed.imagePrompt }
}
