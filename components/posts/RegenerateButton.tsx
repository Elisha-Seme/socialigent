'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'react-hot-toast'

export function RegenerateButton({ postId }: { postId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleRegenerate = async () => {
    setLoading(true)

    const promise = fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Regeneration failed')
      }
      return res.json()
    })

    toast.promise(
      promise,
      {
        loading: 'Regenerating post with rejection feedback (10-15s)...',
        success: 'Post regenerated successfully! Sent to Telegram.',
        error: (err) => err.message || 'Failed to regenerate post.',
      },
      {
        duration: 5000,
      }
    )

    try {
      await promise
      router.refresh()
    } catch {
      // Handled by toast
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleRegenerate} disabled={loading} variant="outline" className="w-full sm:w-auto">
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-2 h-4 w-4" />
      )}
      {loading ? 'Regenerating…' : 'Regenerate post'}
    </Button>
  )
}
