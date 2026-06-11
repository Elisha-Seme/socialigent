'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScheduleEditor } from './ScheduleEditor'
import type { Client, PostingSlot } from '@/lib/types'

export function ClientForm({ client }: { client?: Client }) {
  const router = useRouter()
  const [name, setName] = useState(client?.name ?? '')
  const [brandVoice, setBrandVoice] = useState(client?.brand_voice ?? '')
  const [pillars, setPillars] = useState(client?.content_pillars.join(', ') ?? '')
  const [linkedinPageId, setLinkedinPageId] = useState(client?.linkedin_page_id ?? '')
  const [telegramChatId, setTelegramChatId] = useState(client?.telegram_chat_id ?? '')
  const [schedule, setSchedule] = useState<PostingSlot[]>(client?.posting_schedule ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name,
      brand_voice: brandVoice,
      content_pillars: pillars
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      linkedin_page_id: linkedinPageId || null,
      telegram_chat_id: telegramChatId || null,
      posting_schedule: schedule,
    }

    const res = await fetch(client ? `/api/clients/${client.id}` : '/api/clients', {
      method: client ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Something went wrong')
      setSaving(false)
      return
    }

    const saved = await res.json()
    router.push(`/clients/${saved.id ?? client?.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Brand profile</CardTitle>
          <CardDescription>
            This is what the AI uses to write on-brand posts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Client name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand_voice">Brand voice</Label>
            <Textarea
              id="brand_voice"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="Professional but warm. Speaks to small business owners in East Africa. Avoids jargon, uses practical examples…"
              rows={4}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pillars">Content pillars (comma-separated)</Label>
            <Input
              id="pillars"
              value={pillars}
              onChange={(e) => setPillars(e.target.value)}
              placeholder="sustainability, customer stories, industry tips"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>
            Where posts get published and where approvals are sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="linkedin_page_id">LinkedIn Page ID</Label>
            <Input
              id="linkedin_page_id"
              value={linkedinPageId}
              onChange={(e) => setLinkedinPageId(e.target.value)}
              placeholder="12345678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telegram_chat_id">Telegram chat ID (for approvals)</Label>
            <Input
              id="telegram_chat_id"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="-1001234567890"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posting schedule</CardTitle>
          <CardDescription>
            Drafts are generated automatically for each slot (times in UTC).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : client ? 'Save changes' : 'Create client'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
