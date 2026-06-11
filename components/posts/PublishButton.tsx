"use client"

import { useState } from 'react'
import { Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function PublishButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handlePublish() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handlePublish} disabled={loading}>
        <Send className="mr-2 h-4 w-4" />
        {loading ? 'Publishing…' : 'Publish to LinkedIn'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
