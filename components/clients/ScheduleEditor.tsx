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
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No posting slots yet. Posts will only be generated for scheduled slots.
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
