// Timezone helpers. Brands store an IANA zone (clients.timezone); schedules
// and database timestamps stay in UTC.

export const DEFAULT_TIMEZONE = 'UTC'

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function safeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE
}

// Minutes east of UTC for `tz` at `at` (DST-aware). Nairobi → 180.
export function utcOffsetMinutes(tz: string, at: Date = new Date()): number {
  const label =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = label.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0)
  return match[1] === '-' ? -minutes : minutes
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

// "Africa/Nairobi (UTC+03:00)"
export function describeTimeZone(tz: string, at: Date = new Date()): string {
  return `${tz} (${formatOffset(utcOffsetMinutes(tz, at))})`
}

// "Tue 10 Nov, 09:00 (UTC+03:00)"
export function formatInTimeZone(iso: string, tz: string): string {
  const date = new Date(iso)
  const text = date.toLocaleString('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${text} (${formatOffset(utcOffsetMinutes(tz, date))})`
}

// "HH:MM" local wall-clock time → "HH:MM" UTC, for prompt examples.
export function localTimeToUtc(hhmm: string, tz: string, at: Date = new Date()): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (((h * 60 + m - utcOffsetMinutes(tz, at)) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
