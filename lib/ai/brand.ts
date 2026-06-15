import Anthropic from '@anthropic-ai/sdk'

export interface DraftedBrandProfile {
  name: string
  brand_voice: string
  content_pillars: string[]
}

// Pull readable text out of a page's HTML — crude but dependency-free.
function extractReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

// Fetch a brand's website and have Claude draft a starter profile from it.
// Throws on fetch failure so the caller can surface a clear message.
export async function draftBrandProfileFromUrl(url: string): Promise<DraftedBrandProfile> {
  const target = normalizeUrl(url)

  const res = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SocialigentBot/1.0)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Couldn't load that site (HTTP ${res.status}).`)

  const html = await res.text()
  const text = extractReadableText(html).slice(0, 6000)
  if (text.length < 40) {
    throw new Error("That page didn't have enough readable text to work from.")
  }

  // Grab the <title> as a hint for the brand name
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const titleHint = titleMatch ? titleMatch[1].trim() : ''

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system:
      'You analyse a company website and produce a starter social-media brand profile. ' +
      'Respond ONLY with valid JSON — no markdown fences, no commentary. ' +
      'Fields: "name" (string), "brand_voice" (2-3 sentences describing tone and audience), ' +
      '"content_pillars" (array of 3-5 short theme strings).',
    messages: [
      {
        role: 'user',
        content: `Page title: ${titleHint}\n\nWebsite text:\n${text}\n\nProduce the brand profile JSON. The brand_voice should describe how this brand should sound on LinkedIn (tone, personality, who they speak to). Content pillars are recurring topics they could post about. Respond with JSON only: {"name":"...","brand_voice":"...","content_pillars":["...","..."]}`,
      },
    ],
  })

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned)

  return {
    name: typeof parsed.name === 'string' ? parsed.name : titleHint,
    brand_voice: typeof parsed.brand_voice === 'string' ? parsed.brand_voice : '',
    content_pillars: Array.isArray(parsed.content_pillars)
      ? parsed.content_pillars.filter((p: unknown): p is string => typeof p === 'string')
      : [],
  }
}
