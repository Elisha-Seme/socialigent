'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PostingSlot } from '@/lib/types'

const DAYS: PostingSlot['day'][] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

// Best-practice cadences. Times are UTC; 06:00 UTC = 9:00am EAT (peak engagement).
const PRESETS: Record<string, { label: string; hint: string; slots: PostingSlot[] }> = {
  light: {
    label: 'Light',
    hint: '1×/week',
    slots: [{ day: 'tuesday', time: '06:00' }],
  },
  standard: {
    label: 'Standard',
    hint: '3×/week',
    slots: [
      { day: 'tuesday', time: '06:00' },
      { day: 'wednesday', time: '06:00' },
      { day: 'thursday', time: '06:00' },
    ],
  },
  aggressive: {
    label: 'Aggressive',
    hint: '5×/week',
    slots: [
      { day: 'monday', time: '06:00' },
      { day: 'tuesday', time: '06:00' },
      { day: 'wednesday', time: '06:00' },
      { day: 'thursday', time: '06:00' },
      { day: 'friday', time: '06:00' },
    ],
  },
}

export function ScheduleEditor({
  value,
  onChange,
}: {
  value: PostingSlot[]
  onChange: (slots: PostingSlot[]) => void
}) {
  const addSlot = () => {
    onChange([...value, { day: 'monday', time: '09:00' }])
  }

  const removeSlot = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const updateSlot = (index: number, patch: Partial<PostingSlot>) => {
    onChange(value.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Quick presets (9am EAT, peak engagement)</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(preset.slots)}
            >
              {preset.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{preset.hint}</span>
            </Button>
          ))}
        </div>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No posting slots yet. Pick a preset above or add slots manually.
        </p>
      )}
      {value.map((slot, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            value={slot.day}
            onValueChange={(day) => updateSlot(i, { day: day as PostingSlot['day'] })}
          >
            <SelectTrigger className="w-40 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((d) => (
                <SelectItem key={d} value={d} className="capitalize">
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="time"
            value={slot.time}
            onChange={(e) => updateSlot(i, { time: e.target.value })}
            className="w-32"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeSlot(i)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addSlot}>
        <Plus className="mr-2 h-4 w-4" />
        Add slot
      </Button>
    </div>
  )
}
