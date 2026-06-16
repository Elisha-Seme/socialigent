'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Globe, Send, Check, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScheduleEditor } from '@/components/clients/ScheduleEditor'
import { TelegramConnect } from '@/components/clients/TelegramConnect'
import type { PostingSlot } from '@/lib/types'

export default function OnboardPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1: Brand
  const [website, setWebsite] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftDone, setDraftDone] = useState(false)
  const [name, setName] = useState('')
  const [brandVoice, setBrandVoice] = useState('')
  const [pillars, setPillars] = useState('')

  // Step 2: Schedule
  const [schedule, setSchedule] = useState<PostingSlot[]>([
    { day: 'tuesday', time: '06:00' },
    { day: 'wednesday', time: '06:00' },
    { day: 'thursday', time: '06:00' },
  ])

  // Step 3: After save
  const [clientId, setClientId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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

  const handleSaveAndLaunch = async () => {
    setSaving(true)
    setSaveError(null)

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        brand_voice: brandVoice,
        content_pillars: pillars.split(',').map((p) => p.trim()).filter(Boolean),
        posting_schedule: schedule,
        generate_sample: true,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSaveError(body.error ?? 'Something went wrong')
      setSaving(false)
      return
    }
    setClientId(body.id)
    setStep(3)
    setSaving(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <Link href="/" className="text-xl font-bold">Socialigent</Link>
          <div className="mt-4 flex justify-center gap-2">
            {([1, 2, 3] as const).map((s) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full transition-colors ${
                  s <= step ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Brand */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Tell us about your brand</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This is what the AI uses to write posts that sound like you.
              </p>
            </div>

            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Auto-fill from your website
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="yourcompany.com"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleDraft() }
                    }}
                  />
                  <Button type="button" onClick={handleDraft} disabled={drafting || !website.trim()}>
                    {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fill'}
                  </Button>
                </div>
                {draftError && <p className="text-xs text-destructive">{draftError}</p>}
                {draftDone && (
                  <p className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="h-3 w-3" /> Filled in below — review and tweak.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Brand name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voice">Brand voice</Label>
                <Textarea
                  id="voice"
                  value={brandVoice}
                  onChange={(e) => setBrandVoice(e.target.value)}
                  placeholder="Professional but approachable. Speaks to founders and marketers. Uses plain language, real examples, no buzzwords."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pillars">What do you post about? <span className="text-muted-foreground">(comma-separated)</span></Label>
                <Input
                  id="pillars"
                  value={pillars}
                  onChange={(e) => setPillars(e.target.value)}
                  placeholder="product updates, industry tips, customer stories"
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!name.trim() || !brandVoice.trim()}
              onClick={() => setStep(2)}
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold">How often do you want to post?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The AI will draft posts for each slot. You approve before anything goes live.
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <ScheduleEditor value={schedule} onChange={setSchedule} />
              </CardContent>
            </Card>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={saving}
                onClick={handleSaveAndLaunch}
              >
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up…</>
                ) : (
                  <>Launch <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Connect */}
        {step === 3 && clientId && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">You&apos;re set up!</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect LinkedIn so the AI can publish posts, and Telegram so you can approve them on your phone.
              </p>
            </div>

            <Card>
              <CardContent className="space-y-4 pt-6">
                {/* LinkedIn */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">LinkedIn</p>
                      <p className="text-xs text-muted-foreground">Where posts get published</p>
                    </div>
                  </div>
                  <Button size="sm" asChild>
                    <a href={`/api/linkedin/oauth?clientId=${clientId}`}>Connect</a>
                  </Button>
                </div>

                <div className="border-t" />

                {/* Telegram */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    <div>
                      <p className="text-sm font-medium">Telegram</p>
                      <p className="text-xs text-muted-foreground">Where you approve posts</p>
                    </div>
                  </div>
                  <TelegramConnect clientId={clientId} isConnected={false} />
                </div>
              </CardContent>
            </Card>

            <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
              Skip for now — go to dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
