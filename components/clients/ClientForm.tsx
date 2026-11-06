'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScheduleEditor } from './ScheduleEditor'
import { describeTimeZone } from '@/lib/time'
import type { ClientProfile, PostingSlot } from '@/lib/types'

// Brand settings for the signed-in user's single brand.
export function ClientForm({ client }: { client: ClientProfile }) {
  const router = useRouter()
  const [name, setName] = useState(client.name)
  const [brandVoice, setBrandVoice] = useState(client.brand_voice)
  const [pillars, setPillars] = useState(client.content_pillars.join(', '))
  const [linkedinPageId, setLinkedinPageId] = useState(client.linkedin_page_id ?? '')
  const [timezone, setTimezone] = useState(client.timezone || 'UTC')
  const [schedule, setSchedule] = useState<PostingSlot[]>(client.posting_schedule ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The zone list differs between server and browser ICU builds, so fill it in
  // after mount to avoid a hydration mismatch.
  const [zones, setZones] = useState<string[]>([timezone])
  useEffect(() => {
    try {
      const all = Intl.supportedValuesOf('timeZone')
      setZones(all.includes(timezone) ? all : [timezone, ...all])
    } catch {
      // very old browser: keep the current value only
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const zoneHint = useMemo(() => {
    try {
      return describeTimeZone(timezone)
    } catch {
      return timezone
    }
  }, [timezone])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        brand_voice: brandVoice,
        content_pillars: pillars
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
        linkedin_page_id: linkedinPageId.trim() || null,
        timezone,
        posting_schedule: schedule,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Something went wrong')
      return
    }
    toast.success('Settings saved')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Brand profile</CardTitle>
          <CardDescription>This is what the AI uses to write on-brand posts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Brand name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand_voice">Brand voice</Label>
            <Textarea
              id="brand_voice"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="Professional but warm. Speaks to small business owners. Avoids jargon, uses practical examples."
              rows={4}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pillars">Content pillars</Label>
            <Input
              id="pillars"
              value={pillars}
              onChange={(e) => setPillars(e.target.value)}
              placeholder="sustainability, customer stories, industry tips"
              aria-describedby="pillars-hint"
            />
            <p id="pillars-hint" className="text-xs text-muted-foreground">
              Comma-separated topics the AI rotates between.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publishing</CardTitle>
          <CardDescription>Where posts go, and the times you think in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="linkedin_page_id">LinkedIn Page ID (optional)</Label>
            <Input
              id="linkedin_page_id"
              inputMode="numeric"
              value={linkedinPageId}
              onChange={(e) => setLinkedinPageId(e.target.value)}
              placeholder="12345678"
              aria-describedby="page-hint"
            />
            <p id="page-hint" className="text-xs text-muted-foreground">
              Posting as a Company Page needs LinkedIn&apos;s Community Management approval. Until then, posts go to
              your personal profile.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Your timezone</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              aria-describedby="timezone-hint"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <p id="timezone-hint" className="text-xs text-muted-foreground">
              The Telegram assistant reads &quot;tomorrow 9am&quot; in this zone: {zoneHint}.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posting schedule</CardTitle>
          <CardDescription>
            Drafts are generated an hour before each slot. Slot times are in UTC; your timezone is {zoneHint}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
          </>
        ) : (
          'Save changes'
        )}
      </Button>
    </form>
  )
}
