"use client"

import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'react-hot-toast'

export function PublishButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handlePublish() {
    setLoading(true)
    
    const promise = fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      return data
    })

    toast.promise(promise, {
      loading: 'Publishing to LinkedIn...',
      success: 'Published successfully!',
      error: (err) => err.message || 'Publish failed.',
    })

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
    <div className="space-y-2">
      <Button onClick={handlePublish} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {loading ? 'Publishing…' : 'Publish to LinkedIn'}
      </Button>
    </div>
  )
}
