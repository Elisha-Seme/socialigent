import type { PostingSlot } from '@/lib/types'

const DAY_INDEX: Record<PostingSlot['day'], number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

// Returns the next upcoming occurrence (UTC) across all slots, or null.
export function nextSlotDate(schedule: PostingSlot[], from = new Date()): Date | null {
  if (!schedule.length) return null

  let best: Date | null = null
  for (const slot of schedule) {
    const [hours, minutes] = slot.time.split(':').map(Number)
    const candidate = new Date(from)
    candidate.setUTCHours(hours, minutes, 0, 0)

    const targetDay = DAY_INDEX[slot.day]
    let dayDiff = (targetDay - candidate.getUTCDay() + 7) % 7
    if (dayDiff === 0 && candidate <= from) dayDiff = 7
    candidate.setUTCDate(candidate.getUTCDate() + dayDiff)

    if (!best || candidate < best) best = candidate
  }
  return best
}
