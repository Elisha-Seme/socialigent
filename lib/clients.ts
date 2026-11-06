import { isValidSchedule } from '@/lib/schedule'
import { isValidTimeZone } from '@/lib/time'

// Fields a user may set on their own brand. Connection fields (LinkedIn
// tokens, Telegram chat) are set only by the OAuth and connect flows; the
// database enforces the same list with column-level grants.
export interface BrandInput {
  name?: string
  brand_voice?: string
  content_pillars?: string[]
  linkedin_page_id?: string | null
  posting_schedule?: unknown
  timezone?: string
  is_active?: boolean
}

export function parseBrandInput(
  body: Record<string, unknown>,
  { partial }: { partial: boolean }
): { ok: true; values: BrandInput } | { ok: false; error: string } {
  const values: BrandInput = {}
  const has = (key: string) => key in body && body[key] !== undefined

  if (has('name') || !partial) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { ok: false, error: 'Brand name is required' }
    values.name = body.name.trim().slice(0, 120)
  }
  if (has('brand_voice') || !partial) {
    if (typeof body.brand_voice !== 'string' || !body.brand_voice.trim()) {
      return { ok: false, error: 'Brand voice is required' }
    }
    values.brand_voice = body.brand_voice.trim().slice(0, 2000)
  }
  if (has('content_pillars')) {
    if (!Array.isArray(body.content_pillars) || !body.content_pillars.every((p) => typeof p === 'string')) {
      return { ok: false, error: 'Content pillars must be a list of strings' }
    }
    values.content_pillars = (body.content_pillars as string[]).map((p) => p.trim()).filter(Boolean).slice(0, 12)
  }
  if (has('linkedin_page_id')) {
    const raw = body.linkedin_page_id
    if (raw === null || raw === '') values.linkedin_page_id = null
    else if (typeof raw === 'string' && /^\d{1,20}$/.test(raw.trim())) values.linkedin_page_id = raw.trim()
    else return { ok: false, error: 'LinkedIn Page ID must be the numeric ID from your page URL' }
  }
  if (has('posting_schedule')) {
    if (!isValidSchedule(body.posting_schedule)) {
      return { ok: false, error: 'Each posting slot needs a weekday and an HH:MM time' }
    }
    values.posting_schedule = body.posting_schedule
  }
  if (has('timezone')) {
    if (!isValidTimeZone(body.timezone)) return { ok: false, error: 'Unknown timezone' }
    values.timezone = body.timezone
  }
  if (has('is_active')) {
    if (typeof body.is_active !== 'boolean') return { ok: false, error: 'is_active must be true or false' }
    values.is_active = body.is_active
  }

  return { ok: true, values }
}

// Columns safe to return to the browser (no tokens).
export const PUBLIC_CLIENT_COLUMNS =
  'id, user_id, name, brand_voice, content_pillars, linkedin_page_id, linkedin_person_id, linkedin_token_expires_at, telegram_chat_id, posting_schedule, timezone, is_active, created_at, updated_at'
