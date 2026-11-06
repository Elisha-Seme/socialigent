import { describe, expect, it } from 'vitest'
import { signState, verifyState } from '@/lib/linkedin/state'
import { toConversation } from '@/lib/telegram/history'
import { describeTimeZone, isValidTimeZone, localTimeToUtc, utcOffsetMinutes } from '@/lib/time'
import { parseBrandInput } from '@/lib/clients'

describe('OAuth state', () => {
  const secret = 'test-secret'
  const payload = { clientId: 'c1', userId: 'u1', nonce: 'n1', exp: Date.now() + 60_000 }

  it('round-trips a signed state', () => {
    expect(verifyState(signState(payload, secret), secret)).toEqual(payload)
  })

  it('rejects a state whose payload was swapped for another brand', () => {
    const [, sig] = signState(payload, secret).split('.')
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, clientId: 'victim' })).toString('base64url')
    expect(verifyState(`${forgedBody}.${sig}`, secret)).toBeNull()
  })

  it('rejects the old unsigned format, a wrong secret, and expired states', () => {
    const legacy = Buffer.from(JSON.stringify({ clientId: 'c1' })).toString('base64url')
    expect(verifyState(legacy, secret)).toBeNull()
    expect(verifyState(signState(payload, secret), 'other')).toBeNull()
    expect(verifyState(signState({ ...payload, exp: Date.now() - 1 }, secret), secret)).toBeNull()
  })
})

describe('toConversation', () => {
  it('returns the newest turns oldest-first, starting with a user turn', () => {
    const newestFirst = [
      { role: 'assistant' as const, content: 'a3' },
      { role: 'user' as const, content: 'u3' },
      { role: 'assistant' as const, content: 'a2' },
      { role: 'user' as const, content: '[SUMMARY] earlier' },
      { role: 'assistant' as const, content: 'a1' },
    ]
    expect(toConversation(newestFirst).map((m) => m.content)).toEqual(['u3', 'a3'])
  })

  it('returns nothing when there is no user turn', () => {
    expect(toConversation([{ role: 'assistant', content: 'hi' }])).toEqual([])
  })
})

describe('timezones', () => {
  it('computes DST-aware offsets', () => {
    expect(utcOffsetMinutes('Africa/Nairobi')).toBe(180)
    expect(utcOffsetMinutes('UTC')).toBe(0)
    expect(utcOffsetMinutes('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe(-240)
    expect(utcOffsetMinutes('America/New_York', new Date('2026-12-01T12:00:00Z'))).toBe(-300)
    expect(utcOffsetMinutes('Asia/Kolkata')).toBe(330)
  })

  it('converts local wall-clock times to UTC for prompt examples', () => {
    expect(localTimeToUtc('09:00', 'Africa/Nairobi')).toBe('06:00')
    expect(localTimeToUtc('01:00', 'Africa/Nairobi')).toBe('22:00')
    expect(localTimeToUtc('09:00', 'Asia/Kolkata')).toBe('03:30')
  })

  it('validates and describes zones', () => {
    expect(isValidTimeZone('Africa/Nairobi')).toBe(true)
    expect(isValidTimeZone('Mars/Base')).toBe(false)
    expect(describeTimeZone('Africa/Nairobi')).toBe('Africa/Nairobi (UTC+03:00)')
  })
})

describe('parseBrandInput', () => {
  it('ignores connection fields users must not set directly', () => {
    const result = parseBrandInput(
      { name: 'B', brand_voice: 'V', telegram_chat_id: '123', linkedin_access_token: 'x', user_id: 'other' },
      { partial: false }
    )
    expect(result).toEqual({ ok: true, values: { name: 'B', brand_voice: 'V' } })
  })

  it('validates page IDs, schedules and timezones', () => {
    expect(parseBrandInput({ linkedin_page_id: 'abc' }, { partial: true }).ok).toBe(false)
    expect(parseBrandInput({ posting_schedule: [{ day: 'x', time: '1' }] }, { partial: true }).ok).toBe(false)
    expect(parseBrandInput({ timezone: 'Nowhere/City' }, { partial: true }).ok).toBe(false)
    expect(parseBrandInput({ linkedin_page_id: '' }, { partial: true })).toEqual({
      ok: true,
      values: { linkedin_page_id: null },
    })
  })

  it('requires name and voice when creating', () => {
    expect(parseBrandInput({ name: 'B' }, { partial: false })).toEqual({ ok: false, error: 'Brand voice is required' })
  })
})
