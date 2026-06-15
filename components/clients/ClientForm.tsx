'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
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

  // Website importer (#1)
  const [website, setWebsite] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftDone, setDraftDone] = useState(false)

  // Instant sample post (#5) — only offered when creating a new client
  const [generateSample, setGenerateSample] = useState(!client)

  const handleDraft = async () => {
    if (!website.trim()) return
    setDrafting(true)
    setDraftError(null)
    setDraftDone(false)

    const res = await fetch('/api/clients/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: website }),
    })

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setDraftError(body.error ?? 'Could not read that website')
      setDrafting(false)
      return
    }

    if (body.name && !name) setName(body.name)
    if (body.brand_voice) setBrandVoice(body.brand_voice)
    if (Array.isArray(body.content_pillars) && body.content_pillars.length) {
      setPillars(body.content_pillars.join(', '))
    }
    setDraftDone(true)
    setDrafting(false)
  }

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
      ...(client ? {} : { generate_sample: generateSample }),
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
      {!client && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Start from a website
            </CardTitle>
            <CardDescription>
              Paste the brand&apos;s website and we&apos;ll fill in the voice and content pillars for you. You can edit everything after.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="acme.co"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleDraft()
                  }
                }}
              />
              <Button type="button" onClick={handleDraft} disabled={drafting || !website.trim()}>
                {drafting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reading…
                  </>
                ) : (
                  'Auto-fill'
                )}
              </Button>
            </div>
            {draftError && <p className="text-sm text-destructive">{draftError}</p>}
            {draftDone && !draftError && (
              <p className="text-sm text-green-600">
                Filled in below — review and tweak, then create the client.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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

      {!client && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={generateSample}
            onChange={(e) => setGenerateSample(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Generate a sample post right away so I can see the voice in action
        </label>
      )}

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
