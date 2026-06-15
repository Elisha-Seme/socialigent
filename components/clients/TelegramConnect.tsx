'use client'

import { useState } from 'react'
import { Send, Loader2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function TelegramConnect({
  clientId,
  isConnected,
}: {
  clientId: string
  isConnected: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/telegram/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error ?? 'Could not create a connect link')
      setLoading(false)
      return
    }
    setLink(body.link)
    setLoading(false)
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Send className="h-4 w-4" /> Telegram
        </span>
        <span className="flex items-center gap-2">
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Connected' : 'Off'}
          </Badge>
          <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isConnected ? (
              'Reconnect'
            ) : (
              'Connect'
            )}
          </Button>
        </span>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {link && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Send this link to whoever should approve posts. They open it, tap{' '}
            <span className="font-medium">Start</span>, and this chat connects automatically.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer">
                Open in Telegram
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1.5">{copied ? 'Copied' : 'Copy link'}</span>
            </Button>
          </div>
          <p className="break-all text-[10px] text-muted-foreground">{link}</p>
        </div>
      )}
    </div>
  )
}
