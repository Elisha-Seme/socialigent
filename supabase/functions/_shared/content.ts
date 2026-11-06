// Content rules shared by the Next.js app and the Deno Edge Functions.
//
// This file must stay import-free: Next (webpack) and Deno resolve modules
// differently, so anything it needs is defined here. Both runtimes import it
// directly — there is no second copy to keep in sync.

export const CAPTION_MODEL = 'claude-haiku-4-5-20251001'

// ─── Writing style ───────────────────────────────────────────────────────────
// Two layers keep captions reading like a human wrote them:
//  1. HUMAN_WRITING_RULES — injected into generation prompts (bans AI tells)
//  2. stripAiMarkers()    — deterministic cleanup of markers models still emit

export const HUMAN_WRITING_RULES = `
WRITING STYLE — the post must read like a busy professional typed it themselves, not like AI. Follow ALL of these:
- NEVER use em dashes (—) or en dashes (–). Use a comma, a period, or a plain hyphen instead.
- Banned words/phrases: delve, unlock, unleash, leverage, elevate, empower, harness, foster, robust, seamless, game-changer, game changing, cutting-edge, transformative, revolutionize, navigate the landscape, in today's fast-paced world, in the ever-evolving, look no further, dive in, let's explore, here's the thing, let that sink in, read that again, the best part?, but here's the kicker.
- NEVER use the "It's not just X, it's Y" or "X isn't about Y. It's about Z." sentence pattern.
- No rhetorical-question hooks ("Ever wondered...?", "What if I told you...?"). Open with a concrete statement, observation, or short story instead.
- No engagement bait endings: no "Thoughts?", "Agree?", "Let me know in the comments", "Drop a 👇". End with a plain takeaway or a genuine, specific question.
- No emoji bullet lists (🚀 ✅ 💡 as bullets). At most 1 emoji in the whole post, or none.
- No "Punchy. One. Word. Sentences." and no three-part slogan patterns ("Faster. Smarter. Better.").
- Vary sentence length naturally. Use contractions (it's, don't, we're). Plain everyday words over corporate vocabulary.
- Be specific and concrete: real situations, numbers, examples. Cut empty filler sentences that could apply to any company.
- Hashtags: 2-3 maximum, specific to the topic (not #Success #Motivation #Growth), placed on the last line.`

const MARKER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\s*—\s*/g, ' - '], // em dash → plain hyphen
  [/(?<=\d)\s*–\s*(?=\d)/g, '-'], // en dash in ranges (9–5 → 9-5)
  [/\s*–\s*/g, ' - '], // remaining en dashes
  [/[“”]/g, '"'], // curly double quotes
  [/[‘’]/g, "'"], // curly single quotes / apostrophes
  [/…/g, '...'], // ellipsis character
]

export function stripAiMarkers(text: string): string {
  let out = text
  for (const [pattern, replacement] of MARKER_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

// ─── Posting schedule ────────────────────────────────────────────────────────

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface PostingSlot {
  day: Weekday
  time: string // "HH:MM" in UTC
}

const DAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidSlot(slot: unknown): slot is PostingSlot {
  if (!slot || typeof slot !== 'object') return false
  const { day, time } = slot as Record<string, unknown>
  return typeof day === 'string' && day in DAY_INDEX && typeof time === 'string' && TIME_RE.test(time)
}

export function isValidSchedule(value: unknown): value is PostingSlot[] {
  return Array.isArray(value) && value.length <= 21 && value.every(isValidSlot)
}

// Next upcoming slot (UTC) after `from`, or null. Invalid slots are skipped so
// one bad row can never break the hourly cron for every client.
export function nextSlotDate(schedule: unknown, from: Date = new Date()): Date | null {
  if (!Array.isArray(schedule)) return null

  let best: Date | null = null
  for (const slot of schedule) {
    if (!isValidSlot(slot)) continue
    const [hours, minutes] = slot.time.split(':').map(Number)
    const candidate = new Date(from)
    candidate.setUTCHours(hours, minutes, 0, 0)

    let dayDiff = (DAY_INDEX[slot.day] - candidate.getUTCDay() + 7) % 7
    if (dayDiff === 0 && candidate <= from) dayDiff = 7
    candidate.setUTCDate(candidate.getUTCDate() + dayDiff)

    if (!best || candidate < best) best = candidate
  }
  return best
}

// ─── Auto-drafting backlog guard ─────────────────────────────────────────────
// If the last few auto-drafts all sat unreviewed past their slot, nobody is
// looking. Stop paying for new drafts until the user reviews something.

export const DRAFT_BACKLOG_LIMIT = 3

export interface DraftSummary {
  status: string
  scheduled_at: string | null
}

// `recentNewestFirst` = the client's most recent posts, newest first.
export function isDraftingPaused(recentNewestFirst: DraftSummary[], now: Date = new Date()): boolean {
  const lastFew = recentNewestFirst.slice(0, DRAFT_BACKLOG_LIMIT)
  if (lastFew.length < DRAFT_BACKLOG_LIMIT) return false
  return lastFew.every(
    (p) =>
      p.status === 'pending_approval' &&
      p.scheduled_at !== null &&
      new Date(p.scheduled_at).getTime() < now.getTime()
  )
}

// ─── Caption generation prompt ───────────────────────────────────────────────

export interface BrandProfile {
  name: string
  brand_voice: string
  content_pillars: string[] | null
}

export const POST_SYSTEM_PROMPT =
  'You are a social media content strategist. Respond ONLY with valid JSON: no markdown fences, no commentary. ' +
  'The JSON must have exactly these fields: "caption1", "caption2", "caption3", and "imagePrompt".'

export function buildPostPrompt(
  brand: BrandProfile,
  opts: { topic?: string | null; rejectionReason?: string | null; recentCaptions?: string[] | null } = {}
): string {
  const pillars = brand.content_pillars?.length ? brand.content_pillars.join(', ') : 'general industry topics'
  const { topic, rejectionReason, recentCaptions } = opts

  const feedback = rejectionReason
    ? `\nCRITICAL FEEDBACK: A previous draft of this post was REJECTED for the following reason:\n"${rejectionReason}"\nAddress this feedback and rewrite the captions accordingly.\n`
    : ''

  const dupeGuard =
    recentCaptions && recentCaptions.length > 0
      ? `\nDO NOT write about the same topics or themes as these recent posts:\n${recentCaptions
          .map((c, i) => `[Post ${i + 1}]: ${c.slice(0, 150)}...`)
          .join('\n')}\n`
      : ''

  return `Write three different caption variations for one LinkedIn post for the brand below, along with a shared image prompt.

Brand: ${brand.name}
Brand voice: ${brand.brand_voice}
Content pillars: ${pillars}${topic ? `\nSPECIFIC TOPIC / INSTRUCTIONS: ${topic}` : ''}
${feedback}${dupeGuard}
Requirements:
- caption1, caption2, caption3: three distinct LinkedIn-formatted captions, max 1200 characters each. Use short paragraphs and a strong concrete first line.
- imagePrompt: a detailed prompt for a professional landscape photo or illustration to accompany the post. No text in the image. No brand logos.
${HUMAN_WRITING_RULES}

Respond with JSON only: {"caption1": "...", "caption2": "...", "caption3": "...", "imagePrompt": "..."}`
}

export interface ParsedPost {
  captions: string[] // 1-3 cleaned, non-empty captions; captions[0] is the default
  imagePrompt: string
}

// Tolerant parser: strips fences and any stray prose around the JSON object,
// accepts a single "caption" field as a fallback, and cleans AI markers.
export function parsePostResponse(raw: string): ParsedPost {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The AI response did not contain JSON')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('The AI response was not valid JSON')
  }

  const candidates = [parsed.caption1, parsed.caption2, parsed.caption3, parsed.caption]
  const captions = candidates
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => stripAiMarkers(c.trim()))
    .slice(0, 3)

  if (captions.length === 0) throw new Error('The AI response had no captions')

  return {
    captions,
    imagePrompt: typeof parsed.imagePrompt === 'string' ? parsed.imagePrompt.trim() : '',
  }
}
