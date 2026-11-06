import { describe, expect, it } from 'vitest'
import {
  buildPostPrompt,
  isDraftingPaused,
  isValidSchedule,
  nextSlotDate,
  parsePostResponse,
  stripAiMarkers,
} from '@/supabase/functions/_shared/content'
import { buildApprovalMessage } from '@/supabase/functions/_shared/telegram'

describe('nextSlotDate', () => {
  const wednesday10am = new Date('2026-11-04T10:00:00Z') // a Wednesday

  it('picks the soonest upcoming slot in UTC', () => {
    const slots = [
      { day: 'tuesday', time: '06:00' },
      { day: 'thursday', time: '06:00' },
    ]
    expect(nextSlotDate(slots, wednesday10am)?.toISOString()).toBe('2026-11-05T06:00:00.000Z')
  })

  it('rolls a same-day slot that already passed to next week', () => {
    expect(nextSlotDate([{ day: 'wednesday', time: '09:00' }], wednesday10am)?.toISOString()).toBe(
      '2026-11-11T09:00:00.000Z'
    )
  })

  it('skips invalid slots instead of throwing', () => {
    const slots = [{ day: 'funday', time: '06:00' }, { day: 'friday', time: '25:00' }, null, { day: 'friday', time: '07:30' }]
    expect(nextSlotDate(slots, wednesday10am)?.toISOString()).toBe('2026-11-06T07:30:00.000Z')
  })

  it('returns null for empty or malformed schedules', () => {
    expect(nextSlotDate([], wednesday10am)).toBeNull()
    expect(nextSlotDate('nope', wednesday10am)).toBeNull()
  })
})

describe('isValidSchedule', () => {
  it('accepts weekday + HH:MM slots and rejects anything else', () => {
    expect(isValidSchedule([{ day: 'monday', time: '06:00' }])).toBe(true)
    expect(isValidSchedule([{ day: 'monday', time: '6:00' }])).toBe(false)
    expect(isValidSchedule([{ day: 'Monday', time: '06:00' }])).toBe(false)
    expect(isValidSchedule({})).toBe(false)
  })
})

describe('isDraftingPaused', () => {
  const now = new Date('2026-11-06T12:00:00Z')
  const pendingPast = { status: 'pending_approval', scheduled_at: '2026-11-01T06:00:00Z' }

  it('pauses when the last three drafts all sat unreviewed past their slot', () => {
    expect(isDraftingPaused([pendingPast, pendingPast, pendingPast, { status: 'published', scheduled_at: null }], now)).toBe(true)
  })

  it('keeps drafting when any recent draft was reviewed or is still upcoming', () => {
    expect(isDraftingPaused([pendingPast, { status: 'approved', scheduled_at: '2026-11-01T06:00:00Z' }, pendingPast], now)).toBe(false)
    expect(isDraftingPaused([{ status: 'pending_approval', scheduled_at: '2026-11-09T06:00:00Z' }, pendingPast, pendingPast], now)).toBe(false)
    expect(isDraftingPaused([pendingPast, pendingPast], now)).toBe(false)
  })
})

describe('parsePostResponse', () => {
  it('reads fenced JSON and cleans AI markers', () => {
    const raw = '```json\n{"caption1":"One — two","caption2":"“Hi”","caption3":"C","imagePrompt":"a field"}\n```'
    expect(parsePostResponse(raw)).toEqual({ captions: ['One - two', '"Hi"', 'C'], imagePrompt: 'a field' })
  })

  it('tolerates prose around the JSON and a single caption field', () => {
    expect(parsePostResponse('Sure! {"caption":"Only one","imagePrompt":""} Hope that helps.')).toEqual({
      captions: ['Only one'],
      imagePrompt: '',
    })
  })

  it('throws a clear error when there is nothing usable', () => {
    expect(() => parsePostResponse('no json here')).toThrow(/did not contain JSON/)
    expect(() => parsePostResponse('{"imagePrompt":"x"}')).toThrow(/no captions/)
  })
})

describe('stripAiMarkers', () => {
  it('replaces dashes, smart quotes and ellipses', () => {
    expect(stripAiMarkers('9–5 — it’s fine…')).toBe("9-5 - it's fine...")
  })
})

describe('buildPostPrompt', () => {
  it('includes rejection feedback and recent topics when given', () => {
    const prompt = buildPostPrompt(
      { name: 'Kijani', brand_voice: 'Plain', content_pillars: [] },
      { rejectionReason: 'too long', recentCaptions: ['Old post about batteries'] }
    )
    expect(prompt).toContain('too long')
    expect(prompt).toContain('Old post about batteries')
    expect(prompt).toContain('general industry topics')
  })
})

describe('buildApprovalMessage', () => {
  const longCaption = 'x'.repeat(5000)

  it('keeps photo captions under Telegram’s 1024-character limit', () => {
    const { method, body } = buildApprovalMessage({
      chatId: '1',
      brandName: 'Kijani Solar',
      post: { id: '11111111-2222-3333-4444-555555555555', caption: longCaption, image_url: 'https://img' },
      appUrl: 'https://socialigent.vercel.app/',
    })
    expect(method).toBe('sendPhoto')
    expect(String(body.caption).length).toBeLessThanOrEqual(1024)
    // The webhook finds the post from this link when the user replies.
    expect(String(body.caption)).toContain('https://socialigent.vercel.app/posts/11111111-2222-3333-4444-555555555555')
  })

  it('sends text-only posts as a message with approve/reject buttons', () => {
    const { method, body } = buildApprovalMessage({
      chatId: '1',
      brandName: 'B',
      post: { id: 'p', caption: 'Hi', image_url: null },
      appUrl: 'https://a',
    })
    expect(method).toBe('sendMessage')
    expect(JSON.stringify(body.reply_markup)).toContain('approve:p')
    expect(String(body.text).length).toBeLessThanOrEqual(4096)
  })
})
