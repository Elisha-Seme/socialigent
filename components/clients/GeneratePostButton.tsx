'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function GeneratePostButton({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Generation failed')
      setLoading(false)
      return
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleGenerate} disabled={loading}>
        <Sparkles className="mr-2 h-4 w-4" />
        {loading ? 'Generating…' : 'Generate post'}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
