'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'react-hot-toast'

export function GeneratePostButton({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)

    const promise = fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Generation failed')
      }
      return res.json()
    })

    toast.promise(
      promise,
      {
        loading: 'Writing a draft (10-20s)...',
        success: 'Draft ready for review.',
        error: (err) => err.message || 'Failed to generate post.',
      },
      {
        duration: 5000,
      }
    )

    try {
      await promise
      router.refresh()
    } catch {
      // Error handled by toast
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        {loading ? 'Generating…' : 'Generate post'}
      </Button>
    </div>
  )
}
